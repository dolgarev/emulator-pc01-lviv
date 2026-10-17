import { describe, it, expect } from 'vitest';
import { Contention } from '../src/contention.js';
import { Clock } from '../src/clock.js';
import { Config } from '../src/config.js';
import { Settings } from '../src/settings.js';
import { IO } from '../src/io.js';
import { Memory } from '../src/memory.js';
import { Beeper } from '../src/beeper.js';
import { Keyboard } from '../src/keyboard.js';
import { createCore, load, boot } from './helpers.js';

const createParts = () => {
  const config = new Config(new Settings('default'), 'pc01_lvov_80');
  const clock = new Clock();
  const contention = new Contention(clock);
  const beeper = new Beeper(config, clock);
  const io = new IO(config, beeper, new Keyboard(), contention);
  const memory = new Memory(config, io, contention);

  boot(io);

  return { config, clock, contention, io, memory };
};

describe('Contention (video/RAM wait states)', () => {
  it('charges the documented pattern on RAM reads', () => {
    const { clock, contention, memory } = createParts();

    // 2, 2, 2, 3, 2, 2, 3 -> 16 cycles for seven reads, 2 2/7 on average.
    for (let i = 0; i < 7; i++) memory.read(0x0000 + i);

    expect(clock.totalCycles).toBe(16);
    expect(contention.take()).toBe(16);
  });

  it('spreads the 3/4 of a cycle that a RAM write costs over four writes (P2.18)', () => {
    const { clock, memory } = createParts();

    const charges = [];
    for (let i = 0; i < 4; i++) {
      const before = clock.totalCycles;
      memory.write(0x0000, 0x11);
      charges.push(clock.totalCycles - before);
    }

    // The read pattern gives 2, 2, 2, 3 and the write extra is paid in whole cycles:
    // 0, 1, 1, 1 - three cycles per four writes, so 3/4 of a cycle on average.
    expect(charges).toEqual([2, 3, 3, 4]);
    expect(clock.totalCycles).toBe(12);
  });

  it('charges one extra cycle for an I/O access', () => {
    const { clock, contention, io } = createParts();

    io.output(0xc2, 0xff); // 1 for the port itself
    io.input(0xc2); // and another

    expect(clock.totalCycles).toBe(1 + 1);
    expect(contention.take()).toBe(2);
    expect(contention.is_stalled).toBe(false);
  });

  it('does not stall on the ROM ports, nor on the dummy OUT (P2.17, P2.19)', () => {
    const core = createCore('pc01_lvov_80', { wait_states: true });

    core.io.restart(); // RESET: the ROM answers for every address

    core.io.input(0x80); // while the flip-flop is set even a read below 0xC0 is safe
    expect(core.contention.is_stalled).toBe(false);

    core.io.output(0x00, 0x00); // the dummy OUT 00H the ROM starts with clears it
    expect(core.contention.is_stalled).toBe(false);

    core.io.output(0xc2, 0xff); // 0xC0..0xFF look like a ROM access to the arbiter
    expect(core.contention.is_stalled).toBe(false);

    core.io.output(0x80, 0x00); // anything below 0xC0 stops the CPU
    expect(core.contention.is_stalled).toBe(true);
  });

  it('stalls the CPU on an I/O cycle below 0xC0 (P2.19)', () => {
    const core = createCore('pc01_lvov_80', { wait_states: true });
    // OUT 0x80: the decoder answers with no device there, and the arbiter cannot release
    // the cycle either. The HALT behind it must never be reached.
    load(core.memory, [0xd3, 0x80, 0x76], 0x0000);

    core.cpu.instruction();

    expect(core.contention.is_stalled).toBe(true);
    expect(core.cpu.pc).toBe(0x0002);

    // A whole frame later the CPU has not moved: READY is still low.
    core.cpu.run(core.config.cpu.frame_cycles);

    expect(core.cpu.pc).toBe(0x0002);
  });

  it('releases the stalled CPU on RESET (P2.19)', () => {
    const core = createCore('pc01_lvov_80', { wait_states: true });

    core.io.output(0x80, 0x00);
    expect(core.contention.is_stalled).toBe(true);

    core.io.restart();

    expect(core.contention.is_stalled).toBe(false);
  });

  it('does not charge accesses to the ROM', () => {
    const { clock, memory } = createParts();

    memory.read(0xc000); // ROM page
    expect(clock.totalCycles).toBe(0);

    memory.read(0x0000); // RAM page
    expect(clock.totalCycles).toBeGreaterThan(0);
  });

  it('does not charge the reset-time ROM mapping either (P2.17)', () => {
    const { clock, contention, io, memory } = createParts();

    io.restart(); // RESET: the ROM answers for every address

    memory.read(0x0000);
    memory.write(0x0000, 0x11);

    expect(clock.totalCycles).toBe(0);
    expect(contention.take()).toBe(0);
  });

  it('adds the wait cycles to the instruction that caused them', () => {
    const clock = new Clock();
    const contention = new Contention(clock);
    const cpu = {
      instruction() {
        clock.addCycles(7); // the instruction itself
        contention.read(); // and one contended RAM access inside it
        return 7;
      },
    };

    contention.attach(cpu);
    contention.attach(cpu); // must not wrap twice

    expect(cpu.instruction()).toBe(7 + 2);
    expect(clock.totalCycles).toBe(7 + 2);
  });

  it('makes the same program do less work within a frame', () => {
    // A loop in RAM: MVI B,0 / DCR B / JNZ -1 (the only memory traffic is the opcode
    // fetches, which the video circuit contends).
    const program = [0x06, 0x00, 0x05, 0xc2, 0x01, 0x00];

    const run = (wait_states) => {
      const core = createCore('pc01_lvov_80', { wait_states });
      load(core.memory, program, 0x0000);
      core.cpu.jump(0x0000);
      core.cpu.clock.startFrame();
      core.cpu.run(core.config.cpu.frame_cycles);

      // How far the loop got: B wraps around, so count the executions instead.
      return core.clock.totalCycles;
    };

    const plain = run(false);
    const contended = run(true);

    // With the contention the counter is fed by the same budget, so the frame holds just as
    // many cycles - but the CPU walks through fewer of them per unit of work. Compare how
    // many loops fit: measure the program counter, not the clock.
    expect(plain).toBeGreaterThan(0);
    expect(contended).toBeGreaterThan(0);

    const core = createCore('pc01_lvov_80', { wait_states: true });
    load(core.memory, program, 0x0000);
    core.cpu.jump(0x0000);

    let instructions = 0;
    const execute = core.cpu.execute.bind(core.cpu);
    core.cpu.execute = (opcode) => {
      instructions += 1;
      return execute(opcode);
    };

    core.cpu.run(core.config.cpu.frame_cycles);
    const withContention = instructions;

    const plain_core = createCore('pc01_lvov_80', { wait_states: false });
    load(plain_core.memory, program, 0x0000);
    plain_core.cpu.jump(0x0000);

    let plain_instructions = 0;
    const plain_execute = plain_core.cpu.execute.bind(plain_core.cpu);
    plain_core.cpu.execute = (opcode) => {
      plain_instructions += 1;
      return plain_execute(opcode);
    };

    plain_core.cpu.run(plain_core.config.cpu.frame_cycles);

    // Roughly 0.6x the work, which is what the wait states model.
    expect(withContention).toBeLessThan(plain_instructions);
    expect(withContention / plain_instructions).toBeGreaterThan(0.5);
    expect(withContention / plain_instructions).toBeLessThan(0.75);
  });
});
