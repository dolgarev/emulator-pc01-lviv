import { Tape } from './tape.js';
import { DnD } from './dnd.js';
import { KeyboardBinding } from './keyboardBinding.js';
import { UiBinding } from './uiBinding.js';
import { BLOAD_HEADER_SIZE, CLOAD_HEADER_SIZE, validateFileHeader } from './utils/fileFormat.js';
import { generateScreenshotFilename, getFileExtension } from './utils/screenshot.js';
import { Dump } from './dump.js';
import { Notify } from './notify.js';
import { assertInstance } from './utils/assert.js';
import { BOOT_CYCLES, applyTapeEntry } from './tapeEntry.js';

// Dependencies nulled out on terminate().
const PROFILE_DEPENDENCIES = [
  'settings',
  'config',
  'beeper',
  'keyboard',
  'keyboard_binding',
  'io',
  'memory',
  'rom',
  'cpu',
  'viewport',
  'screen',
  'tape',
  'dnd',
  'ticker',
  'ui',
  'storage',
];

// Maximum number of emulated frames the main loop may catch up within a single
// animation frame (guards against a spiral of death after a long stall).
const MAX_FRAME_BACKLOG = 5;

export class ComputerProfile {
  /**
   * Constructor with dependency injection (DI)
   */
  constructor({
    settings,
    profile,
    config,
    beeper,
    keyboard,
    keyboard_binding,
    io,
    memory,
    rom,
    cpu,
    viewport,
    screen,
    traps,
    tape,
    dnd,
    ticker,
    ui,
    storage,
  }) {
    this.settings = settings;
    this.profile = profile;
    this.config = config;
    this.beeper = beeper;
    this.keyboard = keyboard;
    this.keyboard_binding = keyboard_binding;
    this.io = io;
    this.memory = memory;
    this.rom = rom;
    this.traps = traps;
    this.cpu = cpu;
    this.viewport = viewport;
    this.screen = screen;
    this.tape = tape;
    this.dnd = dnd;
    this.ticker = ticker;
    this.ui = ui;
    this.storage = storage;

    this.attached_file = void 0;
    this.booted_snapshot = void 0;

    // Set by the owner of the profile (Computer) when it can rebuild the machine
    // on demand - the machine selector of P2.16.
    this.machine_handler = void 0;
    this.animation_frame = void 0;
    this.loop_token = void 0;

    this.is_paused = false;
    this.is_suspended = false;
  }

  async initAsync() {
    await this.rom.init();

    this.traps.activate(this.config.traps.profile, this);

    if (this.settings.tape.is_connected) {
      this.ui.onLoad(async () => {
        if (this.is_suspended) return;

        this.suspend();
        try {
          const file = await this.tape.load();
          this.load(file);
        } finally {
          this.resume();
        }
      });
    }

    if (this.settings.dnd.is_connected) {
      this.dnd.attachDropHandler(async () => {
        if (this.is_suspended) return;

        this.suspend();
        try {
          const file = await this.dnd.read();
          this.load(file);
        } finally {
          this.resume();
        }
      });
    }

    if (this.ui instanceof UiBinding) {
      this.ui.onAspectRatio((value) => this.viewport.setAspectRatio(value));
      this.ui.onAutoScale((checked) => this.viewport.setAutoScale(checked));
      // The machine is not a property of the running profile: choosing another model
      // rebuilds the whole machine, which is the job of whoever owns this profile
      // (P2.16).
      this.ui.onMachine((machine) => {
        if (typeof this.machine_handler === 'function') {
          this.machine_handler(machine);
        }
      });
    }
  }

  /**
   * Registers the handler that switches the machine (P2.16). Called by the owner of
   * the profile before `initAsync()`.
   * @param {Function} handler - Receives the profile name of the chosen machine.
   */
  onMachine(handler) {
    if (typeof handler !== 'function') {
      throw new Error('PROFILE: Handler must be a function');
    }

    this.machine_handler = handler;
  }

  run() {
    const self = this,
      beeper = this.beeper,
      cpu = this.cpu,
      keyboard = this.keyboard,
      screen = this.screen,
      ticker = this.ticker,
      viewport = this.viewport;

    if (this.is_suspended) {
      return;
    }

    // A trap handler can resume the machine from inside the frame that is executing
    // (loading an attached tape file does exactly that), and resume() starts a new
    // loop then. The token marks the loop that is allowed to keep running: without
    // it the frame that was interrupted would queue itself again as well and two
    // loops would run in parallel, doubling the emulated frame rate and the amount
    // of sound produced per second.
    const loop = (this.loop_token = {});

    let prev_time = ticker.now();
    let accumulator = 0;

    function frame() {
      if (self.loop_token !== loop) {
        return;
      }

      if (keyboard.special_keys) {
        switch (keyboard.special_keys) {
          case keyboard.IS_PAUSE:
            self.pause();
            break;

          case keyboard.IS_SHOOT:
            self.shoot();
            break;

          case keyboard.IS_RESET:
            self.reset();
            break;

          case keyboard.IS_COLOR:
            screen.change_color_mode();
            break;

          case keyboard.IS_INC_PALETTE:
            screen.change_palette(1);
            break;

          case keyboard.IS_DEC_PALETTE:
            screen.change_palette(-1);
            break;
        }
        keyboard.reset_special_keys();
      }

      // The length of the video frame can be switched while the machine runs (P2.20), so
      // it is read here, once per display frame, instead of being captured by run().
      const f_duration = self.config.cpu.frame_duration;
      const f_cycles = self.config.cpu.frame_work_cycles;

      const now = ticker.now();
      accumulator += now - prev_time;
      prev_time = now;

      if (self.is_paused || self.is_suspended) {
        accumulator = 0;
      } else {
        // Fixed timestep: run whole emulated frames and carry the remainder
        // over to the next animation frame.
        if (accumulator > f_duration * MAX_FRAME_BACKLOG) {
          accumulator = f_duration * MAX_FRAME_BACKLOG;
        }

        while (accumulator >= f_duration) {
          cpu.run(f_cycles);
          accumulator -= f_duration;

          // A trap can suspend the machine and resume it from inside cpu.run(). The
          // interrupted frame no longer owns the loop, and suspend() has already dropped
          // its partial audio, so emitting a buffer here would add a held frame
          // (CODE_REVIEW.md P3.23).
          if (self.is_suspended || self.loop_token !== loop) break;

          // One buffer of audio per emulated frame. The animation frame rate (60 Hz
          // on a typical display) is not the frame rate of the emulated machine
          // (48.83 Hz, or 50 Hz with the `50hz` frame); the sound has to follow the
          // emulation, not the display.
          beeper.play();
        }
      }

      viewport.renderScreen(screen);

      if (!self.is_suspended && self.loop_token === loop) {
        self.animation_frame = ticker.requestAnimationFrame(frame);
      }
    }

    this.animation_frame = ticker.requestAnimationFrame(frame);
  }

  pause(state = !this.is_paused) {
    this.is_paused = state;

    this.viewport.pause(this.is_paused);
  }

  resume() {
    this.is_suspended = false;

    this.cpu.idle(this.is_suspended);
    // Clear the key states to avoid stuck keys
    this.keyboard.reset();

    this.run();
  }

  suspend() {
    this.is_suspended = true;

    this.cpu.idle(this.is_suspended);

    // Redraw the screen so changes made before the suspension are visible,
    // because the pending requestAnimationFrame will be cancelled.
    this.viewport.renderScreen(this.screen);

    // There is no emulated frame to hand to the sink: play() would emit a full buffer of
    // mostly held level and shift the audio timeline by one frame (CODE_REVIEW.md P3.23).
    // Only the partial frame is dropped: the audio already queued belongs to emulated time
    // that has already happened and plays out during the suspension, so the resume does not
    // cut it off mid-tone (P3.24).
    this.beeper.discard_frame();

    this.ticker.cancelAnimationFrame(this.animation_frame);
    this.animation_frame = void 0;
  }

  reset() {
    this.keyboard.restart();
    this.io.restart();
    this.memory.restart();
    this.cpu.restart();
    this.screen.restart();
    this.rom.restart();
    // The beeper starts over last: IO has just published the level the RESET ports hold and
    // the shared Clock is back at zero, so it takes that level and measures its segments
    // from the new frame boundary - restarting it first recorded a segment at the old
    // offset and the next one came out negative (CODE_REVIEW.md P3.25).
    this.beeper.restart();

    this.detach_file();
  }

  shoot() {
    if (!this.hasTape()) {
      // Without a tape drive there is nowhere to save the screenshot; Ctrl+S used to look
      // broken because this returned silently (CODE_REVIEW.md P3.22).
      const message = 'Screenshot not saved: the tape is not connected.';
      console.warn(`COMPUTER_PROFILE: ${message}`);
      this.notify(message);
      return;
    }

    this.suspend();

    const srctype = this.config.screen.screenshot_type ?? 'image/png';

    this.viewport.takeScreenshoot(async (blob) => {
      try {
        if (blob) {
          // The requested MIME type can be unsupported: canvas.toBlob() then falls back to
          // PNG, so the name follows the type the browser actually produced (P3.19).
          const extension = getFileExtension(blob.type || srctype);
          const filename = generateScreenshotFilename(extension);
          await this.tape.save(blob, filename);
        } else {
          console.error('COMPUTER_PROFILE: Failed to create blob from canvas.');
        }
      } finally {
        this.resume();
      }
    }, srctype);
  }

  terminate() {
    this.suspend();

    // The machine is going away, so the audio still queued for it must not play over the
    // machine that replaces it - unlike a suspension, where the same machine comes back
    // (CODE_REVIEW.md P3.24).
    this.beeper.restart();

    this.viewport.terminate();

    if (this.hasTape()) {
      this.tape.terminate();
    }

    if (this.ui instanceof UiBinding) {
      this.ui.terminate();
    }

    if (this.keyboard_binding instanceof KeyboardBinding) {
      this.keyboard_binding.terminate();
    }

    if (this.dnd instanceof DnD) {
      this.dnd.close();
    }

    for (const dependency of PROFILE_DEPENDENCIES) {
      this[dependency] = null;
    }

    this.detach_file();
  }

  hasTape() {
    return this.tape instanceof Tape;
  }

  /**
   * Restores a chosen or dropped file. A malformed image is reported instead of being
   * thrown: the UI calls this from a drop / file-input handler, where an exception would
   * only become an unhandled rejection and the machine would keep its previous state
   * without a hint (CODE_REVIEW.md P2.21).
   *
   * @returns {Promise<boolean>} true when the file was applied.
   */
  async load(data) {
    assertInstance(data, DataView, 'PROFILE: Param DATA is not DataView');

    if (data.byteLength < 0x0a) {
      return this.invalid_file('file is too short for a header');
    }

    switch (data.getUint8(0x09)) {
      case 0x2f:
        if (!validateFileHeader(data, 'LVOV/DUMP/2.0/H+')) {
          return this.invalid_file('invalid LVOV snapshot header');
        }
        try {
          this.set_snapshot(data);
        } catch (error) {
          return this.invalid_file(`LVOV snapshot: ${error.message}`);
        }
        return true;

      case 0x33:
        if (!validateFileHeader(data, 'Emulator 3000')) {
          return this.invalid_file('invalid Emulator 3000 header');
        }
        try {
          this.set_e3_snapshot(data);
        } catch (error) {
          return this.invalid_file(`Emulator 3000 snapshot: ${error.message}`);
        }
        return true;

      case 0xd0:
        if (data.byteLength < BLOAD_HEADER_SIZE) {
          return this.invalid_file('BLOAD tape is truncated');
        }
        this.launch_tape(data, 'bload');
        return true;

      case 0xd3:
        if (data.byteLength < CLOAD_HEADER_SIZE) {
          return this.invalid_file('CLOAD tape is truncated');
        }
        this.launch_tape(data, 'cload');
        return true;

      default:
        return this.invalid_file(`unknown file type 0x${data.getUint8(0x09).toString(16)}`);
    }
  }

  /**
   * Reports a file that cannot be restored. `Notify` does not exist in the headless
   * scripts that drive the profile (scripts/melody-audio.mjs), so the bar is optional
   * while the console line is not.
   */
  invalid_file(reason) {
    console.error(`PROFILE: Invalid file structure (${reason})`);
    this.notify('Invalid file structure.');
    return false;
  }

  /**
   * Shows a message in the notification bar when one exists. Headless tools that drive the
   * profile have no bar, so `Notify` is optional.
   */
  notify(message) {
    try {
      Notify.show(message);
    } catch {
      // No notification bar in a headless session: the caller logs to the console.
    }
  }

  get_snapshot() {
    return this.storage.get_snapshot();
  }

  set_snapshot(data) {
    return this.storage.set_snapshot(data);
  }

  set_e3_snapshot(data) {
    return this.storage.set_e3_snapshot(data);
  }

  async load_dump(dump) {
    assertInstance(dump, Dump, 'PROFILE: Received invalid DUMP object');

    switch (dump.type) {
      case 'sav':
        try {
          this.set_snapshot(dump.data);
        } catch (error) {
          return this.invalid_file(`sav dump: ${error.message}`);
        }
        return true;

      case 'e3':
        try {
          this.set_e3_snapshot(dump.data);
        } catch (error) {
          return this.invalid_file(`e3 dump: ${error.message}`);
        }
        return true;

      default:
        throw new Error('PROFILE: Unknown DUMP type');
    }
  }

  /**
   * Boots the machine into BASIC and caches the resulting state. The cold-start
   * is deterministic (no external input), so it runs only once per profile;
   * every subsequent .lvt load restores the cached state and applies the small
   * per-command entry delta (see launch_tape).
   */
  boot_basic() {
    if (this.booted_snapshot) return;

    this.reset();
    this.cpu.run(BOOT_CYCLES);
    // The cold-start may flip the beeper; drop its segments so they do not play
    // on top of the freshly loaded program.
    this.beeper.restart();

    // Match the former dump-bload.bin / dump-cload.bin snapshots, which were
    // captured at the BLOAD/CLOAD entry with the video RAM disconnected
    // (MEDIA_PORT bit 2 set).
    this.io.ports[this.io.MEDIA_PORT] |= this.io.VRAM_STATUS_BIT;

    this.booted_snapshot = Uint8Array.from(this.storage.get_snapshot());
  }

  /**
   * Prepares the machine to load a .lvt tape file through the BLOAD/CLOAD trap:
   * restore the booted BASIC base, lay down the entry state the ROM would have
   * after the command is issued, and attach the file. The trap fires on the next
   * executed instruction.
   */
  launch_tape(data, kind) {
    assertInstance(data, DataView, 'PROFILE: Param DATA is not DataView');

    this.boot_basic();

    this.set_snapshot(new DataView(this.booted_snapshot.buffer));

    applyTapeEntry(this.cpu, kind);

    this.attach_file(data);
  }

  bload(data) {
    return this.storage.bload(data);
  }

  cload(data) {
    return this.storage.cload(data);
  }

  get_file() {
    if (!this.exists_attached_file()) {
      throw new Error('PROFILE: Param ATTACHED_FILE is not DataView');
    }

    return this.attached_file;
  }

  attach_file(file) {
    assertInstance(file, DataView, 'PROFILE: Param FILE is not DataView');

    this.attached_file = file;
  }

  detach_file() {
    this.attached_file = null;
  }

  exists_attached_file() {
    return this.attached_file instanceof DataView;
  }
}
