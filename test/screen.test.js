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
