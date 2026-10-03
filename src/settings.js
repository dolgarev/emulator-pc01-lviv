const DEFAULT_SETTINGS = {
  viewport: {
    container: {
      id: 'canvas_container',
    },
  },
  controls: {
    local_load_button: {
      id: 'load_button',
    },
    help_button: {
      id: 'help_button',
    },
  },
  notify: {
    id: 'notify',
    delay: 3000,
  },
  beeper: {
    allow_sound: true,
    allow_highpass_filter: false,
    // Emitter model: 'piezo' (the built-in ЗП-1 piezo capsule, see CODE_REVIEW.md P3.11)
    // or 'flat' (the raw 1-bit square wave - exactly what Emu80 v4 produces, kept as
    // the unfiltered mode). The capsule is real and its working range is known from
    // the part data, so the model is the default.
    speaker_model: 'piezo',
  },
  cpu: {
    // Emulated CPU speed relative to the documented clock of the machine:
    //   1.0 - the nominal clock (2.2 MHz, 44800 cycles every 20 ms frame);
    //   0.6 - what the real PC-01 effectively delivered: the video circuit took
    //         roughly 2.3 extra cycles on every RAM access, so the CPU completed
    //         only ~60% of its nominal cycles (see CODE_REVIEW.md, P2.11).
    // Only the work done within a frame changes - the frame rate stays at 50 Hz.
    speed_factor: 0.6,
    i8080: {
      clock_speed: 2.2 * 1000000,
      frame_cycles: 44800,
    },
  },
  memory: {
    strict_mode: false,
  },
  rom: {
    image: 1990,
  },
  screen: {
    allow_color_mode: true,
    screenshot_type: 'image/png',
  },
  dump: {
    is_connected: true,
    default_dump: 'mtrack',
  },
  tape: {
    is_connected: true,
    file_extensions: /\.(lv(t|r|[0-9]{1,2})|sav|e3)$/i,
  },
  dnd: {
    is_connected: true,
    container: {
      id: 'body_container',
    },
    file_extensions: /\.(lv(t|r|[0-9]{1,2})|sav|e3)$/i,
  },
};

export class Settings {
  constructor(profile = 'default') {
    const predefined_settings = {};
    switch (profile) {
      case 'default':
      case 'standard':
        predefined_settings.computer = {
          profile: 'pc01_lvov_80',
          // Turbo mode multiplies the CPU speed factor by 4; off by default so the
          // emulator keeps the speed of the real PC-01.
          allow_turbo_mode: false,
        };
        break;

      case 'standard_fixed':
        predefined_settings.computer = {
          profile: 'pc01_lvov_80_fixed',
          allow_turbo_mode: false,
        };
        break;
    }

    // Clone the defaults so that instances never share nested objects: changing
    // e.g. `settings.cpu.speed_factor` at runtime must not leak into other
    // Settings instances.
    const settings = structuredClone({ ...DEFAULT_SETTINGS, ...predefined_settings });
    for (const [prop, value] of Object.entries(settings)) {
      Object.defineProperty(this, prop, { value, enumerable: true });
    }

    Object.freeze(this);
  }
}
