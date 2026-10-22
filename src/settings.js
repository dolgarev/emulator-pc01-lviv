// The frame the emulator starts in (P2.20): '50hz' is the 20 ms frame of 44800 cycles the
// versions before P2.20 used, '48.83hz' is the frame the video circuit makes. Both are in
// the `FRAMES` table of `src/config.js`. The faithful frame slows the timing of every
// program by 2.4 % and drops its pitch by 1.8 %, so the 20 ms frame stays the default and
// the faithful one is a setting away.
export const DEFAULT_FRAME = '50hz';

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
    // Cycles the display aspect ratio (P3.8.3); its label shows the ratio a
    // click switches to.
    aspect_ratio_button: {
      id: 'aspect_ratio_button',
    },
    // Toggles the adaptive "fit to window" mode (P3.8.7); its label shows the
    // mode a click switches to.
    auto_scale_button: {
      id: 'auto_scale_button',
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
    // Length of the video frame (P2.20). The frames themselves are in the `FRAMES` table
    // of `src/config.js` and the default is in `DEFAULT_FRAME` above. It is not exposed in
    // the interface: set it here (or call `Config.set_frame()` on a running machine) to
    // compare the two by ear.
    frame: DEFAULT_FRAME,
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

      default:
        // Any other name is a machine profile (`Config` validates it): keep the defaults
        // and pass the name through, so `new Emulator('pc01_lvov_80_fixed')` starts that
        // machine instead of falling back to the default one, while a typo fails loudly
        // in Config instead of silently selecting the wrong model (CODE_REVIEW.md P3.21).
        predefined_settings.computer = {
          profile,
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
