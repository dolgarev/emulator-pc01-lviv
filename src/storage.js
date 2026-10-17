import { assertInstance } from './utils/assert.js';
import { Memory } from './memory.js';
import { IO } from './io.js';
import { I8080 } from './i8080.js';

export class Storage {
  constructor(cpu, memory, io) {
    assertInstance(cpu, I8080, 'STORAGE: Invalid CPU object');
    assertInstance(memory, Memory, 'STORAGE: Invalid MEMORY object');
    assertInstance(io, IO, 'STORAGE: Invalid IO object');

    this.cpu = cpu;
    this.memory = memory;
    this.io = io;
  }

  bload(data) {
    assertInstance(data, DataView, 'STORAGE: Param DATA is not DataView');

    const type = data.getUint8(0x09),
      offset = this.cpu.memory_read_word(0xbeab),
      begin = data.getUint16(0x10, true) + offset,
      end = data.getUint16(0x12, true) + offset,
      start = data.getUint16(0x14, true);

    if (type === 0xd0) {
      try {
        this.memory.transfer(0xbe92, 0xbe97, data, 0x0a);
        this.cpu.memory_write_word(0xbea4, begin);
        this.cpu.memory_write_word(0xbea6, end);
        this.cpu.memory_write_word(0xbea9, start);
        // FILE_TYPE = 0xD0 (code file), as the ROM BLOAD entry does (DD94/DD96).
        this.cpu.memory_write_byte(0xbe87, 0xd0);
        // Guard against AUTOSTART set with no run address (AS = 0): the ROM
        // tail (DD20) unconditionally does PCHL CODFL_RUN when AUTOSTART is
        // non-zero, which would jump to 0. Clear it so control returns to BASIC.
        // (AUTOSTART itself is set by the command parser / snapshot; we only
        // remove it here when it would crash, never force it on.)
        if (start === 0 && this.cpu.memory_read_byte(0xbea3) !== 0) {
          this.cpu.memory_write_byte(0xbea3, 0x00);
        }
        this.memory.transfer(begin, end, data, 0x16);
      } catch {
        return false;
      }
      return true;
    } else {
      return false;
    }
  }

  cload(data) {
    assertInstance(data, DataView, 'STORAGE: Param DATA is not DataView');

    const type = data.getUint8(0x09),
      begin = this.cpu.memory_read_word(0x0243),
      end = begin + data.byteLength - 0x11;

    if (type === 0xd3) {
      try {
        this.memory.transfer(0xbe92, 0xbe97, data, 0x0a);
        this.cpu.memory_write_word(0x0245, end);
        // FILE_TYPE = 0xD3 (BASIC file), as the ROM CLOAD entry does (E535/E537).
        this.cpu.memory_write_byte(0xbe87, 0xd3);
        // BASFL_ORG / BASFL_END, as the ROM CLOAD entry does (E53D / E543).
        this.cpu.memory_write_word(0xbe88, begin);
        this.cpu.memory_write_word(0xbe8a, end);
        this.memory.transfer(begin, end, data, 0x10);
      } catch {
        return false;
      }
      return true;
    } else {
      return false;
    }
  }

  set_e3_snapshot(data) {
    assertInstance(data, DataView, 'PROFILE: Param DATA is not DataView');

    let offset = 0x240;

    this.io.restart();
    // A snapshot is a machine that has already performed I/O writes, so the initial ROM
    // mapping of RESET is not armed and the memory restored below is RAM (P2.17).
    this.io.initial_rom_mapping = false;
    offset = this.memory.transfer(0x0000, 0xbfff, data, offset);
    offset = this.memory.transfer(0xc000, 0xffff, data, offset, this.memory.get_rom_page(), 'burn');
    offset = this.memory.transfer(0x4000, 0x7fff, data, offset + 0x29, this.memory.get_vram_page());

    //PPI1
    this.io.ports[0xc0] = data.getUint8(offset + 0x22);
    this.io.ports[0xc1] = data.getUint8(offset + 0x26);
    this.io.ports[0xc2] = data.getUint8(offset + 0x2a);
    // The i8255A CWR is write-only.
    //this.io.ports[0xC3] = data.getUint8(offset + 0x34);

    //PPI2
    this.io.ports[0xd0] = data.getUint8(offset + 0x44);
    this.io.ports[0xd1] = data.getUint8(offset + 0x48);
    this.io.ports[0xd2] = data.getUint8(offset + 0x4c);
    // The i8255A CWR is write-only.
    //this.io.ports[0xD3] = data.getUint8(offset + 0x56);

    this.cpu.restart();
    this.cpu.set_state({
      A: data.getUint8(0x1ba),
      F: data.getUint8(0x1be),
      B: data.getUint8(0x1c2),
      C: data.getUint8(0x1c6),
      D: data.getUint8(0x1ca),
      E: data.getUint8(0x1ce),
      H: data.getUint8(0x1d2),
      L: data.getUint8(0x1d6),
      SP: data.getUint16(0x1db, true),
      PC: data.getUint16(0x1e1, true),
    });
  }

  set_snapshot(data) {
    assertInstance(data, DataView, 'PROFILE: Param DATA is not DataView');

    let offset = 0x11;

    this.io.restart();
    // A snapshot is a machine that has already performed I/O writes, so the initial ROM
    // mapping of RESET is not armed and the memory restored below is RAM (P2.17).
    this.io.initial_rom_mapping = false;
    offset = this.memory.transfer(0x0000, 0xbfff, data, offset);
    offset = this.memory.transfer(0xc000, 0xffff, data, offset, this.memory.get_rom_page(), 'burn');
    offset = this.memory.transfer(0x4000, 0x7fff, data, offset, this.memory.get_vram_page());

    // Every address that selects no device (0x00..0xBF, 0xE0..0xEF) is dropped by the
    // decoding, so this replays exactly the state of the devices the machine has -
    // including the port 0xF0 latch of the PK-02 board, which the old address mask used
    // to fold onto the keyboard PPI (P2.14).
    for (let port = 0x00; port <= 0xff; port++) {
      this.io.output(port, data.getUint8(offset++));
    }

    // Palette fix: because port 0xC1 is write-only by default, the snapshot
    // stores 0xFF instead of the real palette value. Set the default palette
    // to work around this.
    if (this.io.input(this.io.PALETTE_PORT) === 0xff) {
      this.io.output(this.io.PALETTE_PORT, 0x8f);
    }

    this.cpu.restart();
    this.cpu.set_state({
      B: data.getUint8(offset + 0x00),
      C: data.getUint8(offset + 0x01),
      D: data.getUint8(offset + 0x02),
      E: data.getUint8(offset + 0x03),
      H: data.getUint8(offset + 0x04),
      L: data.getUint8(offset + 0x05),
      A: data.getUint8(offset + 0x06),
      F: data.getUint8(offset + 0x07),
      SP: data.getUint16(offset + 0x08, true),
      PC: data.getUint16(offset + 0x0a, true),
    });
  }

  get_snapshot() {
    // Header of the form: LVOV/DUMP/2.0/H+\0
    const data = [
      0x4c, 0x56, 0x4f, 0x56, 0x2f, 0x44, 0x55, 0x4d, 0x50, 0x2f, 0x32, 0x2e, 0x30, 0x2f, 0x48,
      0x2b, 0x00,
    ].concat(this.memory.get_state(), this.io.get_state());
    const cpu_state = this.cpu.get_state();

    data.push((cpu_state.BC & 0xff00) >> 8); //B
    data.push(cpu_state.BC & 0x00ff); //C
    data.push((cpu_state.DE & 0xff00) >> 8); //D
    data.push(cpu_state.DE & 0x00ff); //E
    data.push((cpu_state.HL & 0xff00) >> 8); //H
    data.push(cpu_state.HL & 0x00ff); //L
    data.push((cpu_state.AF & 0xff00) >> 8); //A
    data.push(cpu_state.AF & 0x00ff); //F
    data.push(cpu_state.SP & 0x00ff); //SP
    data.push((cpu_state.SP & 0xff00) >> 8);
    data.push(cpu_state.PC & 0x00ff); //PC
    data.push((cpu_state.PC & 0xff00) >> 8);
    return data;
  }
}
