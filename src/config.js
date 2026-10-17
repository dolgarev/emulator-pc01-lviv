import { Settings } from './settings.js';
import { assertInstance } from './utils/assert.js';

// The video frame of the machine (P2.20) or the approximation this emulator used
// before it. `pc01` is the frame the video circuit makes: 320 x 80 x 16 = 409600 ticks
// of the 20 MHz oscillator, i.e. 20.48 ms at 48.83 frames per second, which is 45056 CPU
// cycles at the nominal 2.2 MHz - so `effective_clock_speed` comes out exactly 2 200 000
// and the tones keep the documented pitch. `legacy` is the 20 ms frame of 44800 cycles
// the emulator used before P2.20: the machine runs 2.4 % fast and its tones are 1.8 %
// sharp. The two can be switched while the machine runs (see `set_frame()`), which is the
// point of having them here.
const FRAMES = {
  pc01: { cycles: 45056, duration: 20.48 },
  legacy: { cycles: 44800, duration: 20 },
};

export class Config {
  constructor(emu_settings, profile) {
    assertInstance(emu_settings, Settings, 'CONFIG: Invalid emulator settings');

    let settings;
    switch (profile || emu_settings.computer.profile) {
      case 'default':
      case 'standard':
      case 'pc01_lvov':
      case 'pc01_lvov_80':
        settings = {
          computer: {
            model: 'ПК-01 "Львов"',
            description: 'Серийная модель',
            profile: 'pc01_lvov_80',
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
            // The PK-02 board hangs its port 0xF0 latch (video modes, extended RAM
            // banks) on the X1 connector; the serial machine has nothing there
            // (P2.13, P2.14). The port decoding itself is the same in every profile.
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
        break;

      case 'pc01_lvov_fixed':
      case 'pc01_lvov_80_fixed':
        settings = {
          computer: {
            model: 'ПК-01 "Львов"',
            description: 'Серийная модель с некоторыми доработками',
            profile: 'pc01_lvov_80_fixed',
          },
          beeper: {
            ignore_control_bit: true,
            allow_sound: emu_settings.beeper.allow_sound,
            allow_highpass_filter: emu_settings.beeper.allow_highpass_filter,
          },
          cpu: {
            model: 'i8080',
            allow_interrupts: false,
          },
          io: {
            // "Серийная модель с некоторыми доработками": this machine carries the
            // PK-02 board, so the port 0xF0 latch exists here (P2.13, P2.14).
            extended_port_latch: true,
          },
          memory: {
            map: 80,
            hide_0_mem_bank: false,
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

    // The frame the machine starts in: the one of the video circuit unless the settings
    // ask for the legacy approximation (P2.20).
    settings.cpu.frame = emu_settings.cpu.frame ?? 'pc01';

    Object.assign(this, settings);
    this.set_frame(settings.cpu.frame);
    Object.freeze(this);
  }

  /**
   * Switches the length of the video frame while the machine runs (P2.20). The frame loop
   * reads these numbers on every display frame and the beeper carries the fractional
   * samples of a frame over, so nothing has to be rebuilt - only the cycle budget and the
   * pitch (`effective_clock_speed`) change.
   * @param {string} name - Key of FRAMES: 'pc01' (the frame of the machine) or 'legacy'.
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
