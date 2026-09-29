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
});
