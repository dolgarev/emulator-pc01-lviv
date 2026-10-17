import { describe, it, expect } from 'vitest';
import { createCore } from './helpers.js';
import { Screen } from '../src/screen.js';

describe('Screen', () => {
  it('parse_color permutes the video-memory byte bits', () => {
    const { screen } = createCore();

    expect(screen.parse_color(0x00)).toBe(0x00);
    expect(screen.parse_color(0xff)).toBe(0xff);
    expect(screen.parse_color(0x01)).toBe(0x40);
    expect(screen.parse_color(0x02)).toBe(0x10);
    expect(screen.parse_color(0x80)).toBe(0x02);
  });

  it('precomputes cache_color from parse_color for every byte', () => {
    const { screen } = createCore();

    for (let byte = 0; byte < 0x100; byte++) {
      expect(Screen.cache_color[byte]).toBe(screen.parse_color(byte));
    }
  });

  it('compute_color_index stays within the palette LUT range', () => {
    const { screen } = createCore();

    for (let palette = 0; palette < 0x80; palette++) {
      for (let color = 0; color < 4; color++) {
        const index = screen.compute_color_index(color, palette);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(8);
      }
    }
  });

  it('draw() returns a pixel buffer only when video memory changed', () => {
    const { screen, memory } = createCore();
    const vram = memory.get_vram_page();

    const first = screen.draw();

    expect(first).toBeInstanceOf(Uint32Array);
    expect(first).toHaveLength(0x10000); // 256 x 256
    expect(first[0] >>> 24).toBe(0xff); // opaque

    // Nothing changed -> no new frame is produced.
    expect(screen.draw()).toBeNull();

    vram.write(0x4000, 0x5a);

    expect(screen.draw()).toBeInstanceOf(Uint32Array);
  });

  it('change_palette updates the palette port', () => {
    const { screen, io } = createCore();
    const before = io.ports[io.PALETTE_PORT] & 0x7f;

    screen.change_palette(1);

    expect(io.ports[io.PALETTE_PORT] & 0x7f).not.toBe(before);
  });
});

// Port 0xF0 is the register the PK-02 upgrades hang on the machine: the extended
// RAM banks (memory.js) and, for the video output, the 512×256 mode and the
// blanking (CODE_REVIEW.md P2.13).
describe('Screen high resolution and blanking (P2.13)', () => {
  const set_extended = (io, bits) => {
    io.ports[io.EXTENDED_MODE_PORT] = bits;
  };

  it('switches the framebuffer to 512×256', () => {
    const { screen, io } = createCore();

    expect(screen.width).toBe(256);

    set_extended(io, io.HIGH_RESOLUTION_BIT);

    const frame = screen.draw();

    expect(screen.width).toBe(512);
    expect(screen.height).toBe(256);
    expect(frame).toHaveLength(512 * 256);
  });

  it('draws one bit per dot, bit 7 leftmost, in 512×256', () => {
    const { screen, io, memory } = createCore();
    const vram = memory.get_vram_page();
    const rgb = Screen.cache_rgb[io.ports[io.PALETTE_PORT] & 0x7f];
    const [off, , , on] = Array.from(rgb); // only the first and the last colour survive

    set_extended(io, io.HIGH_RESOLUTION_BIT);
    screen.draw();

    vram.write(0x4000, 0x80); // bit 7 -> the leftmost dot of the byte
    vram.write(0x4001, 0x01); // bit 0 -> its rightmost dot

    const frame = screen.draw();

    expect(Array.from(frame.slice(0, 16))).toEqual([
      on,
      off,
      off,
      off,
      off,
      off,
      off,
      off,
      off,
      off,
      off,
      off,
      off,
      off,
      off,
      on,
    ]);

    // 64 bytes per line: the second line starts at dot 512.
    vram.write(0x4040, 0xff);

    const next = screen.draw();

    expect(next[512]).toBe(on);
    expect(next[519]).toBe(on);
    expect(next[511]).toBe(off);
  });

  it('blanks the screen to the background colour without touching the video memory', () => {
    const { screen, io, memory } = createCore();
    const vram = memory.get_vram_page();
    const rgb = Screen.cache_rgb[io.ports[io.PALETTE_PORT] & 0x7f];

    vram.write(0x4000, 0xff);
    screen.draw();

    set_extended(io, io.BLANK_SCREEN_BIT);

    const frame = screen.draw();

    expect(frame).toHaveLength(0x10000);
    expect(Array.from(frame).every((dot) => dot === rgb[0])).toBe(true);
    expect(vram.read(0x4000)).toBe(0xff);

    // The blanking is a steady state: nothing changed, nothing to repaint.
    expect(screen.draw()).toBeNull();
  });

  it('blanks the 512×256 screen as well', () => {
    const { screen, io } = createCore();
    const rgb = Screen.cache_rgb[io.ports[io.PALETTE_PORT] & 0x7f];

    set_extended(io, io.HIGH_RESOLUTION_BIT | io.BLANK_SCREEN_BIT);

    const frame = screen.draw();

    expect(frame).toHaveLength(512 * 256);
    expect(Array.from(frame).every((dot) => dot === rgb[0])).toBe(true);
  });

  it('repaints the picture when the blanking goes away', () => {
    const { screen, io, memory } = createCore();
    const vram = memory.get_vram_page();
    const rgb = Screen.cache_rgb[io.ports[io.PALETTE_PORT] & 0x7f];

    vram.write(0x4000, 0xff);
    set_extended(io, io.BLANK_SCREEN_BIT);
    screen.draw();

    set_extended(io, 0);

    const frame = screen.draw();

    expect(frame).toHaveLength(0x10000);
    expect(Array.from(frame.slice(0, 4))).toEqual([rgb[3], rgb[3], rgb[3], rgb[3]]);
  });

  it('returns to the 4 dots per byte mapping', () => {
    const { screen, io, memory } = createCore();
    const vram = memory.get_vram_page();
    const rgb = Screen.cache_rgb[io.ports[io.PALETTE_PORT] & 0x7f];

    set_extended(io, io.HIGH_RESOLUTION_BIT);
    screen.draw();

    vram.write(0x4000, 0xc0); // bits 7 and 6 -> dots 0 and 1

    set_extended(io, 0);

    const frame = screen.draw();

    expect(frame).toHaveLength(0x10000);
    // 4 dots per byte again: (bit 7, bit 3) and (bit 6, bit 2) select the colours.
    expect(Array.from(frame.slice(0, 4))).toEqual([rgb[2], rgb[2], rgb[0], rgb[0]]);
  });
});
