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

import { Config } from './config.js';
import { Beeper } from './beeper.js';
import { Keyboard } from './keyboard.js';
import { assertInstance } from './utils/assert.js';

// i8255A control-word bit set/reset (BSR) mode: bit 7 == 0 selects it, bits 1-3
// pick the bit and bit 0 selects set (1) or reset (0).
const PPI_MODE_BIT = 0x80;
const BSR_BIT_MASK = 0x0e;
const BSR_BIT_SHIFT = 1;
const BSR_SET_BIT = 0x01;

export class IO {
  constructor(config, beeper, keyboard) {
    assertInstance(config, Config, 'IO: Invalid CONFIG object');
    this.config = config;

    assertInstance(beeper, Beeper, 'IO: Invalid BEEPER object');
    this.beeper = beeper;

    assertInstance(keyboard, Keyboard, 'IO: Invalid KEYBOARD object');
    this.keyboard = keyboard;

    //port 0xF0
    //[http://lvovpc.cu.cc/article.shtml?id=6]
    this.EXTENDED_MODE_PORT = 0xf0;
    this.EXTENDED_MEMORY_BIT = 0x4; //1 - extended RAM banks are enabled
    this.HIGH_RESOLUTION_BIT = 0x8; //0 - 256*256, 1 - 512*256
    this.BLANK_SCREEN_BIT = 0x10; //1 - on, 0 - off
    this.INTERRUPT_BIT = 0x20; //1 - on, 0 - off

    // Ports 0xE0-0xE4 were used to work with the FDD controller in
    // Chameleon DOS and Dmitry Skachkov's CP/M-80.

    //port 0xC0
    //[http://lvovpc.cu.cc/article.shtml?id=2]
    //[http://lvovpc.cu.cc/article.shtml?id=5]
    this.PPI_BASE_PORT = 0xc0;
    this.PRINTER_PORT = this.PPI_BASE_PORT;

    //port 0xC1 (b)
    this.PALETTE_PORT = 0xc1;
    this.BEEPER_MODE_BIT = 0x80; // 1 - sound output to the beeper is enabled

    //port 0xC2 (c)
    this.MEDIA_PORT = 0xc2;
    this.BEEPER_BIT = 0x1; //1 - on, 0 - off
    this.VRAM_STATUS_BIT = 0x2; // 0 - video RAM is connected
    this.PRINTER_SC_STROBE_BIT = 0x4;
    this.TAPE_READ_BIT = 0x10;
    this.PRINTER_AC_BUSY_BIT = 0x40;

    //port 0xD0-0xD3
    // PPI2: keyboard.
    this.KEYBOARD_SELECT_PORT = 0xd0; // PPI2 port A (column select)
    this.KEYBOARD_STATUS_PORT = 0xd1; // PPI2 port B (keyboard status)
    this.KEYBOARD_DATA_PORT = 0xd2; // PPI2 port C (keyboard data)

    // The 4th register of a PPI is the write-only Control Word Register.
    this.PPI_CONTROL_REGISTER = 0x3;

    this.ports = new Uint8Array(0x100);
    this.init();
  }

  init() {
    this.restart();
  }

  restart() {
    this.ports.fill(0);

    this.decoding_mask = this.config.io.allow_brief_decoding ? 0x13 : 0x33;
    this.ignore_cntrl_bit = this.config.beeper.ignore_control_bit;
    this.ports[this.PALETTE_PORT] = 0x8f;
    this.ports[this.MEDIA_PORT] = 0xff;
  }

  input(port) {
    port &= 0xff;

    // The PC-01 "Lviv" implements partial I/O port address decoding
    //[http://lvovpc.ho.ua/forum/viewtopic.php?p=2219#p2219]
    port = this.PPI_BASE_PORT + (port & this.decoding_mask);

    if (port === this.KEYBOARD_STATUS_PORT) {
      this.ports[port] = this.keyboard.get(
        this.ports[this.KEYBOARD_SELECT_PORT],
        this.KEYBOARD_SELECT_PORT
      );
    } else if (port === this.KEYBOARD_DATA_PORT) {
      this.ports[port] = this.keyboard.get(
        this.ports[this.KEYBOARD_DATA_PORT],
        this.KEYBOARD_DATA_PORT
      );
    } else if ((port & this.PPI_CONTROL_REGISTER) === this.PPI_CONTROL_REGISTER) {
      // Per the i8255A/i8255A-5 datasheet, the Control Word Register is
      // write-only: "The Control Word Register can Only be written into.
      // No Read operation of the Control Word Register is allowed."
      //[http://www.classiccmp.org/rtellason/chipdata/8255.pdf]
      // Read the datasheets, folks.
      return 0;
    }

    return this.ports[port];
  }

  output(port, w8) {
    port &= 0xff;

    // The PC-01 "Lviv" implements partial I/O port address decoding
    //[http://lvovpc.ho.ua/forum/viewtopic.php?p=2219#p2219]
    port = this.PPI_BASE_PORT + (port & this.decoding_mask);

    // Bit 7 == 0 selects the bit set/reset mode.
    if (
      (port & this.PPI_CONTROL_REGISTER) === this.PPI_CONTROL_REGISTER &&
      (w8 & PPI_MODE_BIT) === 0
    ) {
      const mask = 0x01 << ((w8 & BSR_BIT_MASK) >> BSR_BIT_SHIFT),
        target = port - 1;

      if (w8 & BSR_SET_BIT) {
        this.output(target, this.input(target) | mask);
      } else {
        this.output(target, this.input(target) & ~mask);
      }
    }

    if (port === this.MEDIA_PORT) {
      if (this.ports[this.PALETTE_PORT] & this.BEEPER_MODE_BIT || this.ignore_cntrl_bit) {
        this.beeper.process(w8 & this.BEEPER_BIT);
      }
    }

    this.ports[port] = w8;
  }

  interrupt(iff) {
    return void iff;
  }

  get_state() {
    const ports = [];

    for (let i = 0, L = this.ports.length; i < L; i++) {
      ports[i] = this.input(i);
    }

    return ports;
  }
}
