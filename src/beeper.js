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

    this.sound_buffer = [];

    this.init();
  }

  static get_audio_context() {
    return Beeper._audio_context;
  }

  static activate() {
    console.log('BEEPER: Attempting to activate AudioContext...');
    if (AudioContext) {
      Beeper._audio_context ??= new AudioContext();
    }
    if (Beeper._audio_context) {
      console.log('BEEPER: AudioContext created. State:', Beeper._audio_context.state);
    } else {
      console.warn('BEEPER: AudioContext not supported');
    }
    return Beeper._audio_context;
  }

  // For backward compatibility with existing code that might use Beeper.audio_context
  static get audio_context() {
    return Beeper.get_audio_context();
  }

  init() {
    this.restart();

    if (this.allow_sound) {
      if (this.config.beeper.allow_highpass_filter) {
        this.filter = Beeper.audio_context.createBiquadFilter();
        this.filter.type = this.filter.HIGHPASS;
        this.filter.frequency.value = 440;
        this.filter.Q.value = 0;
        this.filter.gain.value = 0;
      }
    }
  }

  restart() {
    this.sound_buffer.length = 0;
    this.prev_frame_offset = 0;
    this.prev_beeper_state = 0;
  }

  get allow_sound() {
    return this.config.beeper.allow_sound && !!Beeper.audio_context;
  }

  play() {
    const sound_buffer = this.sound_buffer;

    if (this.allow_sound) {
      const context = Beeper.audio_context;

      if (Beeper._last_state !== context.state) {
        console.log('BEEPER: play() - AudioContext state:', context.state);
        Beeper._last_state = context.state;
      }

      // Auto-resume if it got suspended again
      if (context.state === 'suspended') {
        context.resume();
      }

      const source = context.createBufferSource();
      const buffer = context.createBuffer(1, this.SAMPLE_BUFFER_SIZE, this.SAMPLE_RATE);
      const data = buffer.getChannelData(0);
      const sample_cpu_cycles = this.SAMPLE_CPU_CYCLES;
      const volume = this.VOLUME;
      let state = 0;

      let n = 0;
      for (const bufferValue of sound_buffer) {
        const v = state && volume;
        for (
          let sample_counter = Math.round(bufferValue / sample_cpu_cycles);
          sample_counter > 0;
          sample_counter--
        ) {
          data[n++] = v;
        }
        state = 1 - state;
      }

      if (this.filter) {
        source.connect(this.filter);
        this.filter.connect(context.destination);
      } else {
        source.connect(context.destination);
      }

      source.buffer = buffer;
      source.start(0);
    }

    this.prev_frame_offset = 0;
    sound_buffer.length = 0;
  }

  process(state) {
    const frame_offset = I8080.total_cpu_cycles - I8080.start_frame;
    const inc_offset = frame_offset - this.prev_frame_offset;
    const sound_buffer = this.sound_buffer;
    const len = sound_buffer.length;

    if (state === this.prev_beeper_state) {
      if (len) {
        sound_buffer[len - 1] += inc_offset;
      } else {
        sound_buffer[len] = inc_offset;
      }
    } else {
      sound_buffer[len] = inc_offset;
      this.prev_beeper_state = state;
    }

    this.prev_frame_offset = frame_offset;
  }
}
