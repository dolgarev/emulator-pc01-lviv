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
import { IO } from './io.js';

export class Memory {
  constructor(config, io) {
    if (!(config instanceof Config)) {
      throw new Error('MEMORY: Invalid CONFIG object');
    }
    this.config = config;

    if (!(io instanceof IO)) {
      throw new Error('MEMORY: Invalid IO object');
    }
    this.io = io;

    this.mem_map = this.config.memory.map;

    switch (this.mem_map) {
      case 80:
      case 'standard':
      case 'default':
        this.pages = [
          new MemPage({
            begin: 0x0000,
          }),
          new MemPage({
            begin: 0x4000,
          }),
          new MemPage({
            begin: 0x8000,
          }),
          //rom
          new MemPage({
            begin: 0xc000,
            is_rom: true,
            is_writable: false,
          }),
          //vram
          new MemPage({
            begin: 0x4000,
            is_vram: true,
          }),
        ];
        break;

      case 144:
        this.pages = [
          new MemPage({
            begin: 0x0000,
          }),
          new MemPage({
            begin: 0x4000,
          }),
          new MemPage({
            begin: 0x8000,
          }),
          //rom
          new MemPage({
            begin: 0xc000,
            is_rom: true,
            is_writable: false,
          }),
          //vram
          new MemPage({
            begin: 0x4000,
            is_vram: true,
          }),
          //ext_mem_bank = 0
          new MemPage({
            begin: 0xc000,
          }),
          new MemPage({
            begin: 0xc000,
          }),
          new MemPage({
            begin: 0xc000,
          }),
          new MemPage({
            begin: 0xc000,
          }),
        ];
        break;

      case 256:
        this.pages = [
          new MemPage({
            begin: 0x0000,
          }),
          new MemPage({
            begin: 0x4000,
          }),
          new MemPage({
            begin: 0x8000,
          }),
          //rom
          new MemPage({
            begin: 0xc000,
            is_rom: true,
            is_writable: false,
          }),
          //vram
          new MemPage({
            begin: 0x4000,
            is_vram: true,
          }),
          //ext_mem_bank = 0
          new MemPage({
            begin: 0xc000,
          }),
          new MemPage({
            begin: 0xc000,
          }),
          new MemPage({
            begin: 0xc000,
          }),
          new MemPage({
            begin: 0xc000,
          }),
          //ext_mem_bank = 1
          new MemPage({
            begin: 0xc000,
          }),
          new MemPage({
            begin: 0xc000,
          }),
          new MemPage({
            begin: 0xc000,
          }),
          new MemPage({
            begin: 0xc000,
          }),
          //ext_mem_bank = 2
          new MemPage({
            begin: 0xc000,
          }),
          new MemPage({
            begin: 0xc000,
          }),
          new MemPage({
            begin: 0xc000,
          }),
          new MemPage({
            begin: 0xc000,
          }),
          //ext_mem_bank = 3
          new MemPage({
            begin: 0xc000,
          }),
          new MemPage({
            begin: 0xc000,
          }),
          new MemPage({
            begin: 0xc000,
          }),
          new MemPage({
            begin: 0xc000,
          }),
        ];
        break;

      default:
        throw new Error('MEMORY: Unknown memory map');
    }

    this.init();
  }

  init() {
    for (
      let i = 0, pages = this.pages, l = pages.length, strict_mode = this.config.memory.strict_mode;
      i < l;
      i++
    ) {
      if (pages[i].is_rom) {
        this.rom_page_index = i;
      }

      if (pages[i].is_vram) {
        this.vram_page_index = i;
        this.ext_page_index = i + 1;
      }

      pages[i].strict_mode = strict_mode;
    }

    this.vram_page = (this.get_vram_page().begin & 0xc000) >>> 14;
    this.hide_0_bank = this.config.memory.hide_0_mem_bank;
  }

  restart() {
    for (const page of this.pages) {
      page.restart();
    }
  }

  read(addr) {
    return this.pages[this.get_mem_page_index(addr)].read(addr);
  }

  write(addr, w8) {
    this.pages[this.get_mem_page_index(addr)].write(addr, w8);
  }

  transfer(begin, end, data, offset = 0, mem_page, method = 'write') {
    const self = mem_page instanceof MemPage ? mem_page : this;

    if (begin > end) {
      throw new RangeError('MEMORY: Invalid bounds');
    }

    if (Array.isArray(data)) {
      if (offset + (end - begin + 1) <= data.length) {
        for (let addr = begin; addr <= end; addr++) {
          self[method](addr, data[offset++]);
        }
      } else {
        throw new RangeError('MEMORY: Offset is outside the bounds of the Array');
      }
    } else if (data instanceof DataView) {
      if (offset + (end - begin + 1) <= data.byteLength) {
        for (let addr = begin; addr <= end; addr++) {
          self[method](addr, data.getUint8(offset++));
        }
      } else {
        throw new RangeError('MEMORY: Offset is outside the bounds of the DataView');
      }
    } else {
      offset = false;
    }

    return offset;
  }

  get_mem_page_index(addr) {
    const mem_page = (addr & 0xc000) >>> 14,
      io = this.io;
    let mem_page_index = mem_page;

    if (mem_page === 0 || mem_page === this.vram_page) {
      if ((io.ports[io.MEDIA_PORT] & io.VRAM_STATUS_BIT) === 0) {
        mem_page_index =
          mem_page === this.vram_page ? this.vram_page_index : this.hide_0_bank ? 2 : 0;
      }
    } else if (mem_page === 3) {
      const mem_map = this.mem_map;

      if ((mem_map === 144 || mem_map === 256) && io.ports[io.EXTENDED_MODE_PORT] & 0x04) {
        mem_page_index =
          this.ext_page_index +
          ((mem_map === 144 ? 0 : io.ports[io.EXTENDED_MODE_PORT] >>> 6) << 2) +
          ((io.ports[io.EXTENDED_MODE_PORT] & 0x07) - 4);
      }
    }

    return mem_page_index;
  }

  get_rom_page() {
    return this.pages[this.rom_page_index];
  }

  get_vram_page() {
    return this.pages[this.vram_page_index];
  }

  get_state(mem_map) {
    const mem = [];

    switch (mem_map || 'default') {
      case 80:
      case 'standard':
      case 'default': {
        for (let addr = 0x0000; addr <= 0xffff; addr++) {
          mem.push(this.pages[(addr & 0xc000) >>> 14].read(addr));
        }

        const vram_page = this.get_vram_page();
        for (let addr = 0x4000; addr <= 0x7fff; addr++) {
          mem.push(vram_page.read(addr));
        }
        break;
      }

      default:
        throw new Error('MEMORY: Unknown memory map');
    }

    return mem;
  }
}

export class MemPage {
  constructor(config) {
    this.begin = config.begin;
    this.is_readable = 'is_readable' in config ? config.is_readable : true;
    this.is_writable = 'is_writable' in config ? config.is_writable : true;
    this.strict_mode = 'strict_mode' in config ? config.strict_mode : true;

    if ('is_rom' in config) {
      this.is_rom = config.is_rom;
    } else if ('is_vram' in config) {
      this.is_vram = config.is_vram;
    } else {
      this.is_ram = true;
    }

    this.mem = new Uint8Array(0x4000);

    this.init();
  }

  init() {
    this.restart();
  }

  restart() {
    this.mem.fill(0);
  }

  read(addr) {
    if (!this.is_readable) {
      if (this.strict_mode) {
        throw new Error(`MEMORY: Read disabled at 0x${addr.toString(16)}`);
      } else {
        console.log(`MEMORY: Read disabled at 0x${addr.toString(16)}`);
      }
    }

    return this.mem[addr & 0x3fff];
  }

  write(addr, w8) {
    if (this.is_writable) {
      this.mem[addr & 0x3fff] = w8;
    } else {
      if (this.strict_mode) {
        throw new Error(`MEMORY: Write disabled at 0x${addr.toString(16)}`);
      } else {
        console.log(`MEMORY: Write disabled at 0x${addr.toString(16)}`);
      }
    }
  }

  burn(addr, w8) {
    if (this.is_rom) {
      this.mem[addr & 0x3fff] = w8;
    } else {
      if (this.strict_mode) {
        throw new Error(`MEMORY: Burn disabled at 0x${addr.toString(16)}`);
      } else {
        console.log(`MEMORY: Burn disabled at 0x${addr.toString(16)}`);
      }
    }
  }
}
