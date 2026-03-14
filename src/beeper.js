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
import { I8080 } from './i8080.js';

export class Beeper {
  constructor(config) {
    //[http://middleearmedia.com/web-audio-api-basics/]
    //[https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode]
    //http://www.html5rocks.com/en/tutorials/webaudio/games/
    //TODO
    //[https://github.com/jeromeetienne/webaudiox]
    //[http://blog.jetienne.com/blog/2014/02/18/webaudiox-a-dry-library-for-webaudio-api/]

    if (!(config instanceof Config)) {
      throw new Error('BEEPER: Invalid CONFIG object');
    }
    this.config = config;

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

  static getAudioContextClass() {
    return (
      window.AudioContext ||
      window.webkitAudioContext ||
      window.mozAudioContext ||
      window.oAudioContext ||
      window.msAudioContext ||
      null
    );
  }

  static activate() {
    console.log('BEEPER: Attempting to activate AudioContext...');

    const AudioContextClass = Beeper.getAudioContextClass();
    if (!AudioContextClass) {
      console.warn('BEEPER: Web Audio API not supported');
      return null;
    }

    try {
      Beeper.ctx ??= new AudioContextClass();
      console.log('BEEPER: AudioContext created. State:', Beeper.ctx.state);
      return Beeper.ctx;
    } catch (error) {
      console.error('BEEPER: Failed to create AudioContext:', error);
      return null;
    }
  }

  init() {
    this.restart();

    if (this.allow_sound) {
      if (this.config.beeper.allow_highpass_filter) {
        this.filter = Beeper.ctx.createBiquadFilter();
        this.filter.type = 'highpass';
        this.filter.frequency.value = 440;
        this.filter.Q.value = 0;
        this.filter.gain.value = 0;
      }
    }
  }

  restart() {
    this.buffer_index = 0;
    this.sample_accumulator = 0;
    this.prev_frame_offset = 0;
    this.prev_beeper_state = 0;
  }

  get allow_sound() {
    return this.config.beeper.allow_sound && !!Beeper.ctx;
  }

  play() {
    if (!this.allow_sound || this.buffer_index === 0) return;

    const ctx = Beeper.ctx;
    if (!ctx) return;

    // Auto-resume context with error handling
    if (ctx.state === 'suspended') {
      ctx.resume().catch((err) => {
        console.warn('BEEPER: Failed to resume AudioContext:', err);
        return;
      });
    }

    if (ctx.state !== 'running') {
      console.warn('BEEPER: AudioContext not running, state:', ctx.state);
      return;
    }

    try {
      const source = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, this.SAMPLE_BUFFER_SIZE, this.SAMPLE_RATE);
      const data = buffer.getChannelData(0);
      const sample_cpu_cycles = this.SAMPLE_CPU_CYCLES;
      const volume = this.VOLUME;

      // Generate square wave with sample accumulation
      this.generateSquareWave(data, sample_cpu_cycles, volume);

      if (this.filter) {
        source.connect(this.filter);
        this.filter.connect(ctx.destination);
      } else {
        source.connect(ctx.destination);
      }

      source.buffer = buffer;
      source.start(0);
    } catch (error) {
      console.error('BEEPER: Failed to play sound:', error);
    }

    // Reset buffer
    this.buffer_index = 0;
    this.prev_frame_offset = 0;
    this.sample_accumulator = 0;
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
    const frame_offset = I8080.total_cpu_cycles - I8080.start_frame;
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
