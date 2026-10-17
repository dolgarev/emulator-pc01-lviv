import { describe, it, expect } from 'vitest';
import { IO } from '../src/io.js';
import { Beeper } from '../src/beeper.js';
import { Clock } from '../src/clock.js';
import { Config } from '../src/config.js';
import { Settings } from '../src/settings.js';
import { Keyboard } from '../src/keyboard.js';

// C0-C3 are the main PPI: port B (0xC1, PB7 = speaker control) and port C (0xC2,
// PC0 = speaker level). The profile picks whether PB7 is honoured.
function createIO(profile = 'pc01_lvov_80') {
  const config = new Config(new Settings('default'), profile);
  const beeper = new Beeper(config, new Clock(), { play() {}, reset() {} });

  // Record every level the IO hands to the beeper.
  const levels = [];
  const process = beeper.process.bind(beeper);
  beeper.process = (state) => {
    levels.push(state);
    process(state);
  };

  const io = new IO(config, beeper, new Keyboard());

  return { io, levels };
}

describe('IO speaker output', () => {
  it('follows PC0 while PB7 is high', () => {
    const { io, levels } = createIO();

    io.output(0xc2, 0xff); // PC0 = 1 -> the level stays high
    io.output(0xc2, 0xfe); // PC0 = 0 -> low
    io.output(0xc2, 0xff); // PC0 = 1 -> high again

    expect(levels).toEqual([1, 0, 1]);
  });

  it('forces the output high when PB7 goes low', () => {
    const { io, levels } = createIO();

    io.output(0xc2, 0xfe); // PC0 = 0, PB7 = 1 -> low
    io.output(0xc1, 0x0f); // PB7 = 0 -> the output is forced high
    io.output(0xc1, 0x8f); // PB7 = 1 -> PC0 (still 0) passes again

    expect(levels).toEqual([1, 0, 1, 0]);
  });

  it('ignores PB7 in the fixed profile', () => {
    const { io, levels } = createIO('pc01_lvov_80_fixed');

    io.output(0xc2, 0xfe); // PC0 = 0 -> low
    io.output(0xc1, 0x0f); // PB7 = 0 must not change the level here

    expect(levels).toEqual([1, 0]);
  });
});

// The initial-reset flip-flop (D5A) is set by RESET and cleared by the I/O write strobe
// on D5.1 - before the address decoder (code review P2.17).
describe('IO reset state', () => {
  it('arms the ROM mapping on restart and clears it on the first write', () => {
    const { io } = createIO();

    expect(io.initial_rom_mapping).toBe(true);

    io.input(0xc2); // a read is not the write strobe
    expect(io.initial_rom_mapping).toBe(true);

    io.output(0x00, 0x00); // the ROM's dummy OUT: the port selects no device at all
    expect(io.initial_rom_mapping).toBe(false);

    io.output(0xc2, 0xff); // and it stays cleared
    expect(io.initial_rom_mapping).toBe(false);

    io.restart(); // RESET arms it again
    expect(io.initial_rom_mapping).toBe(true);
  });
});

// The four blocks D28 selects from A5/A4, the A7/A6 enable and the "nothing
// selected" case (code review P2.14).
describe('IO port decoding', () => {
  it('selects the blocks from A5/A4, enables them with A7/A6 and ignores A2/A3', () => {
    const { io } = createIO('pc01_lvov_80_fixed');

    const table = [
      // The main PPI and the keyboard PPI decode A1/A0.
      [0xc0, 0xc0],
      [0xc1, 0xc1],
      [0xc2, 0xc2],
      [0xc3, 0xc3],
      [0xd0, 0xd0],
      [0xd3, 0xd3],
      // A2/A3 are not decoded at all.
      [0xc5, 0xc1],
      [0xca, 0xc2],
      [0xcf, 0xc3],
      [0xd4, 0xd0],
      [0xdf, 0xd3],
      // The PK-02 latch is clocked by ~CS3 alone, so all sixteen addresses
      // write the one register.
      [0xf0, 0xf0],
      [0xf3, 0xf0],
      [0xff, 0xf0],
      // ~CS2 and everything below 0xC0 select nothing.
      [0xe0, -1],
      [0xef, -1],
      [0x00, -1],
      [0xbf, -1],
      // Only the low byte reaches the decoder (the 8080 duplicates it anyway).
      [0x1f0, 0xf0],
    ];

    for (const [port, expected] of table) {
      expect(io.decode_port(port), `port ${port.toString(16)}`).toBe(expected);
    }
  });

  it('reads the floating bus and drops the write when nothing is selected', () => {
    const { io } = createIO();

    io.output(0x00, 0x42);
    io.output(0xe0, 0x42);

    expect(io.ports[0xc0]).toBe(0);
    expect(io.ports[0xe0]).toBe(0);
    expect(io.input(0x00)).toBe(0xff);
    expect(io.input(0xe0)).toBe(0xff);

    // The registers that are selected still answer.
    expect(io.input(0xc0)).toBe(0);
  });

  it('keeps the port 0xF0 latch out of the serial machine', () => {
    const { io } = createIO();

    io.output(0xf0, 0x08);

    expect(io.ports[io.EXTENDED_MODE_PORT]).toBe(0);
    expect(io.ports[io.KEYBOARD_SELECT_PORT]).toBe(0);
    expect(io.input(0xf0)).toBe(0xff);
  });

  it('writes the port 0xF0 latch of the machine with the PK-02 board', () => {
    const { io } = createIO('pc01_lvov_80_fixed');
    const bits = io.HIGH_RESOLUTION_BIT | io.BLANK_SCREEN_BIT;

    io.output(0xd0, 0x01); // keyboard column select
    io.output(0xf0, bits);

    expect(io.ports[io.EXTENDED_MODE_PORT]).toBe(bits);
    expect(io.input(io.EXTENDED_MODE_PORT)).toBe(bits);
    // The old brief decoding folded 0xF0 onto the keyboard PPI port A.
    expect(io.ports[io.KEYBOARD_SELECT_PORT]).toBe(0x01);

    // A1/A0 do not reach the latch: a mirror writes it too.
    io.output(0xf7, 0x00);
    expect(io.ports[io.EXTENDED_MODE_PORT]).toBe(0);
  });

  it('reads a register through its A2/A3 mirrors', () => {
    const { io } = createIO();

    io.output(0xc0, 0x5a); // main PPI port A
    io.output(0xd0, 0x3c); // keyboard column select

    expect(io.input(0xc4)).toBe(0x5a);
    expect(io.input(0xc8)).toBe(0x5a);
    expect(io.input(0xcc)).toBe(0x5a);
    expect(io.input(0xd4)).toBe(0x3c);
    expect(io.input(0xdc)).toBe(0x3c);
  });

  it('keeps the bit set/reset mode of a control word inside its own PPI', () => {
    const { io } = createIO();

    io.output(0xc2, 0x00); // port C: known state (restart() preloads the media port)
    io.output(0xc3, 0x0f); // BSR: set bit 7 of port C

    expect(io.ports[0xc2]).toBe(0x80);

    io.output(0xcf, 0x0e); // through the A2/A3 mirror: reset the same bit

    expect(io.ports[0xc2]).toBe(0x00);
  });
});
