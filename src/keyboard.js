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

export function Keyboard() {
  this.key_states = {
    0xd0: new Uint8Array(8),
    0xd2: new Uint8Array(4),
  };

  this.special_keys = 0;

  this.init();
}

Keyboard.IS_ALT = 0x01;
Keyboard.IS_CTRL = 0x02;
Keyboard.IS_SHIFT = 0x04;

Keyboard.prototype.IS_COLOR = 0x01;
Keyboard.prototype.IS_PAUSE = 0x02;
Keyboard.prototype.IS_RESET = 0x04;
Keyboard.prototype.IS_SHOOT = 0x08;
Keyboard.prototype.IS_DEC_PALETTE = 0x40;
Keyboard.prototype.IS_INC_PALETTE = 0x80;

Keyboard.prototype.init = function () {
  const self = this;

  document.addEventListener('keydown', (evt) => {
    self.press(evt.which, true, (evt.shiftKey << 2) | (evt.ctrlKey << 1) | evt.altKey);

    evt.preventDefault();
    evt.stopPropagation();
  });

  document.addEventListener('keyup', (evt) => {
    self.press(evt.which, false, (evt.shiftKey << 2) | (evt.ctrlKey << 1) | evt.altKey);

    evt.preventDefault();
    evt.stopPropagation();
  });

  this.reset();
};

Keyboard.prototype.reset = function () {
  [0xd0, 0xd2].forEach(function (port) {
    this.key_states[port].fill(0);
  }, this);

  this.reset_special_keys();
};

Keyboard.prototype.reset_special_keys = function () {
  this.special_keys = 0;
};

Keyboard.prototype.restart = function () {
  this.reset();
};

Keyboard.prototype.press = function (key_code, is_pressed, modifier) {
  const key =
    this.main_map[modifier & Keyboard.IS_ALT ? this.alt_map[key_code] || key_code : key_code];
  const is_ctrl = modifier & Keyboard.IS_CTRL;

  if (key && !is_ctrl) {
    if (is_pressed) {
      this.key_states[key.port][key.column] |= key.row_mask;
    } else {
      this.key_states[key.port][key.column] &= ~key.row_mask;
    }
  } else if (!is_pressed && is_ctrl) {
    switch (key_code) {
      //ctrl + p - Пауза
      case 80:
        this.special_keys = this.IS_PAUSE;
        break;

      //ctrl + s - Скриншот
      case 83:
        this.special_keys = this.IS_SHOOT;
        break;

      //ctrl + r - Сброс
      case 82:
        this.special_keys = this.IS_RESET;
        break;

      //ctrl + g - Цвет
      case 71:
        this.special_keys = this.IS_COLOR;
        break;

      //ctrl + + - Инкримент палитры
      case 187:
        this.special_keys = this.IS_INC_PALETTE;
        break;

      //ctrl + - - Декримент палитры
      case 189:
        this.special_keys = this.IS_DEC_PALETTE;
        break;
    }
  }
};

Keyboard.prototype.get = function (mask, port) {
  let result = 0;
  const state = this.key_states[port];

  mask = ~mask;

  //Развернул циклы, чтобы убрать в профайлере Chrome
  //сообщение "Not optimized: optimized too many times".
  if (port === 0xd0) {
    if (mask & 0x01) {
      result |= state[0];
    }
    if (mask & 0x02) {
      result |= state[1];
    }
    if (mask & 0x04) {
      result |= state[2];
    }
    if (mask & 0x08) {
      result |= state[3];
    }
    if (mask & 0x10) {
      result |= state[4];
    }
    if (mask & 0x20) {
      result |= state[5];
    }
    if (mask & 0x40) {
      result |= state[6];
    }
    if (mask & 0x80) {
      result |= state[7];
    }
  } else if (port === 0xd2) {
    if (mask & 0x01) {
      result |= state[0];
    }
    if (mask & 0x02) {
      result |= state[1];
    }
    if (mask & 0x04) {
      result |= state[2];
    }
    if (mask & 0x08) {
      result |= state[3];
    }

    result = (result << 4) | (mask & 0x0f);
  }

  return ~(result & 0xff);
};

Keyboard.prototype.main_map = (function () {
  const keys = {
    8: { mask: 0x23ff }, // ЗБ
    9: { mask: 0x04ff }, // ТАБ
    13: { mask: 0x13ff }, // ВК
    16: { mask: 0x70ff }, // НР
    27: { mask: 0x62ff }, // СУ
    32: { mask: 0x30ff }, // ПРБ
    36: { mask: 0xff20 }, // ДИА

    37: { mask: 0xff32 }, // <-
    38: { mask: 0xff31 }, // UP
    39: { mask: 0xff30 }, // ->
    40: { mask: 0xff33 }, // DOWN

    45: { mask: 0x03ff }, // ГТ
    48: { mask: 0x06ff }, // 0
    49: { mask: 0x47ff }, // 1
    50: { mask: 0x46ff }, // 2
    51: { mask: 0x45ff }, // 3
    52: { mask: 0x44ff }, // 4
    53: { mask: 0x43ff }, // 5
    54: { mask: 0x00ff }, // 6
    55: { mask: 0x01ff }, // 7
    56: { mask: 0x02ff }, // 8
    57: { mask: 0x07ff }, // 9

    65: { mask: 0x64ff }, // A
    66: { mask: 0x31ff }, // B
    67: { mask: 0x57ff }, // C
    68: { mask: 0x27ff }, // D
    69: { mask: 0x54ff }, // E
    70: { mask: 0x67ff }, // F
    71: { mask: 0x10ff }, // G
    72: { mask: 0x16ff }, // H
    73: { mask: 0x75ff }, // I
    74: { mask: 0x52ff }, // J
    75: { mask: 0x55ff }, // K
    76: { mask: 0x22ff }, // L
    77: { mask: 0x76ff }, // M
    78: { mask: 0x53ff }, // N
    79: { mask: 0x21ff }, // O
    80: { mask: 0x63ff }, // P
    81: { mask: 0x71ff }, // Q
    82: { mask: 0x20ff }, // R
    83: { mask: 0x77ff }, // S
    84: { mask: 0x74ff }, // T
    85: { mask: 0x56ff }, // U
    86: { mask: 0x26ff }, // V
    87: { mask: 0x65ff }, // W
    88: { mask: 0x73ff }, // X
    89: { mask: 0x66ff }, // Y
    90: { mask: 0x17ff }, // Z

    112: { mask: 0xff12 }, // F1
    113: { mask: 0xff13 }, // F2
    114: { mask: 0xff23 }, // F3
    115: { mask: 0xff22 }, // F4
    116: { mask: 0xff21 }, // F5

    117: { mask: 0xff02 }, // ДИН
    118: { mask: 0xff01 }, // CD
    119: { mask: 0xff00 }, // ПЧ
    120: { mask: 0xff10 }, // П/Д
    121: { mask: 0xff11 }, // F0

    186: { mask: 0x15ff }, // :/*
    187: { mask: 0x60ff }, // +/;
    188: { mask: 0x37ff }, // ,
    189: { mask: 0x05ff }, // -/=
    190: { mask: 0x24ff }, // .
    191: { mask: 0x36ff }, // /
    192: { mask: 0x32ff }, // @
    219: { mask: 0x11ff }, // [
    220: { mask: 0x25ff }, // \
    221: { mask: 0x12ff }, // ]
    222: { mask: 0x72ff }, // ^

    0x100: { mask: 0x40ff }, // СТР
    0x101: { mask: 0x41ff }, // (G)
    0x102: { mask: 0x42ff }, // (B)
    0x103: { mask: 0xff03 }, // (R)
    0x104: { mask: 0x14ff }, // ПС
    0x105: { mask: 0x33ff }, // ВР
    0x106: { mask: 0x61ff }, // РУС
    0x107: { mask: 0x35ff }, // ЛАТ
    0x108: { mask: 0x34ff }, // _
  };

  for (const key of Object.values(keys)) {
    const mask = key.mask;
    const col_D0 = (mask & 0xf000) >> 12;
    const col_D2 = (mask & 0x00f0) >> 4;

    if ((col_D0 & 0x08) === 0) {
      key.port = 0xd0;
      key.column = col_D0;
      key.row_mask = 1 << ((mask & 0x0f00) >> 8);
    } else if ((col_D2 & 0x08) === 0) {
      key.port = 0xd2;
      key.column = col_D2;
      key.row_mask = 1 << (mask & 0x000f);
    }
  }
  return keys;
})();

Keyboard.prototype.alt_map = {
  49: 112, //alt + 1       -> F1
  50: 113, //alt + 2       -> F2
  51: 114, //alt + 3       -> F3
  52: 115, //alt + 4       -> F4
  53: 116, //alt + 5       -> F5
  54: 117, //alt + 6       -> ДИН
  55: 118, //alt + 7       -> CD
  56: 119, //alt + 8       -> ПЧ
  57: 120, //alt + 9       -> П/Д
  48: 121, //alt + 0       -> F0
  187: 45, //alt + +       -> ГТ
  72: 36, //alt + H       -> ДИА
  67: 0x100, //alt + С       -> СТР
  71: 0x101, //alt + G       -> (G)
  66: 0x102, //alt + B       -> (B)
  82: 0x103, //alt + R       -> (R)
  13: 0x104, //alt + enter   -> ПС
  16: 0x105, //alt + shift   -> ВР
  85: 0x106, //alt + U       -> РУС
  76: 0x107, //alt + L       -> ЛАТ
  189: 0x108, //alt + -       -> _
};
