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


function Memory(config, io) {
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
        case 80: case 'standart': case 'default':
            this.pages = [
                new MemoryPage({
                    begin : 0x0000
                }),
                new MemoryPage({
                    begin : 0x4000
                }),
                new MemoryPage({
                    begin : 0x8000
                }),
                //rom
                new MemoryPage({
                    begin : 0xC000,
                    is_rom : true,
                    is_writable : false
                }),
                //vram
                new MemoryPage({
                    begin   : 0x4000,
                    is_vram : true
                })
            ];
            break;

        case 144:
            this.pages = [
                new MemoryPage({
                    begin : 0x0000
                }),
                new MemoryPage({
                    begin : 0x4000
                }),
                new MemoryPage({
                    begin : 0x8000
                }),
                //rom
                new MemoryPage({
                    begin : 0xC000,
                    is_rom : true,
                    is_writable : false
                }),
                //vram
                new MemoryPage({
                    begin : 0x4000,
                    is_vram : true
                }),
                //ext_mem_bank = 0
                new MemoryPage({
                    begin : 0xC000
                }),
                new MemoryPage({
                    begin : 0xC000
                }),
                new MemoryPage({
                    begin : 0xC000
                }),
                new MemoryPage({
                    begin : 0xC000
                })
            ];
            break;

        case 256:
            this.pages = [
                new MemoryPage({
                    begin : 0x0000
                }),
                new MemoryPage({
                    begin : 0x4000
                }),
                new MemoryPage({
                    begin : 0x8000
                }),
                //rom
                new MemoryPage({
                    begin : 0xC000,
                    is_rom : true,
                    is_writable : false
                }),
                //vram
                new MemoryPage({
                    begin : 0x4000,
                    is_vram : true
                }),
                //ext_mem_bank = 0
                new MemoryPage({
                    begin : 0xC000
                }),
                new MemoryPage({
                    begin : 0xC000
                }),
                new MemoryPage({
                    begin : 0xC000
                }),
                new MemoryPage({
                    begin : 0xC000
                }),
                //ext_mem_bank = 1
                new MemoryPage({
                    begin : 0xC000
                }),
                new MemoryPage({
                    begin : 0xC000
                }),
                new MemoryPage({
                    begin : 0xC000
                }),
                new MemoryPage({
                    begin : 0xC000
                }),
                //ext_mem_bank = 2
                new MemoryPage({
                    begin : 0xC000
                }),
                new MemoryPage({
                    begin : 0xC000
                }),
                new MemoryPage({
                    begin : 0xC000
                }),
                new MemoryPage({
                    begin : 0xC000
                }),
                //ext_mem_bank = 3
                new MemoryPage({
                    begin : 0xC000
                }),
                new MemoryPage({
                    begin : 0xC000
                }),
                new MemoryPage({
                    begin : 0xC000
                }),
                new MemoryPage({
                    begin : 0xC000
                })
            ];
            break;

        default:
            throw new Error('MEMORY: Unknow memory map');
    }

    this.init();
}

Memory.prototype.init = function() {
    for (var i = 0, pages = this.pages, l = pages.length, strict_mode = this.config.memory.strict_mode; i < l; i++) {
        if (pages[i].is_rom) {
             this.rom_page_index = i;
        }

        if (pages[i].is_vram) {
             this.vram_page_index = i;
             this.ext_page_index = i + 1;
        }

        pages[i].strict_mode = strict_mode;
    }

    this.vram_page = (this.get_vram_page().begin & 0xC000) >>> 14;
};

Memory.prototype.restart = function() {
    for (var i = 0, l = this.pages.length; i < l; i++) {
        this.pages[i].restart();
    }
};

Memory.prototype.read = function(addr) {
    return this.pages[this.get_mem_page_index(addr)].read(addr);
};

Memory.prototype.write = function(addr, w8) {
    this.pages[this.get_mem_page_index(addr)].write(addr, w8);
};

Memory.prototype.transfer = function(begin, end, data, offset, mem_page, method) {
    offset = offset || 0;
    method = method || 'write';

    var self = mem_page instanceof MemoryPage ? mem_page : this;

    if (Array.isArray(data)) {
        for (var addr = begin; addr <= end; addr++) {
            self[method](addr, data[offset++]);
        }
    }
    else if (data instanceof DataView) {
        for (var addr = begin; addr <= end; addr++) {
            self[method](addr, data.getUint8(offset++));
        }
    }
    else {
        offset = false;
    }

    return offset;
};

Memory.prototype.get_mem_page_index = function(addr) {
    var mem_page = (addr & 0xC000) >>> 14,
        mem_page_index = mem_page,
        io = this.io;

    if (mem_page === 0 || mem_page === this.vram_page) {
        var vram_status = (io.ports[io.MEDIA_PORT] & io.VRAM_STATUS_BIT) === 0;

        if (vram_status) {
            mem_page_index = (mem_page === this.vram_page) ? this.vram_page_index : (this.config.memory.fix_vram ? 0 : 2);
        }
    }
    else if (mem_page === 3) {
        var mem_map = this.mem_map;

        if ((mem_map === 144 || mem_map === 256) && (io.EXTENDED_MODE_PORT & 0x04)) {
            mem_page_index = this.ext_page_index + ((mem_map === 144 ? 0 : io.ports[io.EXTENDED_MODE_PORT] >>> 6) << 2) + ((io.EXTENDED_MODE_PORT & 0x07) - 4);
        }
    }

    return mem_page_index;
};

Memory.prototype.get_rom_page = function() {
    return this.pages[this.rom_page_index];
};

Memory.prototype.get_vram_page = function() {
    return this.pages[this.vram_page_index];
};

Memory.prototype.get_state = function(mem_map) {
    var mem = [];

    switch (mem_map || 'default') {
        case 80: case 'standart': case 'default':
            for (var addr = 0x0000; addr <= 0xFFFF; addr++) {
                mem.push(this.pages[(addr & 0xC000) >>> 14].read(addr));
            }

            var vram_page = this.get_vram_page();
            for (var addr = 0x4000; addr <= 0x7FFF; addr++) {
                mem.push(vram_page.read(addr));
            }
            break;

        default:
            throw new Error('MEMORY: Unknow memory map');
    }

    return mem;
};


function MemoryPage(config) {
    this.begin = config.begin;
    this.is_readable = 'is_readable' in config ? config.is_readable : true;
    this.is_writable = 'is_writable' in config ? config.is_writable : true;
    this.strict_mode = 'strict_mode' in config ? config.strict_mode : true;;

    if ('is_rom' in config) {
        this.is_rom = config.is_rom;
    }
    else if('is_vram' in config) {
        this.is_vram = config.is_vram;
    }
    else {
        this.is_ram = true;
    }

    this.mem = [];

    this.init();
}

MemoryPage.prototype.init = function() {
    this.restart();
};

MemoryPage.prototype.restart = function() {
    for (var i = 0; i < 0x4000; i++) {
        this.mem[i] = 0x00;
    }
};

MemoryPage.prototype.read = function(addr) {
    if (!this.is_readable) {
        if (this.strict_mode) {
            throw new Error('MEMORY: Read disabled at ' + addr);
        }
        else {
            console.log('MEMORY: Read disabled at ' + addr);
        }
    }

    return this.mem[addr & 0x3FFF];
};

MemoryPage.prototype.write = function(addr, w8) {
    if (this.is_writable) {
        this.mem[addr & 0x3FFF] = w8;
    }
    else {
        if (this.strict_mode) {
            throw new Error('MEMORY: Write disabled at ' + addr);
        }
        else {
            console.log('MEMORY: Write disabled at ' + addr);
        }
    }
};

MemoryPage.prototype.burn = function(addr, w8) {
    if (this.is_rom) {
        this.mem[addr & 0x3FFF] = w8 & 0xFF;
    }
    else {
        if (this.strict_mode) {
            throw new Error('MEMORY: Burn disabled at ' + addr);
        }
        else {
            console.log('MEMORY: Burn disabled at ' + addr);
        }
    }
};
