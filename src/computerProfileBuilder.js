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
import { DomResolver } from './domResolver.js';
import { Beeper } from './beeper.js';
import { Keyboard } from './keyboard.js';
import { KeyboardBinding } from './keyboardBinding.js';
import { IO } from './io.js';
import { Memory } from './memory.js';
import { Rom } from './rom.js';
import { I8080 } from './i8080.js';
import { Clock } from './clock.js';
import { Storage } from './storage.js';
import { Viewport } from './viewport.js';
import { Screen } from './screen.js';
import { Tape } from './tape.js';
import { DnD } from './dnd.js';
import { Traps } from './traps.js';
import { Dump } from './dump.js';
import { Notify } from './notify.js';
import { ComputerProfile } from './computerProfile.js';
import { assertInstance } from './utils/assert.js';

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
    this._clock = null;
    this._dom = null;
    this._storage = null;
    this._beeper = null;
    this._keyboard = null;
    this._keyboard_binding = null;
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
    assertInstance(settings, Settings, 'COMPUTER_PROFILE_BUILDER: Invalid Settings object');
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
    assertInstance(config, Config, 'COMPUTER_PROFILE_BUILDER: Invalid Config object');
    this._config = config;
    return this;
  }

  /**
   * Sets the beeper.
   * @param {Beeper} beeper - The beeper.
   * @returns {ComputerProfileBuilder}
   */
  withBeeper(beeper) {
    assertInstance(beeper, Beeper, 'COMPUTER_PROFILE_BUILDER: Invalid Beeper object');
    this._beeper = beeper;
    return this;
  }

  /**
   * Sets the keyboard.
   * @param {Keyboard} keyboard - The keyboard.
   * @returns {ComputerProfileBuilder}
   */
  withKeyboard(keyboard) {
    assertInstance(keyboard, Keyboard, 'COMPUTER_PROFILE_BUILDER: Invalid Keyboard object');
    this._keyboard = keyboard;
    return this;
  }

  /**
   * Sets the keyboard DOM binding (created automatically if not provided).
   * @param {KeyboardBinding} keyboard_binding - The keyboard binding.
   * @returns {ComputerProfileBuilder}
   */
  withKeyboardBinding(keyboard_binding) {
    assertInstance(
      keyboard_binding,
      KeyboardBinding,
      'COMPUTER_PROFILE_BUILDER: Invalid KeyboardBinding object'
    );
    this._keyboard_binding = keyboard_binding;
    return this;
  }

  /**
   * Sets the I/O ports.
   * @param {IO} io - The I/O ports.
   * @returns {ComputerProfileBuilder}
   */
  withIO(io) {
    assertInstance(io, IO, 'COMPUTER_PROFILE_BUILDER: Invalid IO object');
    this._io = io;
    return this;
  }

  /**
   * Sets the memory.
   * @param {Memory} memory - The memory.
   * @returns {ComputerProfileBuilder}
   */
  withMemory(memory) {
    assertInstance(memory, Memory, 'COMPUTER_PROFILE_BUILDER: Invalid Memory object');
    this._memory = memory;
    return this;
  }

  /**
   * Sets the ROM.
   * @param {Rom} rom - The ROM.
   * @returns {ComputerProfileBuilder}
   */
  withRom(rom) {
    assertInstance(rom, Rom, 'COMPUTER_PROFILE_BUILDER: Invalid Rom object');
    this._rom = rom;
    return this;
  }

  /**
   * Sets the CPU.
   * @param {I8080} cpu - The CPU.
   * @returns {ComputerProfileBuilder}
   */
  withCPU(cpu) {
    assertInstance(cpu, I8080, 'COMPUTER_PROFILE_BUILDER: Invalid I8080 object');
    this._cpu = cpu;
    return this;
  }

  /**
   * Sets the viewport.
   * @param {Viewport} viewport - The viewport.
   * @returns {ComputerProfileBuilder}
   */
  withViewport(viewport) {
    assertInstance(viewport, Viewport, 'COMPUTER_PROFILE_BUILDER: Invalid Viewport object');
    this._viewport = viewport;
    return this;
  }

  /**
   * Sets the screen.
   * @param {Screen} screen - The screen.
   * @returns {ComputerProfileBuilder}
   */
  withScreen(screen) {
    assertInstance(screen, Screen, 'COMPUTER_PROFILE_BUILDER: Invalid Screen object');
    this._screen = screen;
    return this;
  }

  /**
   * Sets the tape drive.
   * @param {Tape} tape - The tape drive.
   * @returns {ComputerProfileBuilder}
   */
  withTape(tape) {
    assertInstance(tape, Tape, 'COMPUTER_PROFILE_BUILDER: Invalid Tape object');
    this._tape = tape;
    return this;
  }

  /**
   * Sets drag-and-drop functionality.
   * @param {DnD} dnd - Drag-and-drop.
   * @returns {ComputerProfileBuilder}
   */
  withDnD(dnd) {
    assertInstance(dnd, DnD, 'COMPUTER_PROFILE_BUILDER: Invalid DnD object');
    this._dnd = dnd;
    return this;
  }

  withTraps(traps) {
    assertInstance(traps, Traps, 'COMPUTER_PROFILE_BUILDER: Invalid Traps object');
    this._traps = traps;
    return this;
  }

  /**
   * Sets the dump functionality.
   * @param {Dump} dump - The dump.
   * @returns {ComputerProfileBuilder}
   */
  withDump(dump) {
    assertInstance(dump, Dump, 'COMPUTER_PROFILE_BUILDER: Invalid Dump object');
    this._dump = dump;
    return this;
  }

  /**
   * Sets the notifications.
   * @param {Notify} notify - The notifications.
   * @returns {ComputerProfileBuilder}
   */
  withNotify(notify) {
    assertInstance(notify, Notify, 'COMPUTER_PROFILE_BUILDER: Invalid Notify object');
    this._notify = notify;
    return this;
  }

  /**
   * Sets the shared CPU cycle counter.
   * @param {Clock} clock - The clock.
   * @returns {ComputerProfileBuilder}
   */
  withClock(clock) {
    assertInstance(clock, Clock, 'COMPUTER_PROFILE_BUILDER: Invalid Clock object');
    this._clock = clock;
    return this;
  }

  /**
   * Sets the DOM resolver (created automatically if not provided).
   * @param {DomResolver} dom - The DOM resolver.
   * @returns {ComputerProfileBuilder}
   */
  withDomResolver(dom) {
    assertInstance(dom, DomResolver, 'COMPUTER_PROFILE_BUILDER: Invalid DomResolver object');
    this._dom = dom;
    return this;
  }

  /**
   * Sets the storage service (created automatically if not provided).
   * @param {Storage} storage - The storage service.
   * @returns {ComputerProfileBuilder}
   */
  withStorage(storage) {
    assertInstance(storage, Storage, 'COMPUTER_PROFILE_BUILDER: Invalid Storage object');
    this._storage = storage;
    return this;
  }

  /**
   * Creates a standard configuration (all components are created automatically).
   * @returns {ComputerProfile}
   */
  buildStandard() {
    assertInstance(this._settings, Settings, 'COMPUTER_PROFILE_BUILDER: Settings is required');

    if (typeof this._profile !== 'string') {
      throw new Error('COMPUTER_PROFILE_BUILDER: Profile is required');
    }

    // Create components if they were not explicitly set
    this._config ??= new Config(this._settings, this._profile);
    this._clock ??= new Clock();
    this._dom ??= new DomResolver(this._settings);
    this._beeper ??= new Beeper(this._config, this._clock);
    this._keyboard ??= new Keyboard();
    this._keyboard_binding ??= new KeyboardBinding(this._keyboard);
    this._io ??= new IO(this._config, this._beeper, this._keyboard);
    this._memory ??= new Memory(this._config, this._io);
    this._rom ??= new Rom(this._config, this._memory);
    this._traps ??= new Traps();
    this._cpu ??= new I8080(this._config, this._memory, this._io, this._traps, this._clock);
    this._storage ??= new Storage(this._cpu, this._memory, this._io);
    this._viewport ??= new Viewport(this._dom.viewport_container);
    this._screen ??= new Screen(this._config, this._io, this._memory);
    this._tape ??= new Tape(this._config);
    this._dnd ??= new DnD(this._config, this._dom.dnd_container);

    // Create ComputerProfile with injected dependencies
    return new ComputerProfile({
      settings: this._settings,
      profile: this._profile,
      config: this._config,
      beeper: this._beeper,
      keyboard: this._keyboard,
      keyboard_binding: this._keyboard_binding,
      io: this._io,
      memory: this._memory,
      rom: this._rom,
      traps: this._traps,
      cpu: this._cpu,
      viewport: this._viewport,
      screen: this._screen,
      tape: this._tape,
      dnd: this._dnd,
      dom: this._dom,
      storage: this._storage,
    });
  }

  /**
   * Static method for quickly creating a standard configuration.
   * @param {Settings} settings - Emulator settings.
   * @param {string|Object|undefined} profile - Configuration profile (string, object, or undefined).
   * @returns {ComputerProfile}
   */
  static createStandard(settings, profile, dom) {
    const builder = new ComputerProfileBuilder().withSettings(settings).withProfile(profile);

    if (dom !== undefined) {
      builder.withDomResolver(dom);
    }

    return builder.buildStandard();
  }
}
