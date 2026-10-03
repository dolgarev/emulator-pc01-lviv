// Web Audio output for the beeper.
//[http://middleearmedia.com/web-audio-api-basics/]
//[https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode]
//[http://www.html5rocks.com/en/tutorials/webaudio/games/]

import { Config } from './config.js';
import { assertInstance } from './utils/assert.js';

// Removes the DC offset that a constant beeper level leaves in the output.
const DC_BLOCKER_FREQUENCY = 20;

// Typical small piezo emitter. The PC-01 drove the same kind of membrane as the
// push-button telephones of that era: the signal leaves the mainboard through an
// open-collector gate and reaches the emitter via the BUZZER pin of the keyboard
// connector. Such an emitter is a resonant, capacitive load - it moves almost no air
// below a few hundred Hz and has a mechanical resonance in the low kHz range.
//
// The numbers below are a plausible approximation, not data for the part actually
// used: the surviving parts list is a scan, so the emitter type (and with it the
// real resonance) could not be read. See CODE_REVIEW.md, P3.11.
const PIEZO_MODEL = {
  low_cut: 400, // Hz - below this the disc is almost silent
  resonance: 3000, // Hz - mechanical resonance of a small disc
  resonance_gain: 9, // dB
  resonance_q: 1, // broad peak
  high_cut: 10000, // Hz - the top end rolls off instead of ringing
};

export class AudioSink {
  constructor(config, context = undefined) {
    assertInstance(config, Config, 'AUDIO_SINK: Invalid CONFIG object');
    this.config = config;

    // The AudioContext is created on the first user gesture because of the browser
    // autoplay policy; tests can inject one.
    this.context = context;
    this.chain = undefined;
    this.chain_built = false;
    this.warned_suspended = false;
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

  // Filters between the buffers and the output. Built on demand, because the context
  // does not exist yet when the sink is constructed.
  createChain() {
    const context = this.audio_context;
    const nodes = [];

    if (this.config.beeper.allow_highpass_filter) {
      nodes.push(this.createFilter(context, { type: 'highpass', frequency: DC_BLOCKER_FREQUENCY }));
    }

    if (this.config.beeper.speaker_model === 'piezo') {
      nodes.push(
        this.createFilter(context, { type: 'highpass', frequency: PIEZO_MODEL.low_cut }),
        this.createFilter(context, {
          type: 'peaking',
          frequency: PIEZO_MODEL.resonance,
          Q: PIEZO_MODEL.resonance_q,
          gain: PIEZO_MODEL.resonance_gain,
        }),
        this.createFilter(context, { type: 'lowpass', frequency: PIEZO_MODEL.high_cut })
      );
    }

    for (let i = 0; i < nodes.length; i++) {
      nodes[i].connect(nodes[i + 1] ?? context.destination);
    }

    return nodes[0];
  }

  createFilter(context, { type, frequency, Q = 0, gain = undefined }) {
    const filter = context.createBiquadFilter();

    filter.type = type;
    filter.frequency.value = frequency;
    // For highpass and lowpass Q is in dB, so 0 gives a maximally flat response.
    filter.Q.value = Q;
    if (gain !== undefined) filter.gain.value = gain;

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
      if (!this.chain_built) {
        this.chain_built = true;
        this.chain = this.createChain();
      }

      const source = context.createBufferSource();
      const buffer = context.createBuffer(1, samples.length, sample_rate);
      buffer.getChannelData(0).set(samples);

      source.buffer = buffer;
      source.connect(this.chain ?? context.destination);

      // Each buffer is played as soon as it is handed over. Scheduling the buffers
      // on the audio clock (a queue with a lead over currentTime) was tried and
      // reverted: to the ear it produced notes overlapping, and the cause could not
      // be pinned down. The beeper hands over exactly one frame of audio per emulated
      // frame, so the production and the consumption stay balanced anyway.
      source.start(0);
    } catch (error) {
      console.error('AUDIO_SINK: Failed to play sound:', error);
    }
  }
}
