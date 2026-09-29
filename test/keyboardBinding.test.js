import { describe, it, expect } from 'vitest';
import { Keyboard } from '../src/keyboard.js';
import { KeyboardBinding } from '../src/keyboardBinding.js';

function key_event(type, code, modifiers = {}) {
  const evt = new Event(type);
  return Object.assign(evt, { code, shiftKey: false, ctrlKey: false, altKey: false, ...modifiers });
}

describe('KeyboardBinding', () => {
  it('forwards KeyboardEvent.code to the keyboard', () => {
    const keyboard = new Keyboard();
    const target = new EventTarget();
    const binding = new KeyboardBinding(keyboard, target);

    target.dispatchEvent(key_event('keydown', 'KeyA'));
    expect(keyboard.key_states[0xd0][6]).toBe(0x10);

    target.dispatchEvent(key_event('keyup', 'KeyA'));
    expect(keyboard.key_states[0xd0][6]).toBe(0x00);

    binding.terminate();
  });

  it('passes the modifier keys through', () => {
    const keyboard = new Keyboard();
    const target = new EventTarget();
    const binding = new KeyboardBinding(keyboard, target);

    target.dispatchEvent(key_event('keydown', 'Digit1', { altKey: true }));
    expect(keyboard.key_states[0xd2][1]).toBe(0x04); // alt + 1 -> F1

    target.dispatchEvent(key_event('keyup', 'KeyP', { ctrlKey: true }));
    expect(keyboard.special_keys).toBe(keyboard.IS_PAUSE); // ctrl + P

    binding.terminate();
  });

  it('stops listening after terminate()', () => {
    const keyboard = new Keyboard();
    const target = new EventTarget();
    const binding = new KeyboardBinding(keyboard, target);

    binding.terminate();
    target.dispatchEvent(key_event('keydown', 'KeyA'));

    expect(keyboard.key_states[0xd0][6]).toBe(0x00);
  });
});
