import { describe, it, expect } from 'vitest';
import { createCore, load } from './helpers.js';

describe('I8080', () => {
  it('MVI A,d8 loads an immediate (7 cycles)', () => {
    const { cpu, memory } = createCore();
    load(memory, [0x3e, 0x42]); // MVI A,0x42

    const cycles = cpu.instruction();

    expect(cpu.get_state().AF >> 8).toBe(0x42);
    expect(cycles).toBe(7);
  });

  it('LXI B,d16 loads a register pair', () => {
    const { cpu, memory } = createCore();
    load(memory, [0x01, 0x34, 0x12]); // LXI B,0x1234

    cpu.instruction();

    expect(cpu.get_state().BC).toBe(0x1234);
    expect(cpu.get_state().PC).toBe(3);
  });

  it('MOV copies between registers', () => {
    const { cpu, memory } = createCore();
    load(memory, [0x3e, 0x77, 0x47]); // MVI A,0x77 ; MOV B,A

    cpu.instruction();
    cpu.instruction();

    expect((cpu.get_state().BC >> 8) & 0xff).toBe(0x77);
  });

  it('ADI sets the carry flag on overflow', () => {
    const { cpu, memory } = createCore();
    load(memory, [0x3e, 0xff, 0xc6, 0x02]); // MVI A,0xff ; ADI 0x02

    cpu.instruction();
    cpu.instruction();

    const state = cpu.get_state();
    expect(state.AF >> 8).toBe(0x01); // A wrapped around
    expect(state.AF & 0x01).toBe(1); // carry
  });

  it('INR sets the zero flag but preserves carry', () => {
    const { cpu, memory } = createCore();
    load(memory, [0x3e, 0xff, 0xc6, 0x02, 0x3c]); // MVI A,0xff ; ADI 2 ; INR A

    cpu.instruction();
    cpu.instruction();
    cpu.instruction();

    const state = cpu.get_state();
    expect(state.AF >> 8).toBe(0x02);
    expect(state.AF & 0x01).toBe(1); // carry preserved by INR
  });

  it('XRA A clears the accumulator and sets zero/parity', () => {
    const { cpu, memory } = createCore();
    load(memory, [0x3e, 0x55, 0xaf]); // MVI A,0x55 ; XRA A

    cpu.instruction();
    cpu.instruction();

    const state = cpu.get_state();
    expect(state.AF >> 8).toBe(0x00);
    expect(state.AF & 0x40).toBe(0x40); // zero flag
  });

  it('JMP sets the program counter', () => {
    const { cpu, memory } = createCore();
    load(memory, [0xc3, 0x34, 0x12]);

    cpu.instruction();

    expect(cpu.get_state().PC).toBe(0x1234);
  });

  it('CALL/RET round-trips through the stack', () => {
    const { cpu, memory } = createCore();
    cpu.set_state({ SP: 0x8000 });
    load(memory, [0xcd, 0x10, 0x00], 0x0000); // CALL 0x0010
    load(memory, [0xc9], 0x0010); // RET

    cpu.instruction(); // CALL

    expect(cpu.get_state().PC).toBe(0x0010);
    expect(cpu.get_state().SP).toBe(0x7ffe);
    expect(memory.read(0x7ffe)).toBe(0x03); // return address (low)
    expect(memory.read(0x7fff)).toBe(0x00); // return address (high)

    cpu.instruction(); // RET

    expect(cpu.get_state().PC).toBe(0x0003);
    expect(cpu.get_state().SP).toBe(0x8000);
  });

  it('PUSH/POP move a register pair through the stack', () => {
    const { cpu, memory } = createCore();
    cpu.set_state({ SP: 0x8000, B: 0x12, C: 0x34 });
    load(memory, [0xc5, 0xd1]); // PUSH B ; POP D

    cpu.instruction();
    cpu.instruction();

    expect(cpu.get_state().DE).toBe(0x1234);
    expect(cpu.get_state().SP).toBe(0x8000);
  });

  it('run() executes whole frames and advances the clock', () => {
    const { cpu, memory, clock } = createCore();
    load(memory, [0x3e, 0x01, 0x3e, 0x02, 0x3e, 0x03]); // three MVI A

    const cycles = cpu.run(14);

    expect(cycles).toBe(14); // exactly two 7-cycle instructions
    expect(cpu.get_state().PC).toBe(4);
    expect(clock.totalCycles).toBe(14);
  });

  it('halt() stops instruction execution until restart', () => {
    const { cpu, memory } = createCore();
    load(memory, [0x3e, 0x42]);

    cpu.halt(true);
    cpu.instruction(); // executed as NOP (0x00) while halted

    expect(cpu.get_state().PC).toBe(0x0000);
    expect(cpu.get_state().AF >> 8).toBe(0x00);
  });

  describe('opcode fetch and traps', () => {
    const TRAP_ADDR = 0x4000; // RAM page, so tests can seed the shadowed byte

    /** `Traps` keeps its handlers in a plain Map; there is no public setter. */
    const installTrap = (traps, addr, handler) => traps.traps.set(addr, handler);

    it('fetches the opcode from memory when no trap is installed', () => {
      const { cpu, memory } = createCore();
      memory.write(TRAP_ADDR, 0x3c); // INR A
      cpu.pc = TRAP_ADDR;

      expect(cpu.instruction()).toBe(5);
      expect(cpu.a()).toBe(1);
      expect(cpu.pc).toBe(TRAP_ADDR + 1);
    });

    it('executes the opcode supplied by a trap and ignores the memory byte', () => {
      const { cpu, memory, traps } = createCore();
      memory.write(TRAP_ADDR, 0x76); // HLT - must never run
      installTrap(traps, TRAP_ADDR, () => 0x3c); // INR A
      cpu.pc = TRAP_ADDR;

      expect(cpu.instruction()).toBe(5);
      expect(cpu.a()).toBe(1);
      expect(cpu.pc).toBe(TRAP_ADDR + 1);
      expect(cpu.is_halted).toBe(false);
    });

    it('executes NOP when a trap returns NOPE_OPTCODE (async file load pending)', () => {
      const { cpu, memory, traps } = createCore();
      memory.write(TRAP_ADDR, 0x76); // HLT - must never run
      installTrap(traps, TRAP_ADDR, () => cpu.getNopeOptcode());
      cpu.pc = TRAP_ADDR;

      expect(cpu.instruction()).toBe(4); // NOP
      expect(cpu.pc).toBe(TRAP_ADDR + 1);
      expect(cpu.is_halted).toBe(false);
    });

    it('falls back to the memory byte when a trap returns UNDEF_OPTCODE', () => {
      const { cpu, memory, traps } = createCore();
      memory.write(TRAP_ADDR, 0x3c); // INR A
      installTrap(traps, TRAP_ADDR, () => cpu.getUndefOptcode());
      cpu.pc = TRAP_ADDR;

      expect(cpu.instruction()).toBe(5);
      expect(cpu.a()).toBe(1);
      expect(cpu.pc).toBe(TRAP_ADDR + 1);
    });

    it('falls back to the memory byte when a trap returns no opcode at all', () => {
      const { cpu, memory, traps } = createCore();
      memory.write(TRAP_ADDR, 0x3c); // INR A
      installTrap(traps, TRAP_ADDR, () => undefined);
      cpu.pc = TRAP_ADDR;

      expect(cpu.instruction()).toBe(5);
      expect(cpu.a()).toBe(1);
      expect(cpu.pc).toBe(TRAP_ADDR + 1);
    });

    it('can never fetch the 0x100 sentinel as an opcode', () => {
      const { cpu, memory, traps } = createCore();
      installTrap(traps, TRAP_ADDR, () => cpu.getUndefOptcode());

      // The sentinel is 0x100, while a memory byte is always 0..255 (Uint8Array),
      // so the fallback fetch always terminates with a real opcode.
      expect(cpu.getUndefOptcode()).toBe(0x100);
      memory.write(TRAP_ADDR, cpu.getUndefOptcode()); // stored as 0x00
      expect(memory.read(TRAP_ADDR)).toBe(0x00);

      cpu.pc = TRAP_ADDR;

      expect(cpu.instruction()).toBe(4); // NOP
      expect(cpu.pc).toBe(TRAP_ADDR + 1);
    });

    it('lets a real trap handler jump and delegate the fetch back to memory', () => {
      const { cpu, traps } = createCore();
      traps.activate('default', { cpu });

      expect(traps.has(0xe55e)).toBe(true);

      cpu.pc = 0xe55e; // CLOAD (2): jumps to 0xe561 and returns UNDEF_OPTCODE
      cpu.instruction();

      // The shortcut sets pc and delegates the fetch, so the byte at the jump
      // target is fetched (unloaded ROM reads as NOP) and pc lands past it.
      expect(cpu.pc).toBe(0xe562);
    });
  });
});
