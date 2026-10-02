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
