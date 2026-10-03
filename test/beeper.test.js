import { describe, it, expect, vi } from 'vitest';
import { Beeper } from '../src/beeper.js';
import { Clock } from '../src/clock.js';
import { Config } from '../src/config.js';
import { Settings } from '../src/settings.js';

// The beeper implements the *original* sound generation of the emulator (see the note in
// src/beeper.js and CODE_REVIEW.md P3.10), so the tests pin its known properties: a
// unipolar wave, a phase restart per frame, a fixed 44100 Hz rate and an integer number
// of cycles per sample. The speed factor stays at its nominal 1.0 here, because the class
// converts cycles with the nominal clock.
function createBeeper({ speed_factor = 1, sample_rate = undefined } = {}) {
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

// Writes a square wave of `frequency` into the beeper for `frames` emulated frames.
function playTone(target, frequency, frames) {
  const { beeper, clock, config } = target;
  const frame_cycles = config.cpu.frame_cycles;
  const half_period = config.cpu.effective_clock_speed / (2 * frequency);

  let state = 0;
  let position = 0; // cycles of the tone generated so far
  let next_change = half_period;

  for (let frame = 0; frame < frames; frame++) {
    clock.startFrame();

    let offset = 0;
    while (next_change <= position + frame_cycles) {
      const at = Math.round(next_change - position);
      clock.addCycles(at - offset);
      offset = at;
      state = 1 - state;
      beeper.process(state);
      next_change += half_period;
    }

    clock.addCycles(frame_cycles - offset);
    beeper.play();
    position += frame_cycles;
  }
}

const concat = (buffers) => {
  const total = buffers.reduce((sum, buffer) => sum + buffer.data.length, 0);
  const samples = new Float32Array(total);

  let at = 0;
  for (const buffer of buffers) {
    samples.set(buffer.data, at);
    at += buffer.data.length;
  }

  return samples;
};

const countTransitions = (samples) => {
  let changes = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i] !== samples[i - 1]) changes += 1;
  }
  return changes;
};

describe('Beeper (original sound generation)', () => {
  it('hands over one buffer per frame that had port writes, at a fixed 44100 Hz', () => {
    const target = createBeeper();
    playTone(target, 1000, 3);

    expect(target.buffers).toHaveLength(3);
    expect(target.buffers[0].sample_rate).toBe(44100);
    // ceil(44800 / 50) + 1 = 897 samples, i.e. 20.34 ms per frame.
    expect(target.buffers[0].data).toHaveLength(897);
  });

  it('hands over nothing for a frame without any port write', () => {
    const target = createBeeper();
    const { beeper, clock, config } = target;

    clock.startFrame();
    clock.addCycles(config.cpu.frame_cycles);
    beeper.play();

    expect(target.buffers).toHaveLength(0);
  });

  it('hands over a buffer even when the level did not change, because the write opens a run', () => {
    const target = createBeeper();
    const { beeper, clock, config } = target;

    clock.startFrame();
    clock.addCycles(1000);
    beeper.process(0); // same level as the initial state
    clock.addCycles(config.cpu.frame_cycles - 1000);
    beeper.play();

    expect(target.buffers).toHaveLength(1);
  });

  it('outputs a unipolar wave between 0 and VOLUME', () => {
    const target = createBeeper();
    playTone(target, 1000, 5);

    const samples = concat(target.buffers);
    let min = Infinity;
    let max = -Infinity;
    for (const value of samples) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    expect(min).toBe(0);
    expect(max).toBeCloseTo(target.beeper.VOLUME, 6);
  });

  it('restarts the wave in every frame', () => {
    const target = createBeeper();
    playTone(target, 1000, 4);

    // Whatever the previous frame ended with, the next one starts from the low level.
    for (const buffer of target.buffers) {
      expect(buffer.data[0]).toBe(0);
    }
  });

  it('renders a tone at the rate implied by the integer cycles per sample', () => {
    const target = createBeeper();
    playTone(target, 1000, 25); // 0.5 s of emulated time

    const samples = concat(target.buffers);
    const seconds = samples.length / 44100;
    const frequency = countTransitions(samples) / 2 / seconds;

    // round(2 200 000 / 44100) = 50 cycles per sample, so a 1000 Hz request comes out at
    // 44100 / (2 * (1120 / 50)) = 984.4 Hz - the detune of the original implementation.
    expect(frequency).toBeGreaterThan(975);
    expect(frequency).toBeLessThan(995);
    expect(1000 - frequency).toBeGreaterThan(10);
  });

  it('flushes a partial buffer when the segments overflow', () => {
    const target = createBeeper();
    const { beeper, clock, config } = target;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    clock.startFrame();

    // One level change every two cycles: far above anything audible and far more than the
    // segment buffer can hold.
    let state = 0;
    for (let cycles = 0; cycles < config.cpu.frame_cycles; cycles += 2) {
      clock.addCycles(2);
      state = 1 - state;
      beeper.process(state);
    }

    expect(warn).toHaveBeenCalled();
    expect(target.buffers.length).toBeGreaterThan(0);

    beeper.play();
    warn.mockRestore();
  });
});
