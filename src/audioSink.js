// Web Audio output for the beeper.
//[http://middleearmedia.com/web-audio-api-basics/]
//[https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode]
//[http://www.html5rocks.com/en/tutorials/webaudio/games/]

import { Config } from './config.js';
import { assertInstance } from './utils/assert.js';

// Removes the DC offset that a constant beeper level leaves in the output.
const DC_BLOCKER_FREQUENCY = 20;

// The emitter is a ЗП-1 piezo capsule, and its data comes from the TU (12MO.081.085 TU, the
// designation in the manufacturer's catalogue): resonance frequency 3-5 kHz, sound
// pressure at least 75 dB at 100+/-3 cm, nominal voltage 5+/-2 V, -30..+60 C, mass up to
// 5 g. Shop listings also quote "resonance 1000..3000 Hz" and a 39x4 mm disc, but the
// same numbers appear verbatim across several resellers, while the TU catalogue lists a
// resonance for every type of the series (ЗП-3 4.1 kHz, ЗП-5 1.5-3 kHz, ЗП-22 1-3.5 kHz),
// so the TU is taken as the source of the band.
//
// The capsule is a resonant, capacitive load: it moves almost no air below its band and
// rolls off above it, which is why the machine sounds thin and shrill rather than deep.
// The PC-01 drives it from an open-collector gate through the BUZZER pin of the keyboard
// connector, i.e. as a driven emitter - not in the three-wire self-oscillating circuit
// the same capsule also allows.
//
// The band below comes from the TU; the shape of the curve does not. That shape decides the
// sound, and one guess about it was measurably wrong: taking the rated 3-5 kHz band as a
// passband (highpass at 3000 Hz) pushed the fundamental of every note the software plays
// 20-30 dB under the band, so each note was re-voiced by whichever harmonic happened to land
// in it - a 550 Hz note came out as its 7th harmonic at -29 dB, a 300 Hz note as its 9th at
// -40 dB - which sounds like a pinched, hoarse whistle instead of a melody. The TU says
// nothing about the skirt below the resonance, so the low cut is kept well under the band:
// the fundamental stays within a few dB for the notes actually used (measured -2.8 dB at
// 550 Hz, where it is still the loudest component), while the 3-5 kHz region keeps the
// capsule's lift. No measured response of the mounted capsule is available, nor its
// capacitance or the pull-up resistor of the gate, so the asymmetric edges (fast pull-down,
// RC charge through the pull-up) are not modelled either. See CODE_REVIEW.md, P3.11.
const PIEZO_MODEL = {
  low_cut: 700, // Hz - below the resonance; the real skirt is unknown (see above)
  resonance: 3500, // Hz - inside the resonance band quoted in the TU
  resonance_gain: 5, // dB - the TU quotes a band, so the lift stays modest
  resonance_q: 0.8, // broad peak, wide enough to cover the band
  high_cut: 8000, // Hz - top end rolls off instead of ringing
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
