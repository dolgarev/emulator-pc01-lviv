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
    this.HIGH_RESOLUTION_BIT = 0x8;     //0 - 256*256, 1 - 512*256
    this.BLANK_SCREEN_BIT = 0x10;       //1 - on, 0 - off
    this.INTERRUPT_BIT = 0x20;          //1 - on, 0 - off

    //порты 0xE0-0xE4 использовались работы с контроллером ГМД
    //в Chameleon DOS и CP/M-80 версии Дмитрия Скачкова

    //port 0xC0
    //[http://lvovpc.cu.cc/article.shtml?id=2]
    //[http://lvovpc.cu.cc/article.shtml?id=5]
    this.PRINTER_PORT = 0xC0;

    //port 0xC1 (b)
    this.PALETTE_PORT = 0xC1;
    this.BEEPER_MODE_BIT = 0x80;        // 1 - вывод звука на бипер разрешен

    //port 0xC2 (c)
    this.MEDIA_PORT = 0xC2;
    this.BEEPER_BIT = 0x1;              //1 - on, 0 - off
    this.VRAM_STATUS_BIT = 0x2;         //0 - видеоОЗУ подключено
    this.PRINTER_SC_STROBE_BIT = 0x4;
    this.TAPE_READ_BIT = 0x10;
    this.PRINTER_AC_BUSY_BIT = 0x40;

    this.ports = new Uint8Array(0x100);
    this.init();
}

IO.prototype.init = function() {
    this.restart();
};

IO.prototype.restart = function() {
    for (var i = 0, L = this.ports.length; i < L; i++) {
        this.ports[i] = 0;
    }

    this.decoding_mask = this.config.io.allow_brief_decoding ? 0x13 : 0x33;
    this.ignore_cntrl_bit = this.config.beeper.ignore_control_bit;
    this.ports[this.PALETTE_PORT] = 0x8F;
    this.ports[this.MEDIA_PORT] = 0xFF;
};

IO.prototype.input = function(port) {
    port &= 0xFF;

    //В ПК-01 "Львов" реализована неполная дешифрация портов ввода-вывода
    //[http://lvovpc.ho.ua/forum/viewtopic.php?p=2219#p2219]
    port = 0xC0 + (port & this.decoding_mask);

    if (port === 0xD1) {
        this.ports[port] = this.keyboard.get(this.ports[0xD0], 0xD0);
    }
    else if (port === 0xD2) {
        this.ports[port] = this.keyboard.get(this.ports[0xD2], 0xD2);
    }
    else if ((port & 0x03) === 3) {
      //Согласно документу i8255A/i8255A-5 datasheet мы имеем,
      //что Control Word Register доступен только для записи:
      //"The Control Word Register can Only be written into.
      //No Read operation of the Control Word Register is allowed."
      //[http://www.classiccmp.org/rtellason/chipdata/8255.pdf]
      //Такие дела, котаны. Берегите себя, читайте мануалы.
      return 0;
    }

    return this.ports[port];
};

IO.prototype.output = function(port, w8) {
    port &= 0xFF;

    //В ПК-01 "Львов" реализована неполная дешифрация портов ввода-вывода
    //[http://lvovpc.ho.ua/forum/viewtopic.php?p=2219#p2219]
    port = 0xC0 + (port & this.decoding_mask);

    if ((port & 0x03) === 3 && (w8 & 0x80) === 0) {
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
        if ((this.ports[this.PALETTE_PORT] & this.BEEPER_MODE_BIT) || this.ignore_cntrl_bit) {
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

    for (var i = 0, L = this.ports.length; i < L; i++) {
        ports[i] = this.input(i);
    }

    return ports;
};