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
});
