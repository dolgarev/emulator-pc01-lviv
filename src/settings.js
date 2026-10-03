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
    // Emitter model: 'flat' (the unfiltered 1-bit square wave - the default) or 'piezo'
    // (a model of the built-in ЗП-1 piezo capsule: band 700 Hz .. 8 kHz with a lift at
    // 3.5 kHz, following the 3-5 kHz resonance of its TU; see CODE_REVIEW.md P3.11).
    speaker_model: 'flat',
  },
  cpu: {
    // Emulated CPU speed relative to the documented clock of the machine:
    //   1.0 - the nominal clock of the processor (2.2 MHz, 44800 cycles every 20 ms
    //         frame); tones come out at the pitch the ROM produces them with;
    //   0.6 - what the real PC-01 effectively delivered: the video circuit took
    //         roughly 2.3 extra cycles on every RAM access, so the CPU completed
    //         only ~60% of its nominal cycles (see CODE_REVIEW.md, P2.11).
    //         Careful: this factor also scales the *pitch* of the beeper, because the
    //         tone frequency is the machine's cycle rate divided by twice the length of
    //         the ROM's tone loop - at 0.6 every note sounds a factor of ~1.64 low. A
    //         model that keeps the pitch while slowing the work needs the wait cycles
    //         charged on RAM accesses instead of one global factor: that is what
    //         `wait_states` below does, and it is the default.
    // Only the work done within a frame changes - the frame rate stays at 50 Hz.
    speed_factor: 1.0,
    // Charge the cycles the video circuit steals on RAM accesses (P2.11). This is the
    // faithful way to slow the machine down: code in ROM keeps the nominal speed, so the
    // ROM's tone loop still sounds at the right pitch while RAM code loses about 40% of
    // its cycles. Use either this or a speed factor below 1.0, not both.
    wait_states: true,
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
