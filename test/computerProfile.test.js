import { describe, it, expect } from 'vitest';
import { ComputerProfile } from '../src/computerProfile.js';

// Minimal ticker double: time is driven manually and animation frames are
// queued instead of executed.
class FakeTicker {
  constructor() {
    this.time = 0;
    this.frames = [];
    this.cancelled = [];
  }

  now() {
    return this.time;
  }

  requestAnimationFrame(handler) {
    this.frames.push(handler);
    return this.frames.length;
  }

  cancelAnimationFrame(id) {
    this.cancelled.push(id);
    this.frames = [];
  }
}

function createProfile({
  frame_duration = 10,
  frame_cycles = 1000,
  frame_work_cycles = frame_cycles,
} = {}) {
  const ticker = new FakeTicker();
  const cpu = {
    cycles: 0,
    run(cycles) {
      this.cycles += cycles;
    },
    idle() {},
    restart() {},
  };
  const beeper = {
    plays: 0,
    play() {
      this.plays += 1;
    },
    restart() {},
  };

  const profile = new ComputerProfile({
    settings: { tape: { is_connected: false }, dnd: { is_connected: false } },
    profile: 'test',
    config: { cpu: { frame_duration, frame_cycles, frame_work_cycles } },
    beeper,
    keyboard: { special_keys: 0, reset() {}, reset_special_keys() {}, restart() {} },
    io: {},
    memory: {},
    rom: {},
    traps: {},
    cpu,
    viewport: { renderScreen() {}, pause() {}, terminate() {} },
    screen: { restart() {}, change_color_mode() {}, change_palette() {} },
    ticker,
    storage: {},
  });

  return { profile, ticker, cpu, beeper };
}

// Runs the pending animation frame and returns the next queued one.
function step(ticker) {
  const frame = ticker.frames.shift();
  frame();
  return frame;
}

describe('ComputerProfile main loop', () => {
  it('steps whole emulated frames on a fixed timestep', () => {
    const { profile, ticker, cpu } = createProfile({ frame_duration: 10, frame_cycles: 1000 });

    profile.run();
    expect(ticker.frames).toHaveLength(1);

    step(ticker); // no time elapsed yet
    expect(cpu.cycles).toBe(0);

    ticker.time = 25; // two whole 10 ms frames, 5 ms carried over
    step(ticker);
    expect(cpu.cycles).toBe(2000);

    ticker.time = 30; // the 5 ms remainder plus 5 ms -> one more frame
    step(ticker);
    expect(cpu.cycles).toBe(3000);
  });

  it('executes the CPU work budget, not the nominal cycles, per frame', () => {
    const { profile, ticker, cpu } = createProfile({
      frame_duration: 10,
      frame_cycles: 1000,
      frame_work_cycles: 600,
    });

    profile.run();
    ticker.time = 10;
    step(ticker);

    expect(cpu.cycles).toBe(600);
  });

  it('produces one audio buffer per emulated frame, not per animation frame', () => {
    const { profile, ticker, beeper } = createProfile({ frame_duration: 10 });

    profile.run();
    step(ticker); // no emulated frame elapsed -> no audio
    expect(beeper.plays).toBe(0);

    ticker.time = 25; // two emulated frames in a single animation frame
    step(ticker);
    expect(beeper.plays).toBe(2);

    ticker.time = 30;
    step(ticker);
    expect(beeper.plays).toBe(3);
  });

  it('caps the backlog after a long stall', () => {
    const { profile, ticker, cpu } = createProfile({ frame_duration: 10, frame_cycles: 1000 });

    profile.run();
    step(ticker);

    ticker.time = 10_000; // huge stall
    step(ticker);

    expect(cpu.cycles).toBe(5 * 1000); // MAX_FRAME_BACKLOG frames
  });

  it('does not step the CPU while paused', () => {
    const { profile, ticker, cpu } = createProfile();

    profile.run();
    step(ticker);

    profile.pause(true);
    ticker.time = 100;
    step(ticker);

    expect(cpu.cycles).toBe(0);
    expect(profile.is_paused).toBe(true);
  });

  it('cancels the loop on suspend and restarts it on resume', () => {
    const { profile, ticker, cpu } = createProfile({ frame_duration: 10, frame_cycles: 1000 });

    profile.run();
    const frame = step(ticker);
    expect(ticker.frames).toHaveLength(1);

    profile.suspend();

    expect(ticker.cancelled).toEqual([1]);
    expect(profile.animation_frame).toBeUndefined();

    // A frame already in flight must not reschedule itself.
    ticker.time = 100;
    frame();
    expect(ticker.frames).toHaveLength(0);
    expect(cpu.cycles).toBe(0);

    profile.resume();

    expect(profile.is_suspended).toBe(false);
    expect(ticker.frames).toHaveLength(1);

    ticker.time = 110;
    step(ticker);
    expect(cpu.cycles).toBe(1000);
  });

  it('does not start the loop while suspended', () => {
    const { profile, ticker } = createProfile();

    profile.suspend();
    profile.run();

    expect(ticker.frames).toHaveLength(0);
  });

  it('keeps a single loop when the machine resumes from inside a frame', () => {
    const { profile, ticker, cpu } = createProfile({ frame_duration: 10, frame_cycles: 1000 });

    // Loading an attached tape file resumes the machine from the trap, i.e. from
    // inside the frame that is executing.
    let resumed = false;
    const run = cpu.run.bind(cpu);
    cpu.run = (cycles) => {
      if (!resumed) {
        resumed = true;
        profile.suspend();
        profile.resume();
      }
      run(cycles);
    };

    profile.run();
    expect(ticker.frames).toHaveLength(1);

    ticker.time = 10;
    step(ticker); // this frame resumes the machine

    expect(resumed).toBe(true);
    expect(profile.is_suspended).toBe(false);
    // The frame that was interrupted must not schedule a second loop.
    expect(ticker.frames).toHaveLength(1);

    // Two loops would run two emulated frames where the fixed timestep allows one.
    for (let i = 0; i < 10; i++) {
      ticker.time += 10;
      step(ticker);
    }

    expect(cpu.cycles).toBe(11 * 1000);
  });

  it('emulates the real PC-01 clock speed with the default frame timing', () => {
    const { profile, ticker, cpu } = createProfile({ frame_duration: 20, frame_cycles: 44800 });

    profile.run();

    // One second of animation frames at a 20 ms fixed timestep -> 50 emulated
    // frames, i.e. 50 x 44800 = 2.24 M cycles/s (the PC-01 clock speed).
    for (let i = 0; i < 100; i++) {
      ticker.time += 10;
      step(ticker);
    }

    expect(cpu.cycles).toBe(50 * 44800);
  });
});
