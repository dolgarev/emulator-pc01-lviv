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

// Web Audio output for the beeper.
//[http://middleearmedia.com/web-audio-api-basics/]
//[https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode]

import { Config } from './config.js';
import { assertInstance } from './utils/assert.js';

export class AudioSink {
  constructor(config) {
    assertInstance(config, Config, 'AUDIO_SINK: Invalid CONFIG object');
    this.config = config;
    this.filter = undefined;

    this.init();
  }

  static activate() {
    try {
      AudioSink.ctx ??= new window.AudioContext();
      return AudioSink.ctx;
    } catch (error) {
      console.error('AUDIO_SINK: Failed to create AudioContext:', error);
      return null;
    }
  }

  get allow_sound() {
    return this.config.beeper.allow_sound && !!AudioSink.ctx;
  }

  init() {
    if (this.allow_sound && this.config.beeper.allow_highpass_filter) {
      this.filter = AudioSink.ctx.createBiquadFilter();
      this.filter.type = 'highpass';
      this.filter.frequency.value = 440;
      this.filter.Q.value = 0;
      this.filter.gain.value = 0;
    }
  }

  play(samples, sample_rate) {
    if (!this.allow_sound || !samples || samples.length === 0) return;

    const ctx = AudioSink.ctx;

    // Auto-resume context with error handling
    if (ctx.state === 'suspended') {
      ctx.resume().catch((err) => {
        console.warn('AUDIO_SINK: Failed to resume AudioContext:', err);
        return;
      });
    }

    if (ctx.state !== 'running') {
      console.warn('AUDIO_SINK: AudioContext not running, state:', ctx.state);
      return;
    }

    try {
      const source = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, samples.length, sample_rate);
      buffer.getChannelData(0).set(samples);

      if (this.filter) {
        source.connect(this.filter);
        this.filter.connect(ctx.destination);
      } else {
        source.connect(ctx.destination);
      }

      source.buffer = buffer;
      source.start(0);
    } catch (error) {
      console.error('AUDIO_SINK: Failed to play sound:', error);
    }
  }
}
