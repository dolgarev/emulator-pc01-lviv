/*
 * Copyright (C) 2014 Oleg Dolgarev <o.dolgarev@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { Config } from './config.js';
import { Clock } from './clock.js';
import { assertInstance } from './utils/assert.js';

export class Beeper {
  constructor(config, clock, sink) {
    assertInstance(config, Config, 'BEEPER: Invalid CONFIG object');
    this.config = config;

    assertInstance(clock, Clock, 'BEEPER: Invalid CLOCK object');
    this.clock = clock;

    // Audio output is an injected sink (e.g. AudioSink), so the beeper itself
    // stays free of Web Audio / DOM dependencies.
    this.sink = sink;

    this.SAMPLE_RATE = 44100;
    this.SAMPLE_CPU_CYCLES = Math.round(config.cpu.clock_speed / this.SAMPLE_RATE);
    this.SAMPLE_BUFFER_SIZE = Math.ceil(config.cpu.frame_cycles / this.SAMPLE_CPU_CYCLES) + 1;
    this.VOLUME = 0.15;

    // Use TypedArray for better performance
    this.sound_buffer = new Float32Array(this.SAMPLE_BUFFER_SIZE * 2); // 2x reserve
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

    // Generate square wave with sample accumulation
    this.generateSquareWave(data, this.SAMPLE_CPU_CYCLES, this.VOLUME);

    // Reset buffer
    this.buffer_index = 0;
    this.prev_frame_offset = 0;
    this.sample_accumulator = 0;

    this.sink?.play(data, this.SAMPLE_RATE);
  }

  // Optimized square wave generation
  generateSquareWave(data, sample_cpu_cycles, volume) {
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

    // Check for buffer overflow
    if (this.buffer_index >= this.sound_buffer.length) {
      this.flushPartialBuffer();
    }

    if (state === this.prev_beeper_state) {
      // Add to the last value
      if (this.buffer_index > 0) {
        this.sound_buffer[this.buffer_index - 1] += inc_offset;
      } else {
        this.sound_buffer[this.buffer_index++] = inc_offset;
      }
    } else {
      // New sound segment
      this.sound_buffer[this.buffer_index++] = inc_offset;
      this.prev_beeper_state = state;
    }

    this.prev_frame_offset = frame_offset;
  }

  // Handle partial buffer overflow
  flushPartialBuffer() {
    console.warn('BEEPER: Buffer overflow, flushing partial buffer');
    this.play(); // Play accumulated data
    this.buffer_index = 0;
    this.sample_accumulator = 0;
  }
}
