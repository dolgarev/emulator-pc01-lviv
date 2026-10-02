// Web Audio output for the beeper.
//[http://middleearmedia.com/web-audio-api-basics/]
//[https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode]
//[http://www.html5rocks.com/en/tutorials/webaudio/games/]

import { Config } from './config.js';
import { assertInstance } from './utils/assert.js';

// The beeper hands over exactly one frame of samples per frame, so the queue stays
// around one frame. A much larger lead means something went wrong (a long catch-up
// burst) and the queue is resynchronised instead of letting the latency grow.
const MAX_LEAD_SECONDS = 0.5;

export class AudioSink {
  constructor(config, context = undefined) {
    assertInstance(config, Config, 'AUDIO_SINK: Invalid CONFIG object');
    this.config = config;

    // The AudioContext is created on the first user gesture because of the browser
    // autoplay policy; tests can inject one.
    this.context = context;
    this.filter = undefined;
    this.next_start_time = 0;
    this.warned_suspended = false;
    this.warned_lead = false;
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

  get audio_context() {
    return this.context ?? AudioSink.ctx;
  }

  get allow_sound() {
    return this.config.beeper.allow_sound && !!this.audio_context;
  }

  get sample_rate() {
    return this.audio_context?.sampleRate;
  }

  reset() {
    this.next_start_time = 0;
    this.warned_lead = false;
  }

  // Created on demand: the context does not exist yet when the sink is built.
  createFilter(context) {
    const filter = context.createBiquadFilter();

    // The beeper output is bipolar now, but a constant level (a silent beeper) is a
    // DC offset. 20 Hz removes it and keeps every audible PC-01 tone intact - this
    // used to be a 440 Hz highpass, which cut the fundamentals of low notes.
    filter.type = 'highpass';
    filter.frequency.value = 20;
    filter.Q.value = 0; // in dB for highpass -> maximally flat response
    filter.connect(context.destination);

    return filter;
  }

  play(samples, sample_rate) {
    if (!this.allow_sound || !samples || samples.length === 0) return;

    const context = this.audio_context;

    // Auto-resume context with error handling
    if (context.state === 'suspended') {
      context.resume().catch((err) => {
        console.warn('AUDIO_SINK: Failed to resume AudioContext:', err);
      });
    }

    if (context.state !== 'running') {
      if (!this.warned_suspended) {
        this.warned_suspended = true;
        console.warn('AUDIO_SINK: AudioContext not running, state:', context.state);
      }
      return;
    }

    this.warned_suspended = false;

    try {
      if (!this.filter && this.config.beeper.allow_highpass_filter) {
        this.filter = this.createFilter(context);
      }

      const source = context.createBufferSource();
      const buffer = context.createBuffer(1, samples.length, sample_rate);
      buffer.getChannelData(0).set(samples);

      source.buffer = buffer;
      if (this.filter) {
        source.connect(this.filter);
      } else {
        source.connect(context.destination);
      }

      // Buffers are queued on the audio clock instead of starting whenever the
      // animation frame happens to run: frame jitter then only affects the latency
      // instead of splicing the sound.
      const now = context.currentTime;
      let start = Math.max(now, this.next_start_time);

      if (start - now > MAX_LEAD_SECONDS) {
        start = now;
        if (!this.warned_lead) {
          this.warned_lead = true;
          console.warn('AUDIO_SINK: Audio queue ahead of the audio clock, resynchronising');
        }
      } else {
        this.warned_lead = false;
      }

      source.start(start);
      this.next_start_time = start + buffer.duration;
    } catch (error) {
      console.error('AUDIO_SINK: Failed to play sound:', error);
    }
  }
}
