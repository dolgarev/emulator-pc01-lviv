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

  it('set_snapshot() restores the low RAM after a reset (P2.17)', () => {
    const { storage, io, memory } = createCore();

    // The memory image starts right after the 17-byte header, so byte 17 is 0x0000.
    const snapshot = Uint8Array.from(storage.get_snapshot());
    snapshot[17] = 0xc9;

    io.restart(); // RESET: the ROM would answer for 0x0000 right now

    storage.set_snapshot(new DataView(snapshot.buffer));

    // The snapshot is a machine that has booted, so the ROM is back in the top bank.
    expect(memory.read(0x0000)).toBe(0xc9);
  });

  it('does not stall the machine when a snapshot is loaded (P2.19)', () => {
    const { storage, contention } = createCore('pc01_lvov_80', { wait_states: true });

    const snapshot = Uint8Array.from(storage.get_snapshot());

    // The replay walks every port, the deadlocking ones below 0xC0 included.
    storage.set_snapshot(new DataView(snapshot.buffer));

    expect(contention.is_stalled).toBe(false);
  });

  // The port 0xF0 latch is what carries the video modes (P2.13) and the extended RAM
  // banks, and Storage used to replay the ports through IO.input()/IO.output(), i.e.
  // through the address decoding (P2.14).
  it('round-trips the port 0xF0 latch of the machine with the upgrades', () => {
    const { storage, io } = createCore('pc01_lvov_80_fixed');

    io.output(io.EXTENDED_MODE_PORT, io.HIGH_RESOLUTION_BIT | io.BLANK_SCREEN_BIT);

    const snapshot = storage.get_snapshot();
    const data = new DataView(Uint8Array.from(snapshot).buffer);

    io.output(io.EXTENDED_MODE_PORT, 0x00);

    storage.set_snapshot(data);

    expect(io.ports[io.EXTENDED_MODE_PORT]).toBe(io.HIGH_RESOLUTION_BIT | io.BLANK_SCREEN_BIT);
  });

  it('forces the default palette when a snapshot carries none', () => {
    const { storage, io } = createCore();
    const size = 17 + 0x14000 + 0x100 + 12;
    const data = new DataView(new Uint8Array(size).buffer);
    const base = 0x11 + 0x14000;

    // A dump written by an older version fills the whole block with 0xFF (the value a
    // write-only port read as), and the A2/A3 mirrors overwrite the palette with it.
    for (let port = 0xc0; port <= 0xcf; port++) {
      data.setUint8(base + port, 0xff);
    }

    storage.set_snapshot(data);

    expect(io.ports[io.PALETTE_PORT]).toBe(0x8f);
  });

  // A restore is a restart of the run, and the ports keep the level the emitter line had:
  // the beeper must take it instead of assuming low, or its first change was swallowed and
  // the run before it was emitted at the wrong level (P3.25).
  it('restores the emitter level a snapshot carries (P3.25)', () => {
    const { storage, io, beeper } = createCore();

    // PB7 = 1 selects the PC0 mode and PC0 = 1 drives the line high.
    io.write_port(io.PALETTE_PORT, 0x8f);
    io.write_port(io.MEDIA_PORT, 0x01);
    expect(io.beeper_level).toBe(1);

    const snapshot = new DataView(Uint8Array.from(storage.get_snapshot()).buffer);

    // Scramble the live machine: the line goes low.
    io.write_port(io.MEDIA_PORT, 0x00);
    expect(io.beeper_level).toBe(0);

    storage.set_snapshot(snapshot);

    expect(io.beeper_level).toBe(1);
    expect(beeper.prev_beeper_state).toBe(1); // the beeper follows the replayed ports
    expect(beeper.wave_level).toBe(1); // ... and continues the run at that level
    expect(beeper.prev_change_offset).toBe(0); // measured from the new frame boundary
  });

  it('set_e3_snapshot() publishes the level of the restored ports (P3.25)', () => {
    const { storage, io, beeper } = createCore();
    const data = new DataView(new Uint8Array(0x20000).buffer);

    // Header + low RAM + ROM + the 0x29 gap + VRAM: the ports follow this absolute offset.
    const ports = 0x240 + 0xc000 + 0x4000 + 0x29 + 0x4000;
    data.setUint8(ports + 0x26, 0x80); // PPI1 port B: PB7 high ...
    data.setUint8(ports + 0x2a, 0x00); // ... and PC0 low: the emitter line is low

    storage.set_e3_snapshot(data);

    expect(io.beeper_level).toBe(0);
    expect(beeper.prev_beeper_state).toBe(0);
    expect(beeper.wave_level).toBe(0);
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

  // A short file used to throw "Offset is outside the bounds of the DataView" from the
  // middle of the restore, sometimes after half the machine had been overwritten (P2.21).
  it('set_snapshot() rejects a truncated image before touching the machine', () => {
    const { storage, memory } = createCore();
    memory.write(0x1234, 0x5a);

    const short = new DataView(new Uint8Array(0x100).buffer);

    expect(() => storage.set_snapshot(short)).toThrow(/truncated/);
    expect(memory.read(0x1234)).toBe(0x5a);
  });

  it('set_e3_snapshot() rejects a truncated image', () => {
    const { storage } = createCore();
    const short = new DataView(new Uint8Array(0x240 + 0x100).buffer);

    expect(() => storage.set_e3_snapshot(short)).toThrow(/truncated/);
  });

  it('bload() rejects a 10-byte file without throwing', () => {
    const { storage } = createCore();
    const data = new DataView(new Uint8Array(10).buffer);
    data.setUint8(0x09, 0xd0);

    expect(() => storage.bload(data)).not.toThrow();
    expect(storage.bload(data)).toBe(false);
  });

  it('cload() rejects a file shorter than its header without throwing', () => {
    const { storage } = createCore();
    const data = new DataView(new Uint8Array(10).buffer);
    data.setUint8(0x09, 0xd3);

    expect(() => storage.cload(data)).not.toThrow();
    expect(storage.cload(data)).toBe(false);
  });

  it('bload() rejects a body shorter than the declared range', () => {
    const { storage } = createCore();
    const data = new DataView(new Uint8Array(0x18).buffer);
    data.setUint8(0x09, 0xd0);
    data.setUint16(0x10, 0x8000, true); // begin
    data.setUint16(0x12, 0x8003, true); // end
    data.setUint16(0x14, 0x8000, true); // start

    expect(storage.bload(data)).toBe(false);
  });
});
