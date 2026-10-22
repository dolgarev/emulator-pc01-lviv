import { Config } from './config.js';
import { IO } from './io.js';
import { Memory } from './memory.js';
import { assertInstance } from './utils/assert.js';

const VRAM_SIZE = 0x4000;
const PIXELS_PER_BYTE = 4;

// A video line is 64 video-memory bytes and a frame is 256 lines, so the
// framebuffer is 64 × pixels_per_byte dots wide and 256 dots tall.
const BYTES_PER_LINE = 64;
const LINES_PER_FRAME = VRAM_SIZE / BYTES_PER_LINE;

const BLACK = 0;
const BLUE = 1;
const GREEN = 2;
const RED = 4;

// A Uint32 view of ImageData stores one pixel as 0xAABBGGRR, so these masks
// select the channels by their actual position in the word.
const PIXEL_RED_MASK = 0x000000ff;
const PIXEL_GREEN_MASK = 0x0000ff00;
const PIXEL_BLUE_MASK = 0x00ff0000;

// Deliberately non-linear RGB to grayscale conversion (emulating B/W TV): a
// non-zero channel contributes its whole level instead of being scaled by it.
// Boolean logic is used instead of multiplication - this is NOT a bug, but an
// emulation feature that produces brighter images similar to a real B/W TV.
const GRAYSCALE_RED_LEVEL = 0x4c; // 76/255 ≈ 0.298 (BT.601 luma)
const GRAYSCALE_GREEN_LEVEL = 0x96; // 150/255 ≈ 0.588
const GRAYSCALE_BLUE_LEVEL = 0x1d; // 29/255 ≈ 0.114

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
    this.cache_blank = false;
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
    // The framebuffer is either the stock 256×256 (4 dots per RAM byte) or the
    // PK-02 upgrade 512×256 (8 dots per byte) — see set_high_resolution().
    this.set_high_resolution(false);

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
          ~~(p & PIXEL_RED_MASK && GRAYSCALE_RED_LEVEL) +
          ~~(p & PIXEL_GREEN_MASK && GRAYSCALE_GREEN_LEVEL) +
          ~~(p & PIXEL_BLUE_MASK && GRAYSCALE_BLUE_LEVEL);
        grayscale[i] = 0xff000000 | (sum << 16) | (sum << 8) | sum;
      }
      Screen.cache_grayscale[palette] = grayscale;
    }
  }

  /**
   * Selects the framebuffer geometry (CODE_REVIEW.md P2.13).
   *
   * The stock PC-01 shifts 4 dots out of every video-memory byte at 5 MHz. The
   * PK-02 "512×256 and Blanking" upgrade drives the shift clock at 10 MHz and
   * feeds `Q7` of the shift register into the colour demultiplexer instead of
   * `Q3`: the same 64 bytes per line become 8 dots each (512 dots wide), and the
   * two select inputs of the demultiplexer see one and the same bit, so only the
   * first and the last of the 4 palette colours stay reachable (one bit per dot).
   *
   * The buffer is reallocated here, so the caller has to repaint (reset_cache).
   */
  set_high_resolution(state) {
    this.hi_res = Boolean(state);
    this.pixels_per_byte = this.hi_res ? PIXELS_PER_BYTE * 2 : PIXELS_PER_BYTE;
    this.width = BYTES_PER_LINE * this.pixels_per_byte;
    this.height = LINES_PER_FRAME;

    // Switched to Uint32Array based on the "Canvas Pixel Manipulation" benchmark
    //[http://jsperf.com/canvas-pixel-manipulation/98]
    this.ps32 = new Uint32Array(VRAM_SIZE * this.pixels_per_byte);

    this.ps32.fill(0xff000000);
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
    const extended = this.io.ports[this.io.EXTENDED_MODE_PORT];
    const hi_res = (extended & this.io.HIGH_RESOLUTION_BIT) !== 0;
    const blank = (extended & this.io.BLANK_SCREEN_BIT) !== 0;

    // A resolution switch replaces the pixel buffer, and both switches change
    // what a video-memory byte means on screen, so the per-byte cache goes too.
    if (hi_res !== this.hi_res) {
      this.set_high_resolution(hi_res);
      this.reset_cache();
    }

    if (blank !== this.cache_blank) {
      this.cache_blank = blank;
      this.reset_cache();
    }

    const cache = this.cache;
    const cache_color = Screen.cache_color;
    const palette = this.io.read_port(this.io.PALETTE_PORT) & 0x7f;
    const is_valid = this.cacheValid && this.cache_palette === palette;
    const is_color = this.allow_color_mode;
    const rgb = Screen.cache_rgb[palette];
    const grayscale = Screen.cache_grayscale[palette];
    const ps32 = this.ps32;
    const vram = this.vram_page;
    const pixels_per_byte = this.pixels_per_byte;
    let dirty = this.dirty;

    // Screen blanking (P2.13): the port bit is inverted into `-BLANK-SCR`, which
    // drives the master reset of the pixel shift register and clears every dot.
    // The picture becomes a flat field of the background colour while the video
    // memory and the CPU keep running untouched.
    if (blank) {
      if (is_valid) return null;

      ps32.fill(is_color ? rgb[0] : grayscale[0]);
      this.cacheValid = true;
      this.cache_palette = palette;
      this.dirty = false;

      return ps32;
    }

    for (let i = 0, pos = 0; i < VRAM_SIZE; i++) {
      const byte = vram.mem[i];

      if (is_valid && byte === cache[i]) {
        pos += pixels_per_byte;
      } else {
        const cc = cache_color[byte];

        if (hi_res) {
          // 512×256 (P2.13): at 10 MHz all 8 bits of the byte leave the shift
          // register within the same line time, bit 7 first. The colour
          // demultiplexer takes both of its select inputs from one and the same
          // bit, so a dot is either the first or the last palette colour.
          const on = is_color ? rgb[3] : grayscale[3];
          const off = is_color ? rgb[0] : grayscale[0];

          for (let mask = 0x80; mask; mask >>= 1) {
            ps32[pos++] = byte & mask ? on : off;
          }
        } else if (is_color) {
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

  // Returns the current framebuffer without advancing the machine (CODE_REVIEW.md B6).
  // `draw()` is incremental and returns null when nothing changed, but the pixel buffer
  // always holds the last rendered picture; the refresh reads video memory and updates the
  // pixel cache only - it touches no clock, CPU or memory state - so a debugger can snapshot
  // the screen without disturbing the emulated machine.
  takeFrame() {
    this.draw();
    return this.ps32;
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
