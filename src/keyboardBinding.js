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
        this.keyboard.press(evt.code, true, modifiers(evt));

        evt.preventDefault();
        evt.stopPropagation();
      },
      { signal }
    );

    target.addEventListener(
      'keyup',
      (evt) => {
        this.keyboard.press(evt.code, false, modifiers(evt));

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
