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
    // Selects the machine, i.e. the `Config` profile the whole emulator is built
    // from (P2.16); its options carry the profile names.
    machine_select: {
      id: 'machine_select',
    },
    // Length of the video frame (P2.20): the 20.48 ms frame of the video circuit or the
    // 20 ms approximation the emulator used before. Unlike the machine (P2.16), the
    // choice is applied to the profile the emulator is already running.
    frame_select: {
      id: 'frame_select',
    },
    aspect_ratio_select: {
      id: 'aspect_ratio_select',
    },
    auto_scale_checkbox: {
      id: 'auto_scale_checkbox',
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
    //   1.0 - the nominal clock of the processor (2.2 MHz, 45056 cycles every 20.48 ms
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
    // Only the work done within a frame changes - the length of the frame itself comes
    // from `frame` below.
    speed_factor: 1.0,
    // Charge the cycles the video circuit steals on RAM accesses (P2.11). This is the
    // faithful way to slow the machine down: code in ROM keeps the nominal speed, so the
    // ROM's tone loop still sounds at the right pitch while RAM code loses about 40% of
    // its cycles. Use either this or a speed factor below 1.0, not both.
    wait_states: true,
    // Length of the video frame (P2.20): 'pc01' is the frame the video circuit makes -
    // 320 x 80 x 16 = 409600 ticks of the 20 MHz oscillator, i.e. 20.48 ms at 48.83
    // frames per second and 45056 CPU cycles at the nominal 2.2 MHz; 'legacy' is the
    // 20 ms frame of 44800 cycles of the versions before it, in which the machine runs
    // 2.4 % fast and its tones are 1.8 % sharp. `controls.frame_select` switches it while
    // the machine runs; the frames themselves are in `src/config.js` (FRAMES).
    frame: 'pc01',
    i8080: {
      clock_speed: 2.2 * 1000000,
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
    // Display aspect ratio (P3.8.3): a preset name ('1:1', '4:3', '16:9') or a
    // number. The PC-01 framebuffer is 256×256 pixels shown on a CRT with
    // non-square pixels, so '4:3' is the faithful default.
    aspect_ratio: '4:3',
    // Automatically pick the largest integer scale that fits the canvas container
    // (P3.8.7). Off by default to keep the classic fixed 2× view.
    auto_scale: false,
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
