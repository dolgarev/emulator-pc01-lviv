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
import { Watcher } from './watcher.js';
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
    this._watcher = null;
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

  /**
   * Sets the watcher.
   * @param {Watcher} watcher - The watcher.
   * @returns {ComputerProfileBuilder}
   */
  withWatcher(watcher) {
    if (!(watcher instanceof Watcher)) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Invalid Watcher object');
    }
    this._watcher = watcher;
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
    this._validateRequired();

    // Create components if they were not explicitly set
    if (!this._config) {
      this._config = new Config(this._settings, this._profile);
    }

    if (!this._beeper) {
      this._beeper = new Beeper(this._config);
    }

    if (!this._keyboard) {
      this._keyboard = new Keyboard();
    }

    if (!this._io) {
      this._io = new IO(this._config, this._beeper, this._keyboard);
    }

    if (!this._memory) {
      this._memory = new Memory(this._config, this._io);
    }

    if (!this._rom) {
      this._rom = new Rom(this._config, this._memory);
    }

    if (!this._cpu) {
      this._cpu = new I8080(this._config, this._memory, this._io);
    }

    if (!this._viewport) {
      this._viewport = new Viewport(this._settings);
    }

    if (!this._screen) {
      this._screen = new Screen(this._config, this._io, this._memory, this._viewport);
    }

    // Create ComputerProfile with injected dependencies
    return new ComputerProfile(
      this._settings,
      this._profile,
      this._config,
      this._beeper,
      this._keyboard,
      this._io,
      this._memory,
      this._rom,
      this._cpu,
      this._viewport,
      this._screen
    );
  }

  /**
   * Creates a test configuration (all components must be explicitly set).
   * @returns {ComputerProfile}
   */
  buildTest() {
    this._validateAll();

    return new ComputerProfile(
      this._settings,
      this._profile,
      this._config,
      this._beeper,
      this._keyboard,
      this._io,
      this._memory,
      this._rom,
      this._cpu,
      this._viewport,
      this._screen
    );
  }

  /**
   * Creates a minimal configuration (only essential components).
   * @returns {ComputerProfile}
   */
  buildMinimal() {
    this._validateRequired();

    // Create only the required components
    if (!this._config) {
      this._config = new Config(this._settings, this._profile);
    }

    if (!this._beeper) {
      this._beeper = new Beeper(this._config);
    }

    if (!this._keyboard) {
      this._keyboard = new Keyboard();
    }

    if (!this._io) {
      this._io = new IO(this._config, this._beeper, this._keyboard);
    }

    if (!this._memory) {
      this._memory = new Memory(this._config, this._io);
    }

    if (!this._rom) {
      this._rom = new Rom(this._config, this._memory);
    }

    if (!this._cpu) {
      this._cpu = new I8080(this._config, this._memory, this._io);
    }

    if (!this._viewport) {
      this._viewport = new Viewport(this._settings);
    }

    if (!this._screen) {
      this._screen = new Screen(this._config, this._io, this._memory, this._viewport);
    }

    return new ComputerProfile(
      this._settings,
      this._profile,
      this._config,
      this._beeper,
      this._keyboard,
      this._io,
      this._memory,
      this._rom,
      this._cpu,
      this._viewport,
      this._screen
    );
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

  /**
   * Static method for creating a test configuration.
   * @param {Settings} settings - Emulator settings.
   * @param {string|Object|undefined} profile - Configuration profile (string, object, or undefined).
   * @param {Object} components - Object with components for injection.
   * @returns {ComputerProfile}
   */
  static createTest(settings, profile, components = {}) {
    const builder = new ComputerProfileBuilder().withSettings(settings).withProfile(profile);

    // Inject components if provided
    if (components.config) builder.withConfig(components.config);
    if (components.beeper) builder.withBeeper(components.beeper);
    if (components.keyboard) builder.withKeyboard(components.keyboard);
    if (components.io) builder.withIO(components.io);
    if (components.memory) builder.withMemory(components.memory);
    if (components.rom) builder.withRom(components.rom);
    if (components.cpu) builder.withCPU(components.cpu);
    if (components.viewport) builder.withViewport(components.viewport);
    if (components.screen) builder.withScreen(components.screen);

    return builder.buildTest();
  }

  /**
   * Validates required parameters.
   * @private
   */
  _validateRequired() {
    if (!this._settings) {
      throw new Error('COMPUTER_PROFILE_BUILDER: Settings is required');
    }
    // Profile can be undefined (value from settings is used)
  }

  /**
   * Validates all parameters (for test configuration).
   * @private
   */
  _validateAll() {
    this._validateRequired();

    const required = [
      'config',
      'beeper',
      'keyboard',
      'io',
      'memory',
      'rom',
      'cpu',
      'viewport',
      'screen',
    ];

    for (const component of required) {
      if (!this[`_${component}`]) {
        throw new Error(
          `COMPUTER_PROFILE_BUILDER: ${component.charAt(0).toUpperCase() + component.slice(1)} is required for test configuration`
        );
      }
    }
  }
}
