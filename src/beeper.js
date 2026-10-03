import { Config } from './config.js';
import { Clock } from './clock.js';
import { assertInstance } from './utils/assert.js';

/**
 * 1-bit beeper: turns port writes into a square wave.
 *
 * This is the original sound generation of the emulator, restored after the pipeline
 * rewrite of P3.10 was rejected by ear. Its known properties, deliberately kept:
 *
 * - the wave is unipolar (0 .. VOLUME), so the output carries a DC offset that the
 *   speaker removes but the graph does not;
 * - the phase restarts in every frame (`let state = 0`), which adds a ~50 Hz amplitude
 *   modulation - the "body" of the sound the author prefers;
 * - the sample rate is a fixed 44100 Hz, independent of the output device;
 * - cycles are converted with an integer number of cycles per sample
 *   (round(clock_speed / 44100) = 50), so a requested tone comes out slightly detuned
 *   (a 1000 Hz tone is rendered at ~984 Hz) and a frame is 897 samples = 20.34 ms, i.e.
 *   every frame overlaps the next one by about 0.34 ms.
 *
 * A repeated write is added to the previous run instead of being ignored, and the tail of
 * a frame is left at zero rather than holding the level - both as in the original.
 *
 * The CPU reports the output level through process(); play() converts the segments
 * collected during one frame into PCM for the injected sink (e.g. AudioSink), which keeps
 * this class free of Web Audio and DOM dependencies. The original read the cycle counters
 * of I8080 directly and owned its own AudioContext; those two couplings were removed in
 * P0.2 and P2.6 and are not coming back.
 */
export class Beeper {
  constructor(config, clock, sink) {
    assertInstance(config, Config, 'BEEPER: Invalid CONFIG object');
    this.config = config;

    assertInstance(clock, Clock, 'BEEPER: Invalid CLOCK object');
    this.clock = clock;

    // Audio output is an injected sink (e.g. AudioSink): see the note above.
    this.sink = sink;

    this.SAMPLE_RATE = 44100;
    this.SAMPLE_CPU_CYCLES = Math.round(config.cpu.clock_speed / this.SAMPLE_RATE);
    this.SAMPLE_BUFFER_SIZE = Math.ceil(config.cpu.frame_cycles / this.SAMPLE_CPU_CYCLES) + 1;
    this.VOLUME = 0.15;

    // Two entries per level change at most, with reserve for the flush path.
    this.sound_buffer = new Float32Array(this.SAMPLE_BUFFER_SIZE * 2);
    this.buffer_index = 0;
    this.sample_accumulator = 0;

    this.init();
  }

  init() {
    this.restart();
  }

  restart() {
    this.buffer_index = 0;
    this.sample_accumulator = 0;
    this.prev_frame_offset = 0;
    this.prev_beeper_state = 0;
  }

  play() {
    if (!this.config.beeper.allow_sound || this.buffer_index === 0) return;

    const data = new Float32Array(this.SAMPLE_BUFFER_SIZE);

    this.generateSquareWave(data, this.SAMPLE_CPU_CYCLES, this.VOLUME);

    this.buffer_index = 0;
    this.prev_frame_offset = 0;
    this.sample_accumulator = 0;

    this.sink?.play(data, this.SAMPLE_RATE);
  }

  generateSquareWave(data, sample_cpu_cycles, volume) {
    // The phase restarts here, in every frame - see the note above.
    let state = 0;
    let n = 0;

    for (let i = 0; i < this.buffer_index && n < data.length; i++) {
      this.sample_accumulator += this.sound_buffer[i] / sample_cpu_cycles;
      const samples = Math.floor(this.sample_accumulator);
      this.sample_accumulator -= samples;

      const value = state ? volume : 0;
      for (let j = 0; j < samples && n < data.length; j++) {
        data[n++] = value;
      }
      state = 1 - state;
    }
  }

  process(state) {
    const frame_offset = this.clock.frameOffset;
    const inc_offset = frame_offset - this.prev_frame_offset;

    if (this.buffer_index >= this.sound_buffer.length) {
      this.flushPartialBuffer();
    }

    if (state === this.prev_beeper_state) {
      // A repeated write extends the run that is already open.
      if (this.buffer_index > 0) {
        this.sound_buffer[this.buffer_index - 1] += inc_offset;
      } else {
        this.sound_buffer[this.buffer_index++] = inc_offset;
      }
    } else {
      // A new sound segment starts here.
      this.sound_buffer[this.buffer_index++] = inc_offset;
      this.prev_beeper_state = state;
    }

    this.prev_frame_offset = frame_offset;
  }

  flushPartialBuffer() {
    console.warn('BEEPER: Buffer overflow, flushing partial buffer');
    this.play();
    this.buffer_index = 0;
    this.sample_accumulator = 0;
  }
}
