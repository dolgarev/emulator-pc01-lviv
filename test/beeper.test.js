import { describe, it, expect, vi } from 'vitest';
import { Beeper } from '../src/beeper.js';
import { Clock } from '../src/clock.js';
import { Config } from '../src/config.js';
import { Settings } from '../src/settings.js';

function createBeeper({ speed_factor = 0.6, sample_rate = undefined } = {}) {
  const settings = new Settings('default');
  settings.cpu.speed_factor = speed_factor;

  const config = new Config(settings, 'pc01_lvov_80');
  const clock = new Clock();
  const buffers = [];
  const sink = {
    sample_rate,
    play: (data, rate) => buffers.push({ data, sample_rate: rate }),
  };

  return { beeper: new Beeper(config, clock, sink), clock, config, buffers };
}

// Plays a square wave of `frequency` for `frames` emulated frames; the sink collects
// the PCM of every frame.
function playTone({ beeper, clock, config, buffers }, frequency, frames) {
  const frame_cycles = config.cpu.frame_work_cycles;
  const half_period = config.cpu.effective_clock_speed / (2 * frequency);

  let state = 0;
  let elapsed = 0; // cycles since the tone started
  let next_change = half_period; // cycle of the next level change

  for (let frame = 0; frame < frames; frame++) {
    clock.startFrame();

    let offset = 0;
    let change = Math.round(next_change - elapsed);

    while (change <= frame_cycles) {
      clock.addCycles(change - offset);
      offset = change;
      state = 1 - state;
      beeper.process(state);
      next_change += half_period;
      change = Math.round(next_change - elapsed);
    }

    clock.addCycles(frame_cycles - offset);
    elapsed += frame_cycles;
    beeper.play();
  }

  return buffers;
}

function concat(buffers) {
  const total = buffers.reduce((sum, buffer) => sum + buffer.data.length, 0);
  const samples = new Float32Array(total);

  let offset = 0;
  for (const buffer of buffers) {
    samples.set(buffer.data, offset);
    offset += buffer.data.length;
  }

  return samples;
}

function countTransitions(samples) {
  let count = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i] > 0 !== samples[i - 1] > 0) count++;
  }
  return count;
}

describe('Beeper', () => {
  it('sends exactly one frame of audio per frame, at the sink sample rate', () => {
    const target = createBeeper({ sample_rate: 48000 });
    playTone(target, 1000, 3);

    expect(target.buffers).toHaveLength(3);
    for (const buffer of target.buffers) {
      expect(buffer.sample_rate).toBe(48000);
      expect(buffer.data).toHaveLength(960); // 20 ms at 48 kHz
    }
  });

  it('falls back to 44100 Hz for sinks that do not report a sample rate', () => {
    const target = createBeeper();
    playTone(target, 1000, 1);

    expect(target.buffers[0].sample_rate).toBe(44100);
    expect(target.buffers[0].data).toHaveLength(882);
  });

  it('continues the level run across frame boundaries', () => {
    const target = createBeeper();
    const { beeper, clock, config } = target;
    const amplitude = beeper.VOLUME / 2;
    const quarter = Math.round(config.cpu.frame_work_cycles / 4);

    // One level change per frame, a quarter into the frame.
    for (const state of [1, 0, 1]) {
      clock.startFrame();
      clock.addCycles(quarter);
      beeper.process(state);
      clock.addCycles(config.cpu.frame_work_cycles - quarter);
      beeper.play();
    }

    const [first, second, third] = target.buffers.map((buffer) => buffer.data);

    expect(first[0]).toBeCloseTo(-amplitude, 6);
    // ~220 samples (a quarter of the frame) at level 0, then the level flips.
    expect(first[219]).toBeCloseTo(-amplitude, 6);
    expect(first[221]).toBeCloseTo(amplitude, 6);
    expect(first.at(-1)).toBeCloseTo(amplitude, 6);

    // The first frame ends at level 1, so the second one starts there: the wave is
    // not restarted at the frame boundary (it used to be forced to level 0).
    expect(second[0]).toBeCloseTo(amplitude, 6);
    expect(second.at(-1)).toBeCloseTo(-amplitude, 6);
    expect(third[0]).toBeCloseTo(-amplitude, 6);
  });

  it('measures the run length from the frame boundary, not from the last change', () => {
    const target = createBeeper();
    const { beeper, clock, config } = target;
    const half = Math.round(config.cpu.frame_work_cycles / 2);

    // A frame without level changes emits nothing at all.
    clock.startFrame();
    beeper.process(0); // same level as before -> the run just continues
    clock.addCycles(config.cpu.frame_work_cycles);
    beeper.play();

    expect(target.buffers).toHaveLength(0);

    clock.startFrame();
    clock.addCycles(half);
    beeper.process(1);
    clock.addCycles(config.cpu.frame_work_cycles - half);
    beeper.play();

    const data = target.buffers[0].data;
    const middle = Math.floor(data.length / 2);
    const amplitude = beeper.VOLUME / 2;

    expect(data[0]).toBeCloseTo(-amplitude, 6);
    expect(data[middle - 1]).toBeCloseTo(-amplitude, 6);
    expect(data[middle + 1]).toBeCloseTo(amplitude, 6);
  });

  it('reproduces the frequency of the tone', () => {
    const target = createBeeper();
    playTone(target, 1000, 25); // 0.5 s of emulated time

    const samples = concat(target.buffers);
    const seconds = samples.length / 44100;
    const frequency = countTransitions(samples) / 2 / seconds;

    expect(frequency).toBeGreaterThan(990);
    expect(frequency).toBeLessThan(1010);
  });

  it('outputs a bipolar wave without a DC offset', () => {
    const target = createBeeper();
    playTone(target, 1000, 25);

    const samples = concat(target.buffers);
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const peak = samples.reduce((max, value) => Math.max(max, value), -Infinity);

    expect(peak).toBeCloseTo(target.beeper.VOLUME / 2, 6);
    expect(Math.abs(mean)).toBeLessThan(0.005);
  });

  it('drops inaudible level changes instead of cutting the frame short', () => {
    const target = createBeeper();
    const { beeper, clock, config } = target;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    clock.startFrame();

    // One level change every two cycles: far below anything audible, and far more
    // than the segment buffer can hold.
    let state = 0;
    for (let cycles = 0; cycles < config.cpu.frame_work_cycles; cycles += 2) {
      clock.addCycles(2);
      state = 1 - state;
      beeper.process(state);
    }

    beeper.play();

    expect(target.buffers).toHaveLength(1);
    expect(target.buffers[0].data).toHaveLength(882);
    expect(warn).toHaveBeenCalledTimes(1); // warned once, not once per change

    warn.mockRestore();
  });
});
