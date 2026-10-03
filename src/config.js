import { Settings } from './settings.js';
import { assertInstance } from './utils/assert.js';

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
            allow_brief_decoding: true,
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
            allow_brief_decoding: true,
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

    if (!settings.cpu.frame_cycles) {
      settings.cpu.frame_cycles = emu_settings.cpu[settings.cpu.model].frame_cycles;
    }

    // The frame rate comes from the video circuit and does not depend on the CPU
    // speed: 44800 cycles at 2.2 MHz is one 20 ms PAL frame (50 Hz).
    settings.cpu.frame_duration = Math.round(
      (settings.cpu.frame_cycles * 1000) / settings.cpu.clock_speed
    );

    // Emulated CPU speed. On the real PC-01 the video circuit stole cycles on
    // every RAM access, so the CPU completed only ~60% of its nominal cycles
    // (see CODE_REVIEW.md, P2.11): a slower CPU executes fewer cycles within the
    // same frame instead of lowering the frame rate.
    const speed_factor =
      (emu_settings.cpu.speed_factor ?? 1) * (emu_settings.computer.allow_turbo_mode ? 4 : 1);

    if (!(speed_factor > 0)) {
      throw new RangeError('CONFIG: Invalid CPU speed factor');
    }

    settings.cpu.frame_work_cycles = Math.round(settings.cpu.frame_cycles * speed_factor);

    // Cycles per second the CPU really executes; the beeper turns CPU cycles into
    // audio samples with it, so a slower machine also sounds slower.
    settings.cpu.effective_clock_speed = Math.round(
      (settings.cpu.frame_work_cycles * 1000) / settings.cpu.frame_duration
    );

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

    Object.assign(this, settings);
    Object.freeze(this);
  }
}
