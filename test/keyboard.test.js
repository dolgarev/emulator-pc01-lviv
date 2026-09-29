import { describe, it, expect } from 'vitest';
import { createCore } from './helpers.js';
import { Keyboard } from '../src/keyboard.js';

describe('Keyboard', () => {
  it('sets and clears key-state bits', () => {
    const { keyboard } = createCore();

    keyboard.press(65, true, 0); // 'A'
    expect(keyboard.key_states[0xd0][6]).toBe(0x10);

    keyboard.press(65, false, 0);
    expect(keyboard.key_states[0xd0][6]).toBe(0x00);
  });

  it('maps the ctrl shortcuts to special keys', () => {
    const { keyboard } = createCore();

    keyboard.press(80, false, Keyboard.IS_CTRL); // ctrl + P
    expect(keyboard.special_keys).toBe(keyboard.IS_PAUSE);

    keyboard.reset_special_keys();
    expect(keyboard.special_keys).toBe(0);
  });

  it('maps alt combinations to the PC-01 special keys', () => {
    const { keyboard } = createCore();

    keyboard.press(49, true, Keyboard.IS_ALT); // alt + 1 -> F1

    expect(keyboard.key_states[0xd2][1]).toBe(0x04);
  });

  it('reset() clears all key states', () => {
    const { keyboard } = createCore();
    keyboard.press(65, true, 0);

    keyboard.reset();

    expect(keyboard.key_states[0xd0][6]).toBe(0x00);
  });
});
