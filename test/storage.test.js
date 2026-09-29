import { describe, it, expect } from 'vitest';
import { createCore } from './helpers.js';

describe('Storage', () => {
  it('get_snapshot() produces the expected size', () => {
    const { storage } = createCore();

    // 17-byte header + 0x14000 memory + 0x100 ports + 12 bytes of CPU state
    expect(storage.get_snapshot()).toHaveLength(17 + 0x14000 + 0x100 + 12);
  });

  it('round-trips memory and CPU state through set_snapshot()', () => {
    const { storage, memory, cpu } = createCore();

    memory.write(0x0100, 0x42);
    memory.write(0x8100, 0x99);
    cpu.set_state({ A: 0x12, F: 0x02, B: 0x34, C: 0x56, PC: 0x1234, SP: 0x8000 });

    const snapshot = storage.get_snapshot();
    const data = new DataView(Uint8Array.from(snapshot).buffer);

    // Scramble the live state, then restore it from the snapshot.
    memory.write(0x0100, 0x00);
    memory.write(0x8100, 0x00);
    cpu.set_state({ A: 0, F: 0, B: 0, C: 0, PC: 0x0000, SP: 0x0000 });

    storage.set_snapshot(data);

    expect(memory.read(0x0100)).toBe(0x42);
    expect(memory.read(0x8100)).toBe(0x99);

    const state = cpu.get_state();
    expect(state.PC).toBe(0x1234);
    expect(state.SP).toBe(0x8000);
    expect(state.BC).toBe(0x3456);
    expect(state.AF >> 8).toBe(0x12);
  });

  it('set_snapshot() rejects a non-DataView argument', () => {
    const { storage } = createCore();

    expect(() => storage.set_snapshot('nope')).toThrow();
  });

  it('bload()/cload() reject files with the wrong type byte', () => {
    const { storage } = createCore();
    const data = new DataView(new Uint8Array(0x20).buffer);
    data.setUint8(0x09, 0x00);

    expect(storage.bload(data)).toBe(false);
    expect(storage.cload(data)).toBe(false);
  });

  it('set_e3_snapshot() loads an Emulator-3000 image', () => {
    const { storage, cpu } = createCore();
    const data = new DataView(new Uint8Array(0x20000).buffer);
    data.setUint8(0x1ba, 0x12); // A
    data.setUint16(0x1e1, 0x1234, true); // PC

    storage.set_e3_snapshot(data);

    const state = cpu.get_state();
    expect(state.AF >> 8).toBe(0x12);
    expect(state.PC).toBe(0x1234);
  });
});
