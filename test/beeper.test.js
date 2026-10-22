import { describe, it, expect, vi } from 'vitest';
import { Beeper } from '../src/beeper.js';
import { Clock } from '../src/clock.js';
import { Config } from '../src/config.js';
import { Settings } from '../src/settings.js';

// The frame whose 20.48 ms is not a whole number of samples is the one that exercises the
// carried budget, so it is the one the beeper tests use by default; `frame` picks the 20 ms
// default of the emulator instead (P2.20).
function createBeeper({ speed_factor = 0.6, sample_rate = undefined, frame = '48.83hz' } = {}) {
  const settings = new Settings('default');
  settings.cpu.speed_factor = speed_factor;
  settings.cpu.frame = frame;

  const config = new Config(settings, 'pc01_lvov_80');
  const clock = new Clock();
  const buffers = [];
  const sink = {
    sample_rate,
    resets: 0,
    play: (data, rate) => buffers.push({ data, sample_rate: rate }),
    reset() {
      this.resets += 1;
    },
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
      expect(buffer.data).toHaveLength(983); // 20.48 ms at 48 kHz
    }
  });

  it('carries the sample budget of a frame that is not a whole number of samples (P2.20)', () => {
    const target = createBeeper();
    playTone(target, 1000, 25);

    // 25 frames of 20.48 ms at 44100 Hz are 22579.2 samples: the buffers alternate
    // around 903 (a fixed 903 would drain the lead of the sink, a fixed 904 would
    // overrun it), so the average rate is exactly the device rate.
    const lengths = target.buffers.map((buffer) => buffer.data.length);

    expect(new Set(lengths)).toEqual(new Set([903, 904]));
    expect(lengths.reduce((sum, length) => sum + length, 0)).toBe(22579);
  });

  it('falls back to 44100 Hz for sinks that do not report a sample rate', () => {
    const target = createBeeper();
    playTone(target, 1000, 1);

    expect(target.buffers[0].sample_rate).toBe(44100);
    expect(target.buffers[0].data).toHaveLength(903); // 20.48 ms at 44100 Hz
  });

  it('emits exactly the frame worth of samples in the 20 ms default frame (P2.20)', () => {
    const at_48000 = createBeeper({ sample_rate: 48000, frame: '50hz' });
    playTone(at_48000, 1000, 3);

    const at_44100 = createBeeper({ frame: '50hz' });
    playTone(at_44100, 1000, 3);

    // 20 ms is a whole number of samples at both device rates, so nothing is carried.
    expect(at_48000.buffers.map((buffer) => buffer.data.length)).toEqual([960, 960, 960]);
    expect(at_44100.buffers.map((buffer) => buffer.data.length)).toEqual([882, 882, 882]);
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
    // ~226 samples (a quarter of the frame) at level 0, then the level flips.
    expect(first[224]).toBeCloseTo(-amplitude, 6);
    expect(first[226]).toBeCloseTo(amplitude, 6);
    expect(first.at(-1)).toBeCloseTo(amplitude, 6);

    // The first frame ends at level 1, so the second one starts there: the wave is
    // not restarted at the frame boundary (it used to be forced to level 0).
    expect(second[0]).toBeCloseTo(amplitude, 6);
    expect(second.at(-1)).toBeCloseTo(-amplitude, 6);
    expect(third[0]).toBeCloseTo(-amplitude, 6);
  });

  it('drops the partial frame but keeps the queued audio and the wave phase (P3.24)', () => {
    const target = createBeeper({ sample_rate: 48000, frame: '50hz' });
    const { beeper, clock, config } = target;
    const frame = config.cpu.frame_work_cycles;
    const resets = beeper.sink.resets;

    // A frame that ends at level 1: this is the wave phase of the suspended machine.
    clock.startFrame();
    clock.addCycles(Math.round(frame / 2));
    beeper.process(1);
    clock.addCycles(frame - Math.round(frame / 2));
    beeper.play();
    expect(beeper.wave_level).toBe(1);

    // The frame in progress when the machine is suspended: two segments collected.
    clock.startFrame();
    clock.addCycles(100);
    beeper.process(0);
    clock.addCycles(100);
    beeper.process(1);
    expect(beeper.buffer_index).toBe(2);

    beeper.discard_frame();

    expect(beeper.buffer_index).toBe(0);
    expect(beeper.prev_change_offset).toBe(0);
    // The ports keep their level across a suspension, so the wave continues the run it
    // stopped in instead of restarting at the level of the previous run.
    expect(beeper.prev_beeper_state).toBe(1);
    expect(beeper.wave_level).toBe(1);
    // The audio already queued stands for emulated time that has happened: it is not cut.
    expect(beeper.sink.resets).toBe(resets);

    // A new run still drops what the previous one queued, and still keeps the level.
    beeper.restart();
    expect(beeper.sink.resets).toBe(resets + 1);
    expect(beeper.prev_beeper_state).toBe(1);
    expect(beeper.wave_level).toBe(1);
  });

  it('keeps the level the ports hold across a restart (P3.25)', () => {
    const target = createBeeper({ sample_rate: 48000, frame: '50hz' });
    const { beeper, clock, config } = target;
    const frame = config.cpu.frame_work_cycles;
    const amplitude = beeper.VOLUME / 2;
    const quarter = Math.round(frame / 4);

    // The machine runs with the emitter line high and ends its frame there.
    clock.startFrame();
    clock.addCycles(Math.round(frame / 2));
    beeper.process(1);
    clock.addCycles(frame - Math.round(frame / 2));
    beeper.play();

    // RESET, a snapshot restore or a new machine does not move the line: the level and the
    // wave keep it, so the wave continues the run it stops in.
    beeper.restart();

    expect(beeper.prev_beeper_state).toBe(1);
    expect(beeper.wave_level).toBe(1);

    clock.startFrame();
    clock.addCycles(quarter);
    beeper.process(0);

    // The first change after the restart is measured from the new frame boundary, not from
    // the offset of the run that ended before the restart (which came out negative).
    expect(beeper.sound_buffer[0]).toBe(quarter);

    clock.addCycles(frame - quarter);
    beeper.play();

    // ... and the run before it is emitted at the level the line actually has - not at low,
    // which is what assuming 0 gave (it swallowed this change and inverted the run).
    const data = target.buffers.at(-1).data;
    const split = Math.round(data.length / 4);

    expect(data[0]).toBeCloseTo(amplitude, 6);
    expect(data[split - 2]).toBeCloseTo(amplitude, 6);
    expect(data[split + 2]).toBeCloseTo(-amplitude, 6);
  });

  it('measures the run length from the frame boundary, not from the last change', () => {
    const target = createBeeper();
    const { beeper, clock, config } = target;
    const half = Math.round(config.cpu.frame_work_cycles / 2);

    // A frame without level changes still emits audio: the level is held, so the stream
    // never breaks (a held level is a constant, i.e. silence).
    clock.startFrame();
    beeper.process(0); // same level as before -> the run just continues
    clock.addCycles(config.cpu.frame_work_cycles);
    beeper.play();

    expect(target.buffers).toHaveLength(1);
    expect(target.buffers[0].data).toHaveLength(903);

    const held = target.buffers[0].data;
    expect(held[0]).toBeCloseTo(-beeper.VOLUME / 2, 6);
    expect(held.at(-1)).toBeCloseTo(-beeper.VOLUME / 2, 6);

    clock.startFrame();
    clock.addCycles(half);
    beeper.process(1);
    clock.addCycles(config.cpu.frame_work_cycles - half);
    beeper.play();

    const data = target.buffers[1].data;
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
    expect(target.buffers[0].data).toHaveLength(903);
    expect(warn).toHaveBeenCalledTimes(1); // warned once, not once per change

    warn.mockRestore();
  });
});
