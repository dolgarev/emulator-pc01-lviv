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

function IO(config, beeper, keyboard) {
    if (!(config instanceof Config)) {
        throw new Error('IO: Invalid CONFIG object');
    }
    this.config = config;

    if (!(beeper instanceof Beeper)) {
        throw new Error('IO: Invalid BEEPER object');
    }
    this.beeper = beeper;

    if (!(keyboard instanceof Keyboard)) {
        throw new Error('IO: Invalid KEYBOARD object');
    }
    this.keyboard = keyboard;

    //port 0xF0
    //[http://lvovpc.cu.cc/article.shtml?id=6]
    this.EXTENDED_MODE_PORT = 0xF0;
    this.VIDEO_RESOLUTION_BIT = 0x8;    //0 - 256*256, 1 - 512*256
    this.SCREEN_BLANK_BIT = 0x10;       //1 - on, 0 - off
    this.INTERRUPT_BIT = 0x20;          //1 - on, 0 - off

    //ports 0xE0-0xE4 использовались работы с контроллером ГМД

    //port 0xC0
    //[http://lvovpc.cu.cc/article.shtml?id=2]
    //[http://lvovpc.cu.cc/article.shtml?id=5]
    this.PRINTER_PORT = 0xC0;

    //port 0xC1 (b)
    this.COLOR_PALETTE_PORT = 0xC1;
    this.BEEPER_MODE_BIT = 0x80;        // 1 - вывод звука на бипер разрешен

    //port 0xC2 (c)
    this.MEDIA_PORT = 0xC2;
    this.BEEPER_BIT = 0x1;              //1 - on, 0 - off
    this.VRAM_STATUS_BIT = 0x2;         //0 - видеоОЗУ подключено
    this.PRINTER_SC_STROBE_BIT = 0x4;
    this.TAPE_READ_BIT = 0x10;
    this.PRINTER_AC_BUSY_BIT = 0x40;

    this.ports = [];
    this.init();

    if (config.io.allow_extended_features) {
        this.ports[this.EXTENDED_MODE_PORT] = 0;
        if (config.cpu.allow_interrupts) {
            this.ports[EXTENDED_MODE_PORT] |= this.INTERRUPT_BIT;
        }

        switch (config.screen.resolution) {
            case 512: case 'high':
                this.ports[EXTENDED_MODE_PORT] |= this.VIDEO_RESOLUTION_BIT;
                break;
        }
    }
}

IO.prototype.init = function() {
    this.restart();
};

IO.prototype.restart = function() {
    for (var i = 0; i < 0x100; i++) {
        this.ports[i] = 0x00;
    }

    this.ports[this.COLOR_PALETTE_PORT] = 0x8F;
    this.ports[this.MEDIA_PORT] = 0xFF;
};

IO.prototype.input = function(port) {
    port &= 0xFF;

    //В ПК-01 "Львов" реализована неполная дешифрация портов ввода-вывода
    //[http://lvovpc.ho.ua/forum/viewtopic.php?p=2219#p2219]
    port = 0xC0 + (port & (this.config.io.allow_extended_features ? 0x33 : 0x13));

    if (port === 0xD1) {
        this.ports[port] = this.keyboard.get(this.ports[0xD0], 0xD0);
    }
    else if (port === 0xD2) {
        this.ports[port] = this.keyboard.get(this.ports[0xD2], 0xD2);
    }

    return this.ports[port] & 0xFF;
};

IO.prototype.output = function(port, w8) {
    port &= 0xFF;
    w8 &= 0xFF;

    //В ПК-01 "Львов" реализована неполная дешифрация портов ввода-вывода
    //[http://lvovpc.ho.ua/forum/viewtopic.php?p=2219#p2219]
    port = 0xC0 + (port & (this.config.io.allow_extended_features ? 0x33 : 0x13));

    if ((port === 0xC3 || port === 0xD3) && (w8 & 0x80) === 0) {
        var mask = 0x01 << ((w8 & 0x0E) >> 1),
            target = port - 1;

        if (w8 & 0x01) {
            this.output(target, this.input(target) | mask);
        }
        else {
            this.output(target, this.input(target) & ~mask);
        }
    }

    if (port === this.MEDIA_PORT) {
        if ((this.ports[this.COLOR_PALETTE_PORT] & this.BEEPER_MODE_BIT) || this.config.beeper.fix_control) {
            this.beeper.process(w8 & this.BEEPER_BIT);
        }
    }

    this.ports[port] = w8;
};

IO.prototype.interrupt = function(iff) {
    return void iff;
};

IO.prototype.get_state = function() {
    var ports = [];

    for (var i = 0; i < 0x100; i++) {
        ports.push(this.input(i));
    }

    return ports;
};