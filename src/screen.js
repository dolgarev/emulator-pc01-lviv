import { Config } from './config.js';
import { IO } from './io.js';
import { Memory } from './memory.js';
import { assertInstance } from './utils/assert.js';

const VRAM_SIZE = 0x4000;
const PIXELS_PER_BYTE = 4;

const BLACK = 0;
const BLUE = 1;
const GREEN = 2;
const RED = 4;

// Weights for RGB to grayscale conversion (emulating B/W TV)
// NOTE: Boolean logic (&&) is used instead of multiplication - this is NOT a bug,
// but an emulation feature that produces brighter images similar to real B/W TV
const GRAYSCALE_RED_WEIGHT = 0x1d; // 29/255 ≈ 0.114 (BT.601 standard: 0.299)
const GRAYSCALE_GREEN_WEIGHT = 0x96; // 150/255 ≈ 0.588 (BT.601 standard: 0.587)
const GRAYSCALE_BLUE_WEIGHT = 0x4c; // 76/255 ≈ 0.298 (BT.601 standard: 0.114)

export class Screen {
  constructor(config, io, memory) {
    assertInstance(config, Config, 'SCREEN: Invalid CONFIG object');
    this.config = config;

    assertInstance(io, IO, 'SCREEN: Invalid IO object');
    this.io = io;

    assertInstance(memory, Memory, 'SCREEN: Invalid MEMORY object');
    this.vram_page = memory.get_vram_page();

    this.init();

    this.cache_palette = void 0;
    this.cache = new Uint8Array(VRAM_SIZE);
    this.reset_cache();

    this.allow_color_mode = config.screen.allow_color_mode;
    this.dirty = false;
    this.cacheValid = false;
  }

  static LUT = {
    R: new Uint32Array([
      0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x000000c0, 0x000000c0, 0x000000c0,
      0x000000ff,
    ]),
    G: new Uint32Array([
      0x00000000, 0x00000000, 0x0000c000, 0x0000c000, 0x00000000, 0x00000000, 0x0000c000,
      0x0000ff00,
    ]),
    B: new Uint32Array([
      0x00000000, 0x00c00000, 0x00000000, 0x00c00000, 0x00000000, 0x00c00000, 0x00000000,
      0x00ff0000,
    ]),
  };

  static cache_color = new Uint32Array(0x100);
  static cache_rgb = [];
  static cache_grayscale = [];

  init() {
    // Switched to Uint32Array based on the "Canvas Pixel Manipulation" benchmark
    //[http://jsperf.com/canvas-pixel-manipulation/98]
    this.ps32 = new Uint32Array(VRAM_SIZE * PIXELS_PER_BYTE);

    this.ps32.fill(0xff000000);

    for (let byte = 0; byte < 0x100; byte++) {
      Screen.cache_color[byte] = this.parse_color(byte);
    }

    const LUT = Screen.LUT;
    for (let c0, c1, c2, c3, palette = 0; palette < 0x80; palette++) {
      c0 = this.compute_color_index(0, palette);
      c1 = this.compute_color_index(1, palette);
      c2 = this.compute_color_index(2, palette);
      c3 = this.compute_color_index(3, palette);

      const rgb = new Uint32Array([
        0xff000000 | LUT.B[c0] | LUT.G[c0] | LUT.R[c0],
        0xff000000 | LUT.B[c1] | LUT.G[c1] | LUT.R[c1],
        0xff000000 | LUT.B[c2] | LUT.G[c2] | LUT.R[c2],
        0xff000000 | LUT.B[c3] | LUT.G[c3] | LUT.R[c3],
      ]);
      Screen.cache_rgb[palette] = rgb;

      // Precompute grayscale values for this palette
      const grayscale = new Uint32Array(4);
      for (let i = 0; i < 4; i++) {
        const p = rgb[i];
        const sum =
          ~~(p & 0x00ff0000 && GRAYSCALE_RED_WEIGHT) +
          ~~(p & 0x0000ff00 && GRAYSCALE_GREEN_WEIGHT) +
          ~~(p & 0x0000ff && GRAYSCALE_BLUE_WEIGHT);
        grayscale[i] = 0xff000000 | (sum << 16) | (sum << 8) | sum;
      }
      Screen.cache_grayscale[palette] = grayscale;
    }
  }

  restart() {
    this.cache_palette = undefined;
    this.reset_cache();
  }

  reset_cache() {
    this.cache.fill(0);
    this.cacheValid = false;
    this.dirty = true;
  }

  parse_color(byte) {
    // Each video-RAM byte describes the colors of 4 pixels at once
    let result = 0;

    if (byte & 0x80) {
      result |= 0x02;
    }
    if (byte & 0x08) {
      result |= 0x01;
    }
    if (byte & 0x40) {
      result |= 0x08;
    }
    if (byte & 0x04) {
      result |= 0x04;
    }
    if (byte & 0x20) {
      result |= 0x20;
    }
    if (byte & 0x02) {
      result |= 0x10;
    }
    if (byte & 0x10) {
      result |= 0x80;
    }
    if (byte & 0x01) {
      result |= 0x40;
    }

    return result;
  }

  compute_color_index(color, palette) {
    let result = BLACK;
    if (palette & 0x40) {
      result ^= BLUE;
    }
    if (palette & 0x20) {
      result ^= GREEN;
    }
    if (palette & 0x10) {
      result ^= RED;
    }

    switch (color) {
      case 0:
        if ((palette & 0x08) === 0) {
          result ^= RED;
        }
        if ((palette & 0x04) === 0) {
          result ^= BLUE;
        }
        break;

      case 1:
        result ^= BLUE;

        if ((palette & 0x01) === 0) {
          result ^= RED;
        }
        break;

      case 2:
        result ^= GREEN;
        break;

      case 3:
        result ^= RED;

        if ((palette & 0x02) === 0) {
          result ^= GREEN;
        }
        break;
    }

    return result;
  }

  // Cornerstone article on optimizing code for V8
  //[http://coding.smashingmagazine.com/2012/11/05/writing-fast-memory-efficient-javascript/]
  // CSS filters were dropped for the grayscale output: the -webkit-grayscale
  // filter produces a too-dark image and slows rendering down noticeably.
  draw() {
    const cache = this.cache;
    const cache_color = Screen.cache_color;
    const palette = this.io.input(this.io.PALETTE_PORT) & 0x7f;
    const is_valid = this.cacheValid && this.cache_palette === palette;
    const is_color = this.allow_color_mode;
    const rgb = Screen.cache_rgb[palette];
    const grayscale = Screen.cache_grayscale[palette];
    const ps32 = this.ps32;
    const vram = this.vram_page;
    let dirty = this.dirty;

    for (let i = 0, pos = 0; i < VRAM_SIZE; i++) {
      const byte = vram.mem[i];

      if (is_valid && byte === cache[i]) {
        pos += 4;
      } else {
        const cc = cache_color[byte];

        if (is_color) {
          ps32[pos++] = rgb[cc & 0x03];
          ps32[pos++] = rgb[(cc >> 2) & 0x03];
          ps32[pos++] = rgb[(cc >> 4) & 0x03];
          ps32[pos++] = rgb[(cc >> 6) & 0x03];
        } else {
          ps32[pos++] = grayscale[cc & 0x03];
          ps32[pos++] = grayscale[(cc >> 2) & 0x03];
          ps32[pos++] = grayscale[(cc >> 4) & 0x03];
          ps32[pos++] = grayscale[(cc >> 6) & 0x03];
        }

        cache[i] = byte;
        dirty = true;
      }
    }

    this.cacheValid = true;
    this.cache_palette = palette;

    if (dirty) {
      this.dirty = false;
      return this.ps32;
    }

    return null;
  }

  change_color_mode(state = !this.allow_color_mode) {
    const prev_state = this.allow_color_mode;
    this.allow_color_mode = state;

    if (prev_state !== this.allow_color_mode) {
      this.reset_cache();
    }
  }

  change_palette(step) {
    const v = this.io.ports[this.io.PALETTE_PORT];
    this.io.ports[this.io.PALETTE_PORT] = (v & 0x80) | ((v + step) & 0x7f);
  }
}
