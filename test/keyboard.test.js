import { describe, it, expect } from 'vitest';
import { createCore } from './helpers.js';
import { Keyboard } from '../src/keyboard.js';

describe('Keyboard', () => {
  it('sets and clears key-state bits', () => {
    const { keyboard } = createCore();

    keyboard.press('KeyA', true, 0);
    expect(keyboard.key_states[0xd0][6]).toBe(0x10);

    keyboard.press('KeyA', false, 0);
    expect(keyboard.key_states[0xd0][6]).toBe(0x00);
  });

  it('maps the ctrl shortcuts to special keys', () => {
    const { keyboard } = createCore();

    keyboard.press('KeyP', false, Keyboard.IS_CTRL);
    expect(keyboard.special_keys).toBe(keyboard.IS_PAUSE);

    keyboard.reset_special_keys();
    expect(keyboard.special_keys).toBe(0);
  });

  it('maps alt combinations to the PC-01 keys', () => {
    const { keyboard } = createCore();

    keyboard.press('Digit1', true, Keyboard.IS_ALT); // alt + 1 -> F1
    expect(keyboard.key_states[0xd2][1]).toBe(0x04);

    keyboard.press('KeyC', true, Keyboard.IS_ALT); // alt + C -> СТР
    expect(keyboard.key_states[0xd0][4]).toBe(0x01);

    keyboard.press('Equal', true, Keyboard.IS_ALT); // alt + = -> ГТ
    expect(keyboard.key_states[0xd0][0]).toBe(0x08);
  });

  it('maps keys onto both matrix ports', () => {
    const { keyboard } = createCore();

    keyboard.press('Digit0', true, 0); // 0xd0, column 0, row 0x40
    keyboard.press('ArrowDown', true, 0); // 0xd2, column 3, row 0x08
    keyboard.press('Quote', true, 0); // 0xd0, column 7, row 0x04

    expect(keyboard.key_states[0xd0][0]).toBe(0x40);
    expect(keyboard.key_states[0xd2][3]).toBe(0x08);
    expect(keyboard.key_states[0xd0][7]).toBe(0x04);
  });

  it('reset() clears all key states', () => {
    const { keyboard } = createCore();
    keyboard.press('KeyA', true, 0);

    keyboard.reset();

    expect(keyboard.key_states[0xd0][6]).toBe(0x00);
  });

  it('get() returns the selected column state, inverted', () => {
    const { keyboard } = createCore();

    // No key pressed: every selected line stays high.
    expect(keyboard.get(0xff, 0xd0) & 0xff).toBe(0xff);

    keyboard.press('KeyA', true, 0); // column 6, row bit 0x10

    // Select column 6 (its mask bit is 0): only that row bit is driven low.
    expect(keyboard.get(0xff ^ (1 << 6), 0xd0) & 0xff).toBe(0xff ^ 0x10);

    // Selecting another column leaves the lines high.
    expect(keyboard.get(0xff ^ (1 << 0), 0xd0) & 0xff).toBe(0xff);
  });
});
