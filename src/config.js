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

    settings.cpu.frame_duration = Math.round(
      (settings.cpu.frame_cycles * 1000) / settings.cpu.clock_speed
    );
    if (emu_settings.computer.allow_turbo_mode) {
      settings.cpu.frame_duration >>= 2;
    }

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

    if ('image' in emu_settings.rom) {
      settings.rom.image = emu_settings.rom.image;
    }

    Object.assign(this, settings);
    Object.freeze(this);
  }
}
