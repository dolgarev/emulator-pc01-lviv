/*
 * Copyright (C) 2014 Oleg Dolgarev <o.dolgarev@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { Settings } from './settings.js';
import { Config } from './config.js';
import { Beeper } from './beeper.js';
import { Keyboard } from './keyboard.js';
import { IO } from './io.js';
import { Memory } from './memory.js';
import { Rom } from './rom.js';
import { I8080 } from './i8080.js';
import { Viewport } from './viewport.js';
import { Screen } from './screen.js';
import { Tape } from './tape.js';
import { DnD } from './dnd.js';
import { Traps } from './traps.js';
import { Dump } from './dump.js';
import { Notify } from './notify.js';
import { ComputerProfile } from './computerProfile.js';

/**
 * ComputerProfileBuilder - Fluent interface for creating a ComputerProfile with dependency injection.
 *
 * Allows configuring emulator components before creating a ComputerProfile,
 * reducing coupling and improving testability.
 */
export class ComputerProfileBuilder {
  constructor() {
    this._settings = null;
    this._profile = null;
    this._config = null;
    this._beeper = null;
    this._keyboard = null;
    this._io = null;
    this._memory = null;
    this._rom = null;
    this._cpu = null;
    this._viewport = null;
    this._screen = null;
    this._tape = null;
    this._dnd = null;
    this._traps = null;
    this._dump = null;
    this._notify = null;
  }

  /**
   * Sets the emulator settings.
   * @param {Settings} settings - Emulator settings.
   * @returns {ComputerProfileBuilder}
   */
  withSettings(settings) {
    if (!(settings instanceof Settings)) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Invalid Settings object');
    }
    this._settings = settings;
    return this;
  }

  /**
   * Sets the configuration profile.
   * @param {string|Object|undefined} profile - Profile name (string), profile object, or undefined.
   * @returns {ComputerProfileBuilder}
   */
  withProfile(profile) {
    this._profile = profile;
    return this;
  }

  /**
   * Sets the configuration (if not set, it will be created automatically).
   * @param {Config} config - Configuration.
   * @returns {ComputerProfileBuilder}
   */
  withConfig(config) {
    if (!(config instanceof Config)) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Invalid Config object');
    }
    this._config = config;
    return this;
  }

  /**
   * Sets the beeper.
   * @param {Beeper} beeper - The beeper.
   * @returns {ComputerProfileBuilder}
   */
  withBeeper(beeper) {
    if (!(beeper instanceof Beeper)) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Invalid Beeper object');
    }
    this._beeper = beeper;
    return this;
  }

  /**
   * Sets the keyboard.
   * @param {Keyboard} keyboard - The keyboard.
   * @returns {ComputerProfileBuilder}
   */
  withKeyboard(keyboard) {
    if (!(keyboard instanceof Keyboard)) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Invalid Keyboard object');
    }
    this._keyboard = keyboard;
    return this;
  }

  /**
   * Sets the I/O ports.
   * @param {IO} io - The I/O ports.
   * @returns {ComputerProfileBuilder}
   */
  withIO(io) {
    if (!(io instanceof IO)) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Invalid IO object');
    }
    this._io = io;
    return this;
  }

  /**
   * Sets the memory.
   * @param {Memory} memory - The memory.
   * @returns {ComputerProfileBuilder}
   */
  withMemory(memory) {
    if (!(memory instanceof Memory)) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Invalid Memory object');
    }
    this._memory = memory;
    return this;
  }

  /**
   * Sets the ROM.
   * @param {Rom} rom - The ROM.
   * @returns {ComputerProfileBuilder}
   */
  withRom(rom) {
    if (!(rom instanceof Rom)) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Invalid Rom object');
    }
    this._rom = rom;
    return this;
  }

  /**
   * Sets the CPU.
   * @param {I8080} cpu - The CPU.
   * @returns {ComputerProfileBuilder}
   */
  withCPU(cpu) {
    if (!(cpu instanceof I8080)) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Invalid I8080 object');
    }
    this._cpu = cpu;
    return this;
  }

  /**
   * Sets the viewport.
   * @param {Viewport} viewport - The viewport.
   * @returns {ComputerProfileBuilder}
   */
  withViewport(viewport) {
    if (!(viewport instanceof Viewport)) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Invalid Viewport object');
    }
    this._viewport = viewport;
    return this;
  }

  /**
   * Sets the screen.
   * @param {Screen} screen - The screen.
   * @returns {ComputerProfileBuilder}
   */
  withScreen(screen) {
    if (!(screen instanceof Screen)) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Invalid Screen object');
    }
    this._screen = screen;
    return this;
  }

  /**
   * Sets the tape drive.
   * @param {Tape} tape - The tape drive.
   * @returns {ComputerProfileBuilder}
   */
  withTape(tape) {
    if (!(tape instanceof Tape)) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Invalid Tape object');
    }
    this._tape = tape;
    return this;
  }

  /**
   * Sets drag-and-drop functionality.
   * @param {DnD} dnd - Drag-and-drop.
   * @returns {ComputerProfileBuilder}
   */
  withDnD(dnd) {
    if (!(dnd instanceof DnD)) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Invalid DnD object');
    }
    this._dnd = dnd;
    return this;
  }

  withTraps(traps) {
    if (!(traps instanceof Traps)) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Invalid Traps object');
    }
    this._traps = traps;
    return this;
  }

  /**
   * Sets the dump functionality.
   * @param {Dump} dump - The dump.
   * @returns {ComputerProfileBuilder}
   */
  withDump(dump) {
    if (!(dump instanceof Dump)) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Invalid Dump object');
    }
    this._dump = dump;
    return this;
  }

  /**
   * Sets the notifications.
   * @param {Notify} notify - The notifications.
   * @returns {ComputerProfileBuilder}
   */
  withNotify(notify) {
    if (!(notify instanceof Notify)) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Invalid Notify object');
    }
    this._notify = notify;
    return this;
  }

  /**
   * Creates a standard configuration (all components are created automatically).
   * @returns {ComputerProfile}
   */
  buildStandard() {
    if (!this._settings) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Settings is required');
    }

    // Create components if they were not explicitly set
    this._config ??= new Config(this._settings, this._profile);
    this._beeper ??= new Beeper(this._config);
    this._keyboard ??= new Keyboard();
    this._io ??= new IO(this._config, this._beeper, this._keyboard);
    this._memory ??= new Memory(this._config, this._io);
    this._rom ??= new Rom(this._config, this._memory);
    this._traps ??= new Traps();
    this._cpu ??= new I8080(this._config, this._memory, this._io, this._traps);
    this._viewport ??= new Viewport(this._settings);
    this._screen ??= new Screen(this._config, this._io, this._memory, this._viewport);
    this._tape ??= new Tape(this._config);
    this._dnd ??= new DnD(this._config);

    // Create ComputerProfile with injected dependencies
    return new ComputerProfile({
      settings: this._settings,
      profile: this._profile,
      config: this._config,
      beeper: this._beeper,
      keyboard: this._keyboard,
      io: this._io,
      memory: this._memory,
      rom: this._rom,
      traps: this._traps,
      cpu: this._cpu,
      viewport: this._viewport,
      screen: this._screen,
      tape: this._tape,
      dnd: this._dnd,
    });
  }

  /**
   * Static method for quickly creating a standard configuration.
   * @param {Settings} settings - Emulator settings.
   * @param {string|Object|undefined} profile - Configuration profile (string, object, or undefined).
   * @returns {ComputerProfile}
   */
  static createStandard(settings, profile) {
    return new ComputerProfileBuilder().withSettings(settings).withProfile(profile).buildStandard();
  }
}
