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


function Keyboard() {
    this.key_states = {
        0xD0 : [],
        0xD2 : []
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

Keyboard.prototype.init = function() {
    var self = this,
        key_map = this.key_map;

    for (var key in key_map) {
        var val = key_map[key],
            mask = val.mask,
            col_D0 = (mask & 0xF000) >> 12,
            col_D2 = (mask & 0x00F0) >> 4;

        if ((col_D0 & 0x08) === 0) {
            val.port = 0xD0;
            val.column = col_D0;
            val.row = (mask & 0x0F00) >> 8;
        }
        else if ((col_D2 & 0x08) === 0) {
            val.port = 0xD2;
            val.column = col_D2;
            val.row = mask & 0x000F;
        }
    }

    document.addEventListener('keydown', function(evt) {
        self.press(evt.which, true, (evt.shiftKey << 2) | (evt.ctrlKey << 1) | evt.altKey);
        evt.preventDefault();
        evt.stopPropagation();
    });

    document.addEventListener('keyup', function(evt) {
        self.press(evt.which, false, (evt.shiftKey << 2) | (evt.ctrlKey << 1) | evt.altKey);
        evt.preventDefault();
        evt.stopPropagation();
    });

    this.reset();
};

Keyboard.prototype.reset = function() {
    this.key_states[0xD0].length = 0;
    this.key_states[0xD2].length = 0;

    this.reset_special_keys();
};

Keyboard.prototype.reset_special_keys = function() {
    this.special_keys = 0;
};

Keyboard.prototype.restart = function() {
    this.reset();
};

Keyboard.prototype.press = function(key_code, is_pressed, modifier) {
    var key = this.key_map[(modifier & Keyboard.IS_ALT) ? (this.alt_map[key_code] || key_code) : key_code],
        is_ctrl = modifier & Keyboard.IS_CTRL;

    if (key && !is_ctrl) {
        if (is_pressed) {
            this.key_states[key.port][key.column] |= (1 << key.row);
        }
        else {
            this.key_states[key.port][key.column] &= ~(1 << key.row);
        }
    }
    else if (!is_pressed && is_ctrl) {
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
        }
    }
};

Keyboard.prototype.get = function(mask, port) {
    var result = 0,
        state = this.key_states[port];

    mask = ~mask;

    //Развернул циклы, чтобы убрать в профайлере Chrome
    //сообщение "Not optimized: optimized too many times".
    if (port === 0xD0) {
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
    }
    else if (port === 0xD2) {
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

        result = (result << 4) | (mask & 0x0F);
    }

    return ~(result & 0xFF);
};

Keyboard.prototype.alt_map = {
    49  : 112,      //alt + 1       -> F1
    50  : 113,      //alt + 2       -> F2
    51  : 114,      //alt + 3       -> F3
    52  : 115,      //alt + 4       -> F4
    53  : 116,      //alt + 5       -> F5
    54  : 117,      //alt + 6       -> ДИН
    55  : 118,      //alt + 7       -> CD
    56  : 119,      //alt + 8       -> ПЧ
    57  : 120,      //alt + 9       -> П/Д
    48  : 121,      //alt + 0       -> F0
    187 : 45,       //alt + +       -> ГТ
    72  : 36,       //alt + H       -> ДИА
    67  : 0x100,    //alt + С       -> СТР
    71  : 0x101,    //alt + G       -> (G)
    66  : 0x102,    //alt + B       -> (B)
    82  : 0x103,    //alt + R       -> (R)
    13  : 0x104,    //alt + enter   -> ПС
    16  : 0x105,    //alt + shift   -> ВР
    85  : 0x106,    //alt + U       -> РУС
    76  : 0x107,    //alt + L       -> ЛАТ
    189 : 0x108     //alt + -       -> _
};

Keyboard.prototype.key_map = {
    8   : { mask: 0x23FF }, // ЗБ
    9   : { mask: 0x04FF }, // ТАБ
    13  : { mask: 0x13FF }, // ВК
    16  : { mask: 0x70FF }, // НР
    27  : { mask: 0x62FF }, // СУ
    32  : { mask: 0x30FF }, // ПРБ
    36  : { mask: 0xFF20 }, // ДИА

    37  : { mask: 0xFF32 }, // <-
    38  : { mask: 0xFF31 }, // UP
    39  : { mask: 0xFF30 }, // ->
    40  : { mask: 0xFF33 }, // DOWN

    45  : { mask: 0x03FF }, // ГТ
    48  : { mask: 0x06FF }, // 0
    49  : { mask: 0x47FF }, // 1
    50  : { mask: 0x46FF }, // 2
    51  : { mask: 0x45FF }, // 3
    52  : { mask: 0x44FF }, // 4
    53  : { mask: 0x43FF }, // 5
    54  : { mask: 0x00FF }, // 6
    55  : { mask: 0x01FF }, // 7
    56  : { mask: 0x02FF }, // 8
    57  : { mask: 0x07FF }, // 9

    65  : { mask: 0x64FF }, // A
    66  : { mask: 0x31FF }, // B
    67  : { mask: 0x57FF }, // C
    68  : { mask: 0x27FF }, // D
    69  : { mask: 0x54FF }, // E
    70  : { mask: 0x67FF }, // F
    71  : { mask: 0x10FF }, // G
    72  : { mask: 0x16FF }, // H
    73  : { mask: 0x75FF }, // I
    74  : { mask: 0x52FF }, // J
    75  : { mask: 0x55FF }, // K
    76  : { mask: 0x22FF }, // L
    77  : { mask: 0x76FF }, // M
    78  : { mask: 0x53FF }, // N
    79  : { mask: 0x21FF }, // O
    80  : { mask: 0x63FF }, // P
    81  : { mask: 0x71FF }, // Q
    82  : { mask: 0x20FF }, // R
    83  : { mask: 0x77FF }, // S
    84  : { mask: 0x74FF }, // T
    85  : { mask: 0x56FF }, // U
    86  : { mask: 0x26FF }, // V
    87  : { mask: 0x65FF }, // W
    88  : { mask: 0x73FF }, // X
    89  : { mask: 0x66FF }, // Y
    90  : { mask: 0x17FF }, // Z

    112 : { mask: 0xFF12 }, // F1
    113 : { mask: 0xFF13 }, // F2
    114 : { mask: 0xFF23 }, // F3
    115 : { mask: 0xFF22 }, // F4
    116 : { mask: 0xFF21 }, // F5

    117 : { mask: 0xFF02 }, // ДИН
    118 : { mask: 0xFF01 }, // CD
    119 : { mask: 0xFF00 }, // ПЧ
    120 : { mask: 0xFF10 }, // П/Д
    121 : { mask: 0xFF11 }, // F0

    186 : { mask: 0x15FF }, // :/*
    187 : { mask: 0x60FF }, // +/;
    188 : { mask: 0x37FF }, // ,
    189 : { mask: 0x05FF }, // -/=
    190 : { mask: 0x24FF }, // .
    191 : { mask: 0x36FF }, // /
    192 : { mask: 0x32FF }, // @
    219 : { mask: 0x11FF }, // [
    220 : { mask: 0x25FF }, // \
    221 : { mask: 0x12FF }, // ]
    222 : { mask: 0x72FF }, // ^

    0x100 : {mask: 0x40FF}, // СТР
    0x101 : {mask: 0x41FF}, // (G)
    0x102 : {mask: 0x42FF}, // (B)
    0x103 : {mask: 0xFF03}, // (R)
    0x104 : {mask: 0x14FF}, // ПС
    0x105 : {mask: 0x33FF}, // ВР
    0x106 : {mask: 0x61FF}, // РУС
    0x107 : {mask: 0x35FF}, // ЛАТ
    0x108 : {mask: 0x34FF}  // _
};