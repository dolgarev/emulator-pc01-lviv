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
        connect: vi.fn(),
      };
      filters.push(filter);
      return filter;
    },
  };
}

function createSink({ highpass = false, sample_rate = 44100 } = {}) {
  const settings = new Settings('default');
  settings.beeper.allow_highpass_filter = highpass;

  const context = createContext({ sample_rate });
  const sink = new AudioSink(new Config(settings, 'pc01_lvov_80'), context);

  return { sink, context };
}

const frame = () => new Float32Array(882); // 20 ms at 44.1 kHz

describe('AudioSink', () => {
  it('queues buffers back to back on the audio clock', () => {
    const { sink, context } = createSink();

    sink.play(frame(), 44100);
    context.time = 0.005; // the caller is early: the queue has to wait, not splice
    sink.play(frame(), 44100);

    expect(context.starts).toHaveLength(2);
    expect(context.starts[0]).toBe(0);
    expect(context.starts[1]).toBeCloseTo(0.02, 6);
  });

  it('resynchronises with the clock after an underrun', () => {
    const { sink, context } = createSink();

    sink.play(frame(), 44100);
    context.time = 5; // the tab was throttled for a while
    sink.play(frame(), 44100);

    expect(context.starts[1]).toBe(5);
  });

  it('reports the sample rate of the output device', () => {
    expect(createSink({ sample_rate: 48000 }).sink.sample_rate).toBe(48000);
    expect(createSink().sink.sample_rate).toBe(44100);
  });

  it('creates the DC blocker on demand, when the context exists', () => {
    const { sink, context } = createSink({ highpass: true });

    sink.play(frame(), 44100);

    expect(context.filters).toHaveLength(1);
    expect(context.filters[0].type).toBe('highpass');
    expect(context.filters[0].frequency.value).toBe(20);
    expect(context.starts).toHaveLength(1);

    // Only one filter for all frames.
    sink.play(frame(), 44100);
    expect(context.filters).toHaveLength(1);
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
