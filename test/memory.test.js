import { describe, it, expect, vi } from 'vitest';
import { createCore } from './helpers.js';

describe('Memory', () => {
  it('reads back what was written to RAM', () => {
    const { memory } = createCore();

    memory.write(0x1234, 0xab);

    expect(memory.read(0x1234)).toBe(0xab);
  });

  it('keeps the RAM pages independent', () => {
    const { memory } = createCore();

    memory.write(0x0100, 0x11); // page 0
    memory.write(0x4100, 0x22); // page 1
    memory.write(0x8100, 0x33); // page 2

    expect(memory.read(0x0100)).toBe(0x11);
    expect(memory.read(0x4100)).toBe(0x22);
    expect(memory.read(0x8100)).toBe(0x33);
  });

  it('does not write into the ROM page', () => {
    const { memory } = createCore();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    memory.write(0xc000, 0x11);

    expect(memory.read(0xc000)).toBe(0x00);
    log.mockRestore();
  });

  it('restart() clears the RAM pages', () => {
    const { memory } = createCore();
    memory.write(0x0100, 0x55);

    memory.restart();

    expect(memory.read(0x0100)).toBe(0x00);
  });

  it('maps the ROM into all four banks until the first I/O write (P2.17)', () => {
    const { io, memory } = createCore();
    const rom = memory.get_rom_page();
    const banks = [0x0000, 0x4000, 0x8000, 0xc000];
    const read = () => banks.map((addr) => memory.read(addr));

    rom.burn(0x0000, 0xc3); // the reset vector of rom-1990.bin
    io.restart(); // RESET arms the initial-reset flip-flop

    expect(read()).toEqual([0xc3, 0xc3, 0xc3, 0xc3]);

    // A write is lost in that state: the ROM is mapped and the EPROM is not writable.
    memory.write(0x0000, 0x11);

    // The ROM's own first instruction: a dummy write to a port that selects no device.
    io.output(0x00, 0x00);

    expect(read()).toEqual([0x00, 0x00, 0x00, 0xc3]);
  });

  it('boots from the reset vector instead of running through empty RAM (P2.17)', () => {
    const { io, memory, cpu } = createCore();
    const rom = memory.get_rom_page();

    // rom-1990.bin: 0x0000 is `JMP 0xE000`, and 0xE000 (ROM offset 0x2000) is `OUT 00H`.
    rom.burn(0x0000, 0xc3);
    rom.burn(0x0001, 0x00);
    rom.burn(0x0002, 0xe0);
    rom.burn(0x2000, 0xd3);
    rom.burn(0x2001, 0x00);

    io.restart();
    cpu.restart();

    cpu.instruction(); // JMP 0xE000 - a low address answers the ROM, not empty RAM
    expect(cpu.pc).toBe(0xe000);

    cpu.instruction(); // the dummy OUT clears the flip-flop on its own

    expect(io.initial_rom_mapping).toBe(false);
    expect(memory.read(0x0000)).toBe(0x00); // the RAM is back
  });

  it('transfer() copies an Array and returns the new offset', () => {
    const { memory } = createCore();

    const offset = memory.transfer(0x0100, 0x0102, [1, 2, 3], 0);

    expect(offset).toBe(3);
    expect([memory.read(0x0100), memory.read(0x0101), memory.read(0x0102)]).toEqual([1, 2, 3]);
  });

  it('transfer() copies a DataView honouring the offset', () => {
    const { memory } = createCore();
    const data = new DataView(new Uint8Array([9, 8, 7, 6]).buffer);

    const offset = memory.transfer(0x0200, 0x0201, data, 1);

    expect(offset).toBe(3);
    expect([memory.read(0x0200), memory.read(0x0201)]).toEqual([8, 7]);
  });

  it('transfer() throws a TypeError for an unsupported data type', () => {
    const { memory } = createCore();

    expect(() => memory.transfer(0x0100, 0x0101, 'nope')).toThrow(TypeError);
  });

  it('transfer() throws a RangeError on bad bounds or overflow', () => {
    const { memory } = createCore();

    expect(() => memory.transfer(0x0200, 0x0100, [1])).toThrow(RangeError);
    expect(() =>
      memory.transfer(0x0100, 0x01ff, new DataView(new Uint8Array(4).buffer), 0)
    ).toThrow(RangeError);
  });

  it('get_state() dumps RAM plus video memory', () => {
    const { memory } = createCore();

    expect(memory.get_state()).toHaveLength(0x10000 + 0x4000);
  });

  it('exposes a writable video-memory page', () => {
    const { memory } = createCore();
    const vram = memory.get_vram_page();

    vram.write(0x4000, 0x5a);

    expect(vram.read(0x4000)).toBe(0x5a);
  });

  it('builds the page layout for every supported memory map', () => {
    const { memory } = createCore();

    // Three RAM banks + ROM + video RAM; extended maps add four pages per bank.
    expect(memory.createMemoryPages(80)).toHaveLength(5);
    expect(memory.createMemoryPages(144)).toHaveLength(9);
    expect(memory.createMemoryPages(256)).toHaveLength(21);

    // Legacy aliases resolve to the standard map.
    expect(memory.createMemoryPages('default')).toHaveLength(5);
    expect(memory.createMemoryPages('standard')).toHaveLength(5);

    expect(() => memory.createMemoryPages(42)).toThrow();
  });
});
