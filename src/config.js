import { DEFAULT_FRAME, Settings } from './settings.js';
import { assertInstance } from './utils/assert.js';

// The video frame of the machine (P2.20) or the approximation this emulator used before it.
// The names are the frame rates and the table keeps the exact durations: '48.83hz' is
// 15625/320 Hz, i.e. 20.48 ms exactly. `48.83hz` is the frame the video circuit makes:
// 320 x 80 x 16 = 409600 ticks of the 20 MHz oscillator, which is 45056 CPU cycles at the
// nominal 2.2 MHz - so `effective_clock_speed` comes out exactly 2 200 000 and the tones
// keep the documented pitch of the ROM. `50hz` is the 20 ms frame of 44800 cycles the
// emulator used before P2.20: the machine runs 2.4 % fast and its tones are 1.8 % sharp. It
// is the default (`DEFAULT_FRAME`), the faithful frame being a setting away. Either way the
// frame comes from `settings.cpu.frame`: there is no selector for it in the interface, but
// `set_frame()` still applies another one to a running machine.
const FRAMES = {
  '50hz': { cycles: 44800, duration: 20 },
  '48.83hz': { cycles: 45056, duration: 20.48 },
};

// The base machine: the serial ПК-01 "Львов". The other profiles are deltas on it:
// `standard_fixed` only stops hiding RAM bank 0, `standard_extended` adds the PK-02 board.
function standardProfile(emu_settings) {
  return {
    computer: {
      model: 'ПК-01 "Львов"',
      description: 'Серийная модель',
      profile: 'standard',
    },
    beeper: {
      ignore_control_bit: false,
      allow_sound: emu_settings.beeper.allow_sound,
      allow_highpass_filter: emu_settings.beeper.allow_highpass_filter,
    },
    cpu: {
      model: 'i8080',
      allow_interrupts: false,
    },
    io: {
      // The PK-02 board hangs its port 0xF0 latch (video modes, extended RAM banks) on
      // the X1 connector; the serial machine has nothing there (P2.13, P2.14). The port
      // decoding itself is the same in every profile.
      extended_port_latch: false,
    },
    memory: {
      map: 80,
      hide_0_mem_bank: true,
    },
    rom: {
      image: 1990,
    },
    screen: {
      resolution: 'default',
      allow_color_mode: true,
      aspect_ratio: emu_settings.screen.aspect_ratio,
      auto_scale: emu_settings.screen.auto_scale,
      screenshot_type: emu_settings.screen.screenshot_type,
    },
    traps: {
      profile: 'default',
    },
  };
}

export class Config {
  constructor(emu_settings, profile) {
    assertInstance(emu_settings, Settings, 'CONFIG: Invalid emulator settings');

    const profile_name = profile || emu_settings.computer.profile;
    let settings;

    switch (profile_name) {
      case 'default':
      case 'standard':
        settings = standardProfile(emu_settings);
        break;

      case 'standard_fixed':
        // The serial machine with RAM bank 0 reachable: the only difference (P2.23).
        settings = standardProfile(emu_settings);
        settings.computer.profile = 'standard_fixed';
        settings.memory.hide_0_mem_bank = false;
        break;

      case 'standard_extended':
        // "Серийная модель с некоторыми доработками": this machine carries the PK-02
        // board, so the port 0xF0 latch and the beeper control bit exist here (P2.13,
        // P2.14).
        settings = standardProfile(emu_settings);
        settings.computer.description = 'Серийная модель с некоторыми доработками';
        settings.computer.profile = 'standard_extended';
        settings.beeper.ignore_control_bit = true;
        settings.io.extended_port_latch = true;
        settings.memory.hide_0_mem_bank = false;
        break;

      default:
        throw new Error('Unknown model');
    }

    if (!settings.cpu.clock_speed) {
      settings.cpu.clock_speed = emu_settings.cpu[settings.cpu.model].clock_speed;
    }

    // Emulated CPU speed. On the real PC-01 the video circuit stole cycles on
    // every RAM access, so the CPU completed only ~60% of its nominal cycles
    // (see CODE_REVIEW.md, P2.11): a slower CPU executes fewer cycles within the
    // same frame instead of lowering the frame rate.
    const speed_factor =
      (emu_settings.cpu.speed_factor ?? 1) * (emu_settings.computer.allow_turbo_mode ? 4 : 1);

    if (!(speed_factor > 0)) {
      throw new RangeError('CONFIG: Invalid CPU speed factor');
    }

    settings.cpu.speed_factor = speed_factor;

    // The frame can be switched at run time (P2.20), so a component that sizes itself
    // from it - the beeper sizes its segment buffer this way - needs the longest frame
    // too. The numbers of the frame that is selected are made by `set_frame()` below.
    settings.cpu.frame_cycles_max = Math.max(...Object.values(FRAMES).map((frame) => frame.cycles));
    settings.cpu.frame_work_cycles_max = Math.round(settings.cpu.frame_cycles_max * speed_factor);

    // Wait states on RAM accesses (P2.11): the machine keeps its nominal cycle counter,
    // but the cycles the video circuit steals are charged to the frame budget too.
    settings.cpu.wait_states = emu_settings.cpu.wait_states ?? true;

    if (!settings.memory.strict_mode) {
      settings.memory.strict_mode = emu_settings.memory.strict_mode;
    }

    if (!settings.tape) {
      settings.tape = emu_settings.tape;
    }

    if (!settings.dnd) {
      settings.dnd = emu_settings.dnd;
    }

    if ('allow_color_mode' in emu_settings.screen) {
      settings.screen.allow_color_mode = emu_settings.screen.allow_color_mode;
    }

    if ('ignore_control_bit' in emu_settings.beeper) {
      settings.beeper.ignore_control_bit = emu_settings.beeper.ignore_control_bit;
    }

    // The emitter the beeper drives: a piezo model or the raw square wave.
    const speaker_model = emu_settings.beeper.speaker_model ?? 'flat';

    if (!['flat', 'piezo'].includes(speaker_model)) {
      throw new RangeError('CONFIG: Unknown speaker model');
    }

    settings.beeper.speaker_model = speaker_model;

    if ('image' in emu_settings.rom) {
      settings.rom.image = emu_settings.rom.image;
    }

    // The frame the machine starts in: the 20 ms / 50 Hz approximation unless the settings
    // ask for the faithful one (P2.20).
    settings.cpu.frame = emu_settings.cpu.frame ?? DEFAULT_FRAME;

    Object.assign(this, settings);
    this.set_frame(settings.cpu.frame);
    Object.freeze(this);
  }

  /**
   * Applies one of the frames of `FRAMES` to the machine (P2.20). `Config` calls it for
   * `settings.cpu.frame`; called later it switches the frame of a running machine. The
   * frame loop reads these numbers on every display frame and the beeper carries the
   * fractional samples of a frame over, so nothing has to be rebuilt - only the cycle
   * budget and the pitch (`effective_clock_speed`) change.
   * @param {string} name - Key of FRAMES: '50hz' (the default approximation) or '48.83hz'
   *   (the frame the video circuit makes).
   */
  set_frame(name) {
    const frame = FRAMES[name];

    if (!frame) {
      throw new RangeError('CONFIG: Unknown frame');
    }

    this.cpu.frame = name;
    this.cpu.frame_cycles = frame.cycles;
    this.cpu.frame_duration = frame.duration;
    this.cpu.frame_work_cycles = Math.round(frame.cycles * this.cpu.speed_factor);

    // Cycles per second the CPU really executes; the beeper turns CPU cycles into audio
    // samples with it, so a slower machine also sounds slower.
    this.cpu.effective_clock_speed = Math.round(
      (this.cpu.frame_work_cycles * 1000) / frame.duration
    );
  }
}
