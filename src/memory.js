import { Config } from './config.js';
import { IO } from './io.js';
import { assertInstance } from './utils/assert.js';

// Page geometry: the top two address bits select one of four 16 KiB pages.
const PAGE_SHIFT = 14;
const PAGE_MASK = 0xc000;
const PAGE_SIZE = 0x4000;
const PAGE_OFFSET_MASK = PAGE_SIZE - 1;

// Bank indices (the value of the top two address bits).
const BANK_0 = 0;
const BANK_ROM = 3;

// Page index the 0x0000-0x3fff window falls back to when bank 0 is hidden.
const HIDDEN_BANK_PAGE = 2;

// Supported memory maps (total RAM size in KiB).
const MEM_MAP = {
  STD_80: 80,
  EXT_144: 144,
  EXT_256: 256,
};

// Legacy string aliases accepted for the standard map.
const MEM_MAP_ALIASES = {
  standard: MEM_MAP.STD_80,
  default: MEM_MAP.STD_80,
};

const normalizeMemMap = (mem_map) => MEM_MAP_ALIASES[mem_map] ?? mem_map;

// Extended RAM decoding through port 0xf0: bits 0-2 select a page (4-7) and
// bits 6-7 select the 16 KiB bank; each bank holds four pages.
const EXTENDED_BANK_SHIFT = 6;
const EXTENDED_PAGE_MASK = 0x07;
const EXTENDED_PAGE_BASE = 4;
const PAGES_PER_BANK_SHIFT = 2;

export class Memory {
  constructor(config, io, contention = undefined) {
    assertInstance(config, Config, 'MEMORY: Invalid CONFIG object');
    this.config = config;

    assertInstance(io, IO, 'MEMORY: Invalid IO object');
    this.io = io;

    // Optional: charges the cycles the video circuit steals on RAM accesses (P2.11).
    this.contention = contention;

    this.mem_map = normalizeMemMap(this.config.memory.map);
    this.pages = this.createMemoryPages(this.mem_map);

    this.init();
  }

  createMemoryPages(mem_map) {
    const map = normalizeMemMap(mem_map);

    // Base layout: three RAM banks, the ROM and a video-RAM window.
    const pages = [
      new MemPage({ begin: 0x0000 }), // RAM bank 0
      new MemPage({ begin: 0x4000 }), // RAM bank 1
      new MemPage({ begin: 0x8000 }), // RAM bank 2
      new MemPage({ begin: 0xc000, is_rom: true, is_writable: false }), // ROM
      new MemPage({ begin: 0x4000, is_vram: true }), // video RAM
    ];

    switch (map) {
      case MEM_MAP.STD_80:
        break;

      case MEM_MAP.EXT_144:
      case MEM_MAP.EXT_256: {
        // Extended RAM: four pages per bank, selected through port 0xf0.
        const banks = map === MEM_MAP.EXT_256 ? 4 : 1;

        for (let i = 0; i < banks * 4; i++) {
          pages.push(new MemPage({ begin: 0xc000 }));
        }
        break;
      }

      default:
        throw new Error('MEMORY: Unknown memory map');
    }

    return pages;
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

    this.vram_page = (this.get_vram_page().begin & PAGE_MASK) >>> PAGE_SHIFT;
    this.hide_0_bank = this.config.memory.hide_0_mem_bank;
  }

  restart() {
    for (const page of this.pages) {
      page.restart();
    }
  }

  read(addr) {
    const page = this.pages[this.get_mem_page_index(addr)];

    // The video circuit contends RAM, not the ROM: code in ROM keeps the nominal speed,
    // which is why the beeper's tone sounds at the pitch the ROM generates it with.
    if (!page.is_rom) this.contention?.read();

    return page.read(addr);
  }

  write(addr, w8) {
    const page = this.pages[this.get_mem_page_index(addr)];

    if (!page.is_rom) this.contention?.write();

    page.write(addr, w8);
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
      throw new TypeError('MEMORY: Param DATA must be an Array or a DataView');
    }

    return offset;
  }

  get_mem_page_index(addr) {
    const io = this.io;
    const mem_page = (addr & PAGE_MASK) >>> PAGE_SHIFT;
    let mem_page_index = mem_page;

    if (mem_page === BANK_0 || mem_page === this.vram_page) {
      // With video RAM disabled the window falls back to the hidden bank 0.
      if ((io.ports[io.MEDIA_PORT] & io.VRAM_STATUS_BIT) === 0) {
        if (mem_page === this.vram_page) {
          mem_page_index = this.vram_page_index;
        } else {
          mem_page_index = this.hide_0_bank ? HIDDEN_BANK_PAGE : BANK_0;
        }
      }
    } else if (mem_page === BANK_ROM) {
      const extended = io.ports[io.EXTENDED_MODE_PORT];

      if (this.mem_map !== MEM_MAP.STD_80 && extended & io.EXTENDED_MEMORY_BIT) {
        const bank = this.mem_map === MEM_MAP.EXT_256 ? extended >>> EXTENDED_BANK_SHIFT : 0;

        mem_page_index =
          this.ext_page_index +
          (bank << PAGES_PER_BANK_SHIFT) +
          ((extended & EXTENDED_PAGE_MASK) - EXTENDED_PAGE_BASE);
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

  get_state(mem_map = MEM_MAP.STD_80) {
    if (normalizeMemMap(mem_map) !== MEM_MAP.STD_80) {
      throw new Error('MEMORY: Unknown memory map');
    }

    const mem = [];

    for (let addr = 0x0000; addr <= 0xffff; addr++) {
      mem.push(this.pages[(addr & PAGE_MASK) >>> PAGE_SHIFT].read(addr));
    }

    const vram_page = this.get_vram_page();
    for (let addr = 0x4000; addr <= 0x7fff; addr++) {
      mem.push(vram_page.read(addr));
    }

    return mem;
  }
}

export class MemPage {
  constructor(config) {
    this.begin = config.begin;
    this.is_readable = config.is_readable ?? true;
    this.is_writable = config.is_writable ?? true;
    this.strict_mode = config.strict_mode ?? true;

    if ('is_rom' in config) {
      this.is_rom = config.is_rom;
    } else if ('is_vram' in config) {
      this.is_vram = config.is_vram;
    } else {
      this.is_ram = true;
    }

    this.mem = new Uint8Array(PAGE_SIZE);

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

    return this.mem[addr & PAGE_OFFSET_MASK];
  }

  write(addr, w8) {
    if (this.is_writable) {
      this.mem[addr & PAGE_OFFSET_MASK] = w8;
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
      this.mem[addr & PAGE_OFFSET_MASK] = w8;
    } else {
      if (this.strict_mode) {
        throw new Error(`MEMORY: Burn disabled at 0x${addr.toString(16)}`);
      } else {
        console.log(`MEMORY: Burn disabled at 0x${addr.toString(16)}`);
      }
    }
  }
}
