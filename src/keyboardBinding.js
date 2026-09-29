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

import { assertInstance } from './utils/assert.js';
import { Keyboard } from './keyboard.js';

/**
 * Binds DOM keyboard events to a `Keyboard` instance. Keeping the DOM part out
 * of `Keyboard` leaves the key-state logic free of browser dependencies.
 */
export class KeyboardBinding {
  constructor(keyboard, target = document) {
    assertInstance(keyboard, Keyboard, 'KEYBOARD_BINDING: Invalid Keyboard object');
    assertInstance(target, EventTarget, 'KEYBOARD_BINDING: Invalid target');

    this.keyboard = keyboard;
    this.listener_controller = new AbortController();

    const { signal } = this.listener_controller;
    const modifiers = (evt) => (evt.shiftKey << 2) | (evt.ctrlKey << 1) | evt.altKey;

    target.addEventListener(
      'keydown',
      (evt) => {
        this.keyboard.press(evt.keyCode, true, modifiers(evt));

        evt.preventDefault();
        evt.stopPropagation();
      },
      { signal }
    );

    target.addEventListener(
      'keyup',
      (evt) => {
        this.keyboard.press(evt.keyCode, false, modifiers(evt));

        evt.preventDefault();
        evt.stopPropagation();
      },
      { signal }
    );
  }

  terminate() {
    this.listener_controller.abort();
  }
}
