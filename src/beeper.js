import { Config } from './config.js';
import { Clock } from './clock.js';
import { assertInstance } from './utils/assert.js';

// A level change needs at least one OUT instruction (10 cycles) plus its loop
// overhead, so the segment buffer is sized from this worst case. Should it ever be
// exceeded, the excess changes are inaudible (far above the audio band) and are
// dropped instead of cutting the frame short.
const MIN_CYCLES_PER_CHANGE = 8;

/**
 * 1-bit beeper: turns port writes into a square wave.
 *
 * The CPU reports the output level through process(); every level is measured in
 * CPU cycles, so the sound follows the emulated clock. play() converts the segments
 * collected during one frame into PCM for the injected sink (e.g. AudioSink), which
 * keeps this class free of Web Audio and DOM dependencies.
 */
export class Beeper {
  constructor(config, clock, sink) {
    assertInstance(config, Config, 'BEEPER: Invalid CONFIG object');
    this.config = config;

    assertInstance(clock, Clock, 'BEEPER: Invalid CLOCK object');
    this.clock = clock;

    // Audio output is an injected sink (e.g. AudioSink), so the beeper itself
    // stays free of Web Audio / DOM dependencies.
    this.sink = sink;

    // Used when the sink cannot report the sample rate of the output device.
    this.DEFAULT_SAMPLE_RATE = 44100;
    this.VOLUME = 0.15;

    // One entry per level change, not per sample.
    this.MAX_SEGMENTS = Math.ceil(config.cpu.frame_work_cycles / MIN_CYCLES_PER_CHANGE) + 2;
    this.sound_buffer = new Float32Array(this.MAX_SEGMENTS);

    this.init();
  }

  init() {
    this.restart();
  }

  restart() {
    this.buffer_index = 0;
    this.sample_carry = 0;
    this.wave_level = 0;
    this.prev_change_offset = 0;
    this.prev_beeper_state = 0;
    this.overflow_warned = false;
  }

  get sample_rate() {
    return this.sink?.sample_rate ?? this.DEFAULT_SAMPLE_RATE;
  }

  play() {
    const segments = this.buffer_index;

    // The frame boundary cuts the level run that is still open: the cycles between
    // the last change and the frame end belong to this frame and are emitted by the
    // tail of generateSquareWave(), not by the next frame.
    this.buffer_index = 0;
    this.prev_change_offset = 0;

    if (!this.config.beeper.allow_sound || segments === 0) return;

    const sample_rate = this.sample_rate;
    // Exactly one frame of audio, whatever the emulated CPU speed is, so the sound
    // stays in step with the emulation.
    const frame_samples = Math.round((this.config.cpu.frame_duration * sample_rate) / 1000);
    const data = new Float32Array(frame_samples);

    this.generateSquareWave(data, sample_rate, segments);

    this.sink?.play(data, sample_rate);
  }

  generateSquareWave(data, sample_rate, segments) {
    const samples_per_cycle = sample_rate / this.config.cpu.effective_clock_speed;
    const amplitude = this.VOLUME / 2;

    // The first segment continues the level held at the frame boundary: the wave
    // must not restart at every frame, or its phase jumps 50 times per second.
    let level = this.wave_level;
    let n = 0;

    for (let i = 0; i < segments && n < data.length; i++) {
      // Fractional samples are carried over, so no cycles are lost to rounding.
      this.sample_carry += this.sound_buffer[i] * samples_per_cycle;

      const samples = Math.floor(this.sample_carry);
      this.sample_carry -= samples;

      const emitted = Math.min(samples, data.length - n);
      const value = level ? amplitude : -amplitude;

      for (let j = 0; j < emitted; j++) data[n++] = value;

      level = 1 - level;
    }

    // The beeper holds its last level until the next write. Samples that did not fit
    // belong to emulated time this frame cannot represent (a trap can run far more
    // cycles than a frame), so they are dropped rather than accumulated.
    const held = level ? amplitude : -amplitude;

    while (n < data.length) data[n++] = held;

    this.wave_level = level;
  }

  process(state) {
    if (state === this.prev_beeper_state) return;

    const frame_offset = this.clock.frameOffset;

    if (this.buffer_index >= this.sound_buffer.length) {
      if (!this.overflow_warned) {
        this.overflow_warned = true;
        console.warn('BEEPER: Segment buffer overflow, dropping inaudible level changes');
      }
    } else {
      // The run that just ended: from the previous level change (or from the frame
      // boundary) up to this write.
      this.sound_buffer[this.buffer_index++] = frame_offset - this.prev_change_offset;
    }

    this.prev_change_offset = frame_offset;
    this.prev_beeper_state = state;
  }
}
