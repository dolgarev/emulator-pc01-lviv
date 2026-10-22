import { describe, it, expect, vi, afterEach } from 'vitest';
import { ComputerProfile } from '../src/computerProfile.js';
import { Keyboard } from '../src/keyboard.js';
import { UiBinding } from '../src/uiBinding.js';
import { Notify } from '../src/notify.js';
import { createCore } from './helpers.js';

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
  ui,
  keyboard,
  tape,
  settings = { tape: { is_connected: false }, dnd: { is_connected: false } },
} = {}) {
  const ticker = new FakeTicker();
  // The order in which the components are restarted by ComputerProfile.reset() (P3.25).
  const order = [];
  const cpu = {
    cycles: 0,
    run(cycles) {
      this.cycles += cycles;
    },
    idle() {},
    restart() {
      order.push('cpu');
    },
  };
  const beeper = {
    plays: 0,
    restarts: 0,
    discards: 0,
    play() {
      this.plays += 1;
    },
    restart() {
      this.restarts += 1;
      order.push('beeper');
    },
    discard_frame() {
      this.discards += 1;
    },
  };

  const profile = new ComputerProfile({
    settings,
    profile: 'test',
    config: {
      cpu: { frame_duration, frame_cycles, frame_work_cycles },
      traps: { profile: 'test' },
    },
    beeper,
    keyboard: keyboard ?? {
      special_keys: 0,
      reset() {},
      reset_special_keys() {},
      restart() {},
    },
    io: {
      restart() {
        order.push('io');
      },
    },
    memory: { restart() {} },
    rom: { async init() {}, restart() {} },
    traps: { activate() {} },
    cpu,
    viewport: {
      renderScreen() {},
      pause() {},
      terminate() {},
      setAspectRatio: vi.fn(),
      setAutoScale: vi.fn(),
    },
    screen: { restart() {}, change_color_mode() {}, change_palette() {} },
    ticker,
    tape,
    storage: {},
    ui,
  });

  return { profile, ticker, cpu, beeper, order };
}

// Runs the pending animation frame and returns the next queued one.
function step(ticker) {
  const frame = ticker.frames.shift();
  frame();
  return frame;
}

function displayButton() {
  return Object.assign(new EventTarget(), {
    textContent: '',
    setAttribute() {},
  });
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

  it('does not render an extra audio frame when suspended', () => {
    const { profile, ticker, beeper } = createProfile({ frame_duration: 10 });

    profile.run();
    ticker.time = 10;
    step(ticker);
    expect(beeper.plays).toBe(1);

    profile.suspend();

    expect(beeper.plays).toBe(1); // no buffer outside an emulated frame
    expect(beeper.discards).toBe(1); // only the partial frame is dropped
    expect(beeper.restarts).toBe(0); // the audio already queued keeps playing (P3.24)
  });

  it('drops the queued audio when the machine is terminated (P3.24)', () => {
    const { profile, ticker, beeper } = createProfile({ frame_duration: 10 });

    profile.run();
    ticker.time = 10;
    step(ticker);

    profile.suspend();
    profile.resume();
    expect(beeper.restarts).toBe(0); // the same machine comes back after a suspension

    profile.terminate();
    expect(beeper.restarts).toBe(1); // the machine is gone, so its audio must not play on
  });

  it('restarts the beeper after the clock and the ports (P3.25)', () => {
    const { profile, beeper, order } = createProfile();

    profile.reset();

    // io.restart() publishes the level the RESET ports hold and cpu.restart() puts the
    // shared Clock back at zero, so the beeper has to start over after both - restarted
    // first, it recorded a segment at the offset of the run that was ending and the next
    // segment came out negative.
    expect(order).toEqual(['io', 'cpu', 'beeper']);
    expect(beeper.restarts).toBe(1);
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
    const { profile, ticker, cpu, beeper } = createProfile({
      frame_duration: 10,
      frame_cycles: 1000,
    });

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
    // suspend() dropped the partial audio; the interrupted frame must not add a held one.
    expect(beeper.plays).toBe(0);
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

describe('ComputerProfile screenshot button (P3.28)', () => {
  it('takes a screenshot when the toolbar button is clicked', async () => {
    const screenshot_button = Object.assign(new EventTarget(), {
      click() {
        this.dispatchEvent(new Event('click'));
      },
    });
    const ui = new UiBinding({ screenshot_button });
    const { profile } = createProfile({ ui });

    profile.shoot = vi.fn();

    await profile.initAsync();
    screenshot_button.click();

    expect(profile.shoot).toHaveBeenCalledOnce();
  });
});

describe('ComputerProfile display shortcuts (P3.29)', () => {
  it('routes Ctrl+A and Ctrl+F through the toolbar controls', async () => {
    const aspect_ratio_button = displayButton();
    const auto_scale_button = displayButton();
    const ui = new UiBinding({
      aspect_ratio_button,
      auto_scale_button,
      aspect_ratio: '4:3',
      auto_scale: false,
    });
    const keyboard = new Keyboard();
    const { profile, ticker } = createProfile({ ui, keyboard });

    await profile.initAsync();
    profile.run();

    keyboard.press('KeyA', false, Keyboard.IS_CTRL);
    ticker.time = 10;
    step(ticker);

    expect(profile.viewport.setAspectRatio).toHaveBeenCalledWith('1:1');
    expect(aspect_ratio_button.textContent).toBe('16:9');

    keyboard.press('KeyF', false, Keyboard.IS_CTRL);
    ticker.time = 20;
    step(ticker);

    expect(profile.viewport.setAutoScale).toHaveBeenCalledWith(true);
    expect(auto_scale_button.textContent).toBe('2×');
  });
});

describe('ComputerProfile toolbar shortcuts (P3.30)', () => {
  it('routes Ctrl+L to LOAD and Ctrl+H to HELP', async () => {
    const help_button = { click: vi.fn() };
    const ui = new UiBinding({ help_button });
    const keyboard = new Keyboard();
    const tape = { load: vi.fn().mockResolvedValue(new DataView(new ArrayBuffer(10))) };
    const settings = { tape: { is_connected: true }, dnd: { is_connected: false } };
    const { profile, ticker } = createProfile({ ui, keyboard, tape, settings });

    const loadData = vi.spyOn(profile, 'load').mockResolvedValue(true);

    await profile.initAsync();
    profile.run();

    keyboard.press('KeyL', false, Keyboard.IS_CTRL);
    ticker.time = 10;
    step(ticker);

    expect(tape.load).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(loadData).toHaveBeenCalledOnce());

    keyboard.press('KeyH', false, Keyboard.IS_CTRL);
    ticker.time = 20;
    step(ticker);

    expect(help_button.click).toHaveBeenCalledOnce();
  });
});

describe('ComputerProfile machine selector (P2.16)', () => {
  it('hands the machine chosen in the UI to the owner of the profile', async () => {
    const machine_select = Object.assign(new EventTarget(), { value: 'standard' });
    const ui = new UiBinding({ machine_select });
    const { profile } = createProfile({ ui });

    const machines = [];
    profile.onMachine((machine) => machines.push(machine));

    await profile.initAsync();

    machine_select.value = 'standard_extended';
    machine_select.dispatchEvent(new Event('change'));

    expect(machines).toEqual(['standard_extended']);
  });
});

describe('ComputerProfile.load of a malformed file (P2.21)', () => {
  // `load()` is the path a dropped/selected file takes: it must report the problem and
  // resolve `false`, never reject into the drop handler.
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function loadWithNotify(data) {
    const { storage } = createCore();
    const profile = new ComputerProfile({ config: {}, storage });
    const messages = [];
    const original = Notify.show;
    Notify.show = (message) => messages.push(message);

    try {
      const result = await profile.load(data);
      return { result, messages };
    } finally {
      Notify.show = original;
    }
  }

  it('reports a file too short for a header', async () => {
    quiet();

    const { result, messages } = await loadWithNotify(new DataView(new Uint8Array(9).buffer));

    expect(result).toBe(false);
    expect(messages).toEqual(['Invalid file structure.']);
  });

  it('reports a truncated BLOAD tape before booting BASIC', async () => {
    quiet();

    const data = new DataView(new Uint8Array(10).buffer);
    data.setUint8(0x09, 0xd0);

    const { result, messages } = await loadWithNotify(data);

    expect(result).toBe(false);
    expect(messages).toEqual(['Invalid file structure.']);
  });

  it('reports a truncated LVOV snapshot after a valid header', async () => {
    quiet();

    // A real header (byte 0x09 is the '/' that selects the LVOV case) and no body.
    const header = new TextEncoder().encode('LVOV/DUMP/2.0/H+\0');
    const { result, messages } = await loadWithNotify(new DataView(header.buffer));

    expect(header).toHaveLength(0x11);
    expect(result).toBe(false);
    expect(messages).toEqual(['Invalid file structure.']);
  });

  it('reports an unknown file type', async () => {
    quiet();

    const { result, messages } = await loadWithNotify(new DataView(new Uint8Array(0x20).buffer));

    expect(result).toBe(false);
    expect(messages).toEqual(['Invalid file structure.']);
  });
});

describe('ComputerProfile snapshot restore and the beeper (P3.18)', () => {
  function createProfileWithCore() {
    const core = createCore();

    return {
      core,
      profile: new ComputerProfile({
        config: core.config,
        storage: core.storage,
        beeper: core.beeper,
      }),
    };
  }

  it('restarts the beeper with the clock so the next segment is not negative', () => {
    const { core, profile } = createProfileWithCore();
    const snapshot = new DataView(Uint8Array.from(core.storage.get_snapshot()).buffer);

    core.cpu.run(1000);
    core.beeper.prev_change_offset = 900; // an open run from the previous machine state
    core.beeper.prev_beeper_state = 1;

    profile.set_snapshot(snapshot);

    expect(core.beeper.prev_change_offset).toBe(0);
    // The RESET ports of the restored machine leave the emitter line high, so the beeper
    // takes that level instead of assuming low (CODE_REVIEW.md P3.25).
    expect(core.beeper.prev_beeper_state).toBe(core.io.beeper_level);
    expect(core.beeper.prev_beeper_state).toBe(1);

    // Before the fix the clock was back at 0 while the beeper still remembered 900, so the
    // first segment was -900 CPU cycles and its PCM length came out negative.
    core.beeper.process(0);
    expect(core.beeper.sound_buffer[0]).toBe(0);
  });

  it('restarts the beeper after an Emulator 3000 snapshot too', () => {
    const { core, profile } = createProfileWithCore();

    core.beeper.prev_change_offset = 1234;
    core.beeper.prev_beeper_state = 1;

    profile.set_e3_snapshot(new DataView(new Uint8Array(0x20000).buffer));

    expect(core.beeper.prev_change_offset).toBe(0);
    // In step with the level the restored ports hold, whatever that level is (P3.25).
    expect(core.beeper.prev_beeper_state).toBe(core.io.beeper_level);
  });
});

describe('ComputerProfile.shoot and the screenshot type (P3.19)', () => {
  function createShootingProfile({ configured = 'image/jpeg', produced = 'image/jpeg' } = {}) {
    const saved = [];
    let requested;

    const profile = Object.assign(Object.create(ComputerProfile.prototype), {
      config: { screen: { screenshot_type: configured } },
      hasTape: () => true,
      suspend() {},
      resume() {},
      viewport: {
        takeScreenshoot(callback, type) {
          requested = type;
          callback({ type: produced });
        },
      },
      tape: {
        save(blob, filename) {
          saved.push(filename);
          return Promise.resolve();
        },
      },
    });

    return { profile, saved, requested: () => requested };
  }

  it('passes the configured type to the viewport and names the file after it', async () => {
    const { profile, saved, requested } = createShootingProfile();

    profile.shoot();
    await Promise.resolve();

    expect(requested()).toBe('image/jpeg');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(/\.jpg$/);
  });

  it('follows the type the browser actually produced when it falls back to PNG', async () => {
    const { profile, saved } = createShootingProfile({ produced: 'image/png' });

    profile.shoot();
    await Promise.resolve();

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(/\.png$/);
  });

  it('ignores a screenshot while another operation has suspended the machine', () => {
    const { profile, requested } = createShootingProfile();
    profile.is_suspended = true;

    profile.shoot();

    expect(requested()).toBeUndefined();
  });
});

describe('ComputerProfile.shoot without a tape (P3.22)', () => {
  function profileWithoutTape() {
    return Object.assign(Object.create(ComputerProfile.prototype), {
      config: { screen: { screenshot_type: 'image/png' } },
      hasTape: () => false,
      suspend: vi.fn(),
      viewport: { takeScreenshoot: vi.fn() },
    });
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports why the screenshot was not saved', () => {
    const profile = profileWithoutTape();
    const messages = [];
    const original = Notify.show;
    Notify.show = (message) => messages.push(message);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      profile.shoot();
    } finally {
      Notify.show = original;
    }

    expect(messages).toEqual(['Screenshot not saved: the tape is not connected.']);
    expect(warn).toHaveBeenCalledWith(
      'COMPUTER_PROFILE: Screenshot not saved: the tape is not connected.'
    );
    expect(profile.viewport.takeScreenshoot).not.toHaveBeenCalled();
    expect(profile.suspend).not.toHaveBeenCalled();
  });

  it('does not throw when there is no notification bar', () => {
    const profile = profileWithoutTape();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => profile.shoot()).not.toThrow();
  });
});
