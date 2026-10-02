import { describe, it, expect } from 'vitest';
import { Beeper } from '../src/beeper.js';
import { Clock } from '../src/clock.js';
import { Config } from '../src/config.js';
import { Settings } from '../src/settings.js';

function createBeeper(speed_factor) {
  const settings = new Settings('default');
  settings.cpu.speed_factor = speed_factor;

  const played = [];
  const sink = { play: (data, sample_rate) => played.push({ data, sample_rate }) };

  return {
    beeper: new Beeper(new Config(settings, 'pc01_lvov_80'), new Clock(), sink),
    played,
  };
}

describe('Beeper', () => {
  it('sizes the buffer for one whole frame at any CPU speed', () => {
    for (const speed_factor of [1, 0.6, 0.5]) {
      const { beeper } = createBeeper(speed_factor);
      const buffer_ms = ((beeper.SAMPLE_BUFFER_SIZE - 1) * 1000) / beeper.SAMPLE_RATE;

      // The buffer has to cover the 20 ms frame, otherwise the sound gets gaps.
      expect(buffer_ms).toBeGreaterThan(19);
      expect(buffer_ms).toBeLessThan(21);
    }
  });

  it('turns fewer cycles into one sample when the CPU is slower', () => {
    const nominal = createBeeper(1).beeper.SAMPLE_CPU_CYCLES;
    const slowed = createBeeper(0.5).beeper.SAMPLE_CPU_CYCLES;

    // Fewer cycles per sample at the same sample rate means a lower pitch, which is
    // what a slower machine sounds like.
    expect(slowed).toBeLessThan(nominal);
    expect(slowed / nominal).toBeCloseTo(0.5, 1);
  });

  it('hands the whole frame to the sink', () => {
    const settings = new Settings('default');
    settings.cpu.speed_factor = 0.6;

    const played = [];
    const clock = new Clock();
    const beeper = new Beeper(new Config(settings, 'pc01_lvov_80'), clock, {
      play: (data, sample_rate) => played.push({ data, sample_rate }),
    });

    beeper.process(0);
    clock.addCycles(10000);
    beeper.process(1);
    clock.addCycles(10000);
    beeper.process(0);
    beeper.play();

    const { data, sample_rate } = played[0];
    const loud = data.filter((value) => value > 0).length;

    expect(played).toHaveLength(1);
    expect(sample_rate).toBe(beeper.SAMPLE_RATE);
    expect(data).toHaveLength(beeper.SAMPLE_BUFFER_SIZE);

    // Both halves of the square wave have to survive the conversion: 10000 cycles at
    // ~30 cycles per sample is about 330 samples of silence, then the same amount of
    // the high level.
    expect(loud).toBeGreaterThan(300);
  });
});
