import { describe, it, expect, vi } from 'vitest';
import { AudioSink } from '../src/audioSink.js';
import { Config } from '../src/config.js';
import { Settings } from '../src/settings.js';

// Minimal stand-in for an AudioContext: only what AudioSink uses.
function createContext({ sample_rate = 44100 } = {}) {
  const starts = [];
  const filters = [];

  return {
    starts,
    filters,
    time: 0,
    state: 'running',
    sampleRate: sample_rate,
    destination: { name: 'destination' },

    get currentTime() {
      return this.time;
    },

    resume() {
      return Promise.resolve();
    },

    createBuffer(channels, length, rate) {
      return { duration: length / rate, getChannelData: () => new Float32Array(length) };
    },

    createBufferSource() {
      const source = { buffer: undefined, connect: vi.fn() };
      source.start = (when) => starts.push(when);
      return source;
    },

    createBiquadFilter() {
      const filter = {
        type: '',
        frequency: { value: 0 },
        Q: { value: 0 },
        gain: { value: 0 },
        connect: vi.fn(),
      };
      filters.push(filter);
      return filter;
    },
  };
}

function createSink({ highpass = false, speaker_model = 'flat', sample_rate = 44100 } = {}) {
  const settings = new Settings('default');
  settings.beeper.allow_highpass_filter = highpass;
  settings.beeper.speaker_model = speaker_model;

  const context = createContext({ sample_rate });
  const sink = new AudioSink(new Config(settings, 'pc01_lvov_80'), context);

  return { sink, context };
}

const frame = () => new Float32Array(882); // 20 ms at 44.1 kHz

describe('AudioSink', () => {
  it('plays each buffer as soon as it is handed over', () => {
    const { sink, context } = createSink();

    sink.play(frame(), 44100);
    context.time = 0.005; // the audio clock keeps running between frames
    sink.play(frame(), 44100);

    expect(context.starts).toEqual([0, 0]);
  });

  it('reports the sample rate of the output device', () => {
    expect(createSink({ sample_rate: 48000 }).sink.sample_rate).toBe(48000);
    expect(createSink().sink.sample_rate).toBe(44100);
  });

  it('models the piezo emitter of the real machine', () => {
    const { sink, context } = createSink({ speaker_model: 'piezo' });

    sink.play(frame(), 44100);

    expect(context.filters.map((filter) => filter.type)).toEqual([
      'highpass',
      'peaking',
      'lowpass',
    ]);
    expect(context.filters.map((filter) => filter.frequency.value)).toEqual([700, 3500, 8000]);
    expect(context.filters[1].gain.value).toBe(5);
    expect(context.starts).toHaveLength(1);

    // The chain is built once, not once per frame.
    sink.play(frame(), 44100);
    expect(context.filters).toHaveLength(3);
  });

  it('can fall back to the raw square wave', () => {
    const { sink, context } = createSink({ speaker_model: 'flat' });

    sink.play(frame(), 44100);

    expect(context.filters).toHaveLength(0);
    expect(context.starts).toHaveLength(1);
  });

  it('keeps the DC blocker independent of the speaker model', () => {
    const { sink, context } = createSink({ speaker_model: 'flat' });

    sink.play(frame(), 44100);

    const { sink: filtered, context: withFilter } = createSink({
      speaker_model: 'flat',
      highpass: true,
    });
    filtered.play(frame(), 44100);

    expect(context.filters).toHaveLength(0);
    expect(withFilter.filters).toHaveLength(1);
    expect(withFilter.filters[0].type).toBe('highpass');
    expect(withFilter.filters[0].frequency.value).toBe(20);
  });

  it('stays silent and warns once while the context is not running', () => {
    const { sink, context } = createSink();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    context.state = 'suspended';

    sink.play(frame(), 44100);
    sink.play(frame(), 44100);

    expect(context.starts).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  it('does nothing without a context at all', () => {
    const settings = new Settings('default');
    const sink = new AudioSink(new Config(settings, 'pc01_lvov_80'));

    expect(sink.allow_sound).toBe(false);
    expect(sink.sample_rate).toBeUndefined();
    expect(() => sink.play(frame(), 44100)).not.toThrow();
  });
});
