// PC-01 keyboard matrix.
//
// The keyboard is read through two i8255A PPI ports: 0xd0 (8 columns) and
// 0xd2 (4 columns). Each entry maps a key to its position on the matrix as
// `[port, column, row bit]`.
//
// Keys are identified by the modern `KeyboardEvent.code` that presses them.
// Keys that exist only on the PC-01 keyboard are reached with Alt and use a
// synthetic `PC01.<name>` id; the trailing comment names the original key.
const MATRIX = {
  // --- port 0xd0 ---
  Backspace: [0xd0, 2, 0x08], // ЗБ
  Tab: [0xd0, 0, 0x10], // ТАБ
  Enter: [0xd0, 1, 0x08], // ВК
  ShiftLeft: [0xd0, 7, 0x01], // НР
  ShiftRight: [0xd0, 7, 0x01], // НР
  Escape: [0xd0, 6, 0x04], // СУ
  Space: [0xd0, 3, 0x01], // ПРБ
  Insert: [0xd0, 0, 0x08], // ГТ

  Digit0: [0xd0, 0, 0x40], // 0
  Digit1: [0xd0, 4, 0x80], // 1
  Digit2: [0xd0, 4, 0x40], // 2
  Digit3: [0xd0, 4, 0x20], // 3
  Digit4: [0xd0, 4, 0x10], // 4
  Digit5: [0xd0, 4, 0x08], // 5
  Digit6: [0xd0, 0, 0x01], // 6
  Digit7: [0xd0, 0, 0x02], // 7
  Digit8: [0xd0, 0, 0x04], // 8
  Digit9: [0xd0, 0, 0x80], // 9

  KeyA: [0xd0, 6, 0x10], // A
  KeyB: [0xd0, 3, 0x02], // B
  KeyC: [0xd0, 5, 0x80], // C
  KeyD: [0xd0, 2, 0x80], // D
  KeyE: [0xd0, 5, 0x10], // E
  KeyF: [0xd0, 6, 0x80], // F
  KeyG: [0xd0, 1, 0x01], // G
  KeyH: [0xd0, 1, 0x40], // H
  KeyI: [0xd0, 7, 0x20], // I
  KeyJ: [0xd0, 5, 0x04], // J
  KeyK: [0xd0, 5, 0x20], // K
  KeyL: [0xd0, 2, 0x04], // L
  KeyM: [0xd0, 7, 0x40], // M
  KeyN: [0xd0, 5, 0x08], // N
  KeyO: [0xd0, 2, 0x02], // O
  KeyP: [0xd0, 6, 0x08], // P
  KeyQ: [0xd0, 7, 0x02], // Q
  KeyR: [0xd0, 2, 0x01], // R
  KeyS: [0xd0, 7, 0x80], // S
  KeyT: [0xd0, 7, 0x10], // T
  KeyU: [0xd0, 5, 0x40], // U
  KeyV: [0xd0, 2, 0x40], // V
  KeyW: [0xd0, 6, 0x20], // W
  KeyX: [0xd0, 7, 0x08], // X
  KeyY: [0xd0, 6, 0x40], // Y
  KeyZ: [0xd0, 1, 0x80], // Z

  Semicolon: [0xd0, 1, 0x20], // :/*
  Equal: [0xd0, 6, 0x01], // +/;
  Comma: [0xd0, 3, 0x80], // ,
  Minus: [0xd0, 0, 0x20], // -/=
  Period: [0xd0, 2, 0x10], // .
  Slash: [0xd0, 3, 0x40], // /
  Backquote: [0xd0, 3, 0x04], // @
  BracketLeft: [0xd0, 1, 0x02], // [
  Backslash: [0xd0, 2, 0x20], // \
  BracketRight: [0xd0, 1, 0x04], // ]
  Quote: [0xd0, 7, 0x04], // ^

  // --- port 0xd2 ---
  Home: [0xd2, 2, 0x01], // ДИА
  ArrowLeft: [0xd2, 3, 0x04], // <-
  ArrowUp: [0xd2, 3, 0x02], // UP
  ArrowRight: [0xd2, 3, 0x01], // ->
  ArrowDown: [0xd2, 3, 0x08], // DOWN

  F1: [0xd2, 1, 0x04], // F1
  F2: [0xd2, 1, 0x08], // F2
  F3: [0xd2, 2, 0x08], // F3
  F4: [0xd2, 2, 0x04], // F4
  F5: [0xd2, 2, 0x02], // F5
  F6: [0xd2, 0, 0x04], // ДИН
  F7: [0xd2, 0, 0x02], // CD
  F8: [0xd2, 0, 0x01], // ПЧ
  F9: [0xd2, 1, 0x01], // П/Д
  F10: [0xd2, 1, 0x02], // F0

  // --- PC-01-only keys (reached with Alt) ---
  'PC01.СТР': [0xd0, 4, 0x01], // СТР
  'PC01.(G)': [0xd0, 4, 0x02], // (G)
  'PC01.(B)': [0xd0, 4, 0x04], // (B)
  'PC01.(R)': [0xd2, 0, 0x08], // (R)
  'PC01.ПС': [0xd0, 1, 0x10], // ПС
  'PC01.ВР': [0xd0, 3, 0x08], // ВР
  'PC01.РУС': [0xd0, 6, 0x02], // РУС
  'PC01.ЛАТ': [0xd0, 3, 0x20], // ЛАТ
  'PC01._': [0xd0, 3, 0x10], // _
};

// `KeyboardEvent.code` -> key id produced while Alt is held.
const ALT_MAP = {
  Digit1: 'F1',
  Digit2: 'F2',
  Digit3: 'F3',
  Digit4: 'F4',
  Digit5: 'F5',
  Digit6: 'F6', // ДИН
  Digit7: 'F7', // CD
  Digit8: 'F8', // ПЧ
  Digit9: 'F9', // П/Д
  Digit0: 'F10', // F0
  Equal: 'Insert', // ГТ
  KeyH: 'Home', // ДИА
  KeyC: 'PC01.СТР',
  KeyG: 'PC01.(G)',
  KeyB: 'PC01.(B)',
  KeyR: 'PC01.(R)',
  Enter: 'PC01.ПС',
  ShiftLeft: 'PC01.ВР',
  ShiftRight: 'PC01.ВР',
  KeyU: 'PC01.РУС',
  KeyL: 'PC01.ЛАТ',
  Minus: 'PC01._',
};

export class Keyboard {
  static IS_ALT = 0x01;
  static IS_CTRL = 0x02;
  static IS_SHIFT = 0x04;

  IS_COLOR = 0x01;
  IS_PAUSE = 0x02;
  IS_RESET = 0x04;
  IS_SHOOT = 0x08;
  IS_DEC_PALETTE = 0x40;
  IS_INC_PALETTE = 0x80;

  constructor() {
    this.key_states = {
      0xd0: new Uint8Array(8),
      0xd2: new Uint8Array(4),
    };

    this.special_keys = 0;

    this.reset();
  }

  reset() {
    for (const state of Object.values(this.key_states)) {
      state.fill(0);
    }

    this.reset_special_keys();
  }

  reset_special_keys() {
    this.special_keys = 0;
  }

  restart() {
    this.reset();
  }

  // `code` is a `KeyboardEvent.code`; `modifier` is a bit mask of
  // Keyboard.IS_ALT / IS_CTRL / IS_SHIFT.
  press(code, is_pressed, modifier) {
    const key = MATRIX[modifier & Keyboard.IS_ALT ? (ALT_MAP[code] ?? code) : code];
    const is_ctrl = modifier & Keyboard.IS_CTRL;

    if (key && !is_ctrl) {
      const [port, column, row_mask] = key;

      if (is_pressed) {
        this.key_states[port][column] |= row_mask;
      } else {
        this.key_states[port][column] &= ~row_mask;
      }
    } else if (!is_pressed && is_ctrl) {
      switch (code) {
        // ctrl + P - pause
        case 'KeyP':
          this.special_keys = this.IS_PAUSE;
          break;

        // ctrl + S - screenshot
        case 'KeyS':
          this.special_keys = this.IS_SHOOT;
          break;

        // ctrl + R - reset
        case 'KeyR':
          this.special_keys = this.IS_RESET;
          break;

        // ctrl + G - color mode
        case 'KeyG':
          this.special_keys = this.IS_COLOR;
          break;

        // ctrl + = - next palette
        case 'Equal':
          this.special_keys = this.IS_INC_PALETTE;
          break;

        // ctrl + - - previous palette
        case 'Minus':
          this.special_keys = this.IS_DEC_PALETTE;
          break;
      }
    }
  }

  get(mask, port) {
    const state = this.key_states[port];
    let result = 0;

    mask = ~mask;

    if (state) {
      for (let i = 0; i < state.length; i++) {
        if (mask & (1 << i)) {
          result |= state[i];
        }
      }
    }

    if (port === 0xd2) {
      result = (result << 4) | (mask & 0x0f);
    }

    return ~(result & 0xff);
  }
}
