import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createCore } from './helpers.js';
import { BOOT_CYCLES, applyTapeEntry } from '../src/tapeEntry.js';

const DATA_DIR = new URL('../public/data/', import.meta.url);

// The ROM's BLOAD tail (DD61) runs a ~65 536-iteration delay loop (E260)
// before printing, so give the CPU enough cycles to get past it.
const CYCLES = 5_000_000;

/** Builds a BLOAD-format .lvt file: type 0xD0, name, AO/AE/AS, then body. */
function bloadLvt({ begin = 0x8000, end, start, body }) {
  const len = 0x16 + body.length;
  const buf = new Uint8Array(len);
  buf[0x09] = 0xd0;
  buf.set([0x54, 0x45, 0x53, 0x54, 0x20, 0x20], 0x0a); // "TEST  "
  buf[0x10] = begin & 0xff;
  buf[0x11] = begin >> 8;
  buf[0x12] = end & 0xff;
  buf[0x13] = end >> 8;
  buf[0x14] = start & 0xff;
  buf[0x15] = start >> 8;
  buf.set(body, 0x16);
  return new DataView(buf.buffer);
}

/** Builds a CLOAD-format .lvt file: type 0xD3, name, then body (BASIC program). */
function cloadLvt(body) {
  const len = 0x10 + body.length;
  const buf = new Uint8Array(len);
  buf[0x09] = 0xd3;
  buf.set([0x54, 0x45, 0x53, 0x54, 0x20, 0x20], 0x0a); // "TEST  "
  buf.set(body, 0x10);
  return new DataView(buf.buffer);
}

/**
 * Boots BASIC (reset + run the ROM cold-start) and returns the resulting core.
 * This mirrors ComputerProfile.boot_basic: the ROM is re-burned after the memory
 * wipe, the CPU runs BOOT_CYCLES to reach the prompt, and the video RAM is
 * disconnected so the snapshot round-trip is mapping-consistent.
 */
function bootCore() {
  const core = createCore('standard', { wait_states: true });
  const { cpu, memory, io } = core;
  const rom = readFileSync(new URL('rom-1990.bin', DATA_DIR));
  const romPage = memory.get_rom_page();

  io.restart();
  memory.restart();
  cpu.restart();
  for (let i = 0; i < rom.length; i++) romPage.burn(i, rom[i]);

  cpu.run(BOOT_CYCLES);
  io.ports[io.MEDIA_PORT] |= io.VRAM_STATUS_BIT;

  return core;
}

/**
 * Restores the booted BASIC base into a fresh core, applies the tape entry
 * delta and wires the traps with the attached .lvt (mirrors ComputerProfile.
 * launch_tape). Returns the running components.
 */
function launchTape(core, booted, lvt, kind) {
  const { cpu, memory, storage, traps } = core;

  storage.set_snapshot(new DataView(booted.buffer));
  applyTapeEntry(cpu, kind);

  let attached_file = lvt;
  traps.activate('default', {
    cpu,
    suspend: () => {},
    resume: () => {},
    hasTape: () => false,
    exists_attached_file: () => attached_file instanceof DataView,
    bload: (d) => storage.bload(d),
    cload: (d) => storage.cload(d),
    get_file: () => attached_file,
    detach_file: () => {
      attached_file = null;
    },
  });

  return { cpu, memory };
}

describe('Tape traps (BLOAD/CLOAD)', () => {
  let booted;
  let bootedPages;

  beforeAll(() => {
    const core = bootCore();
    booted = Uint8Array.from(core.storage.get_snapshot());
    bootedPages = core.memory.pages.map((page) => Uint8Array.from(page.mem));
  });

  it('restores the booted RAM pages losslessly', () => {
    const core = createCore('standard', { wait_states: true });
    core.storage.set_snapshot(new DataView(booted.buffer));

    core.memory.pages.forEach((page, i) => {
      expect([...page.mem]).toEqual([...bootedPages[i]]);
    });
  });

  it('BLOAD copies the file, sets system variables and autostarts', () => {
    const body = [0x76, 0x00, 0x00, 0x00]; // HLT at the run address
    const { cpu, memory } = launchTape(
      createCore('standard', { wait_states: true }),
      booted,
      bloadLvt({ begin: 0x8000, end: 0x8003, start: 0x8000, body }),
      'bload'
    );

    cpu.run(CYCLES);

    expect(memory.read(0x8000)).toBe(0x76); // body copied
    expect(cpu.memory_read_word(0xbea4)).toBe(0x8000); // CODFL_ORG
    expect(cpu.memory_read_word(0xbea6)).toBe(0x8003); // CODFL_END
    expect(cpu.memory_read_word(0xbea9)).toBe(0x8000); // CODFL_RUN
    expect(memory.read(0xbe87)).toBe(0xd0); // FILE_TYPE
    expect(memory.read(0xbea3)).toBe(0x52); // AUTOSTART = 'R'
    // Autostart transferred control to the run address and halted there.
    expect(cpu.get_state().PC).toBe(0x8000);
    expect(cpu.is_halted).toBe(true);
  });

  it('BLOAD without a run address (AS=0) returns to BASIC instead of jumping to 0', () => {
    const { cpu, memory } = launchTape(
      createCore('standard', { wait_states: true }),
      booted,
      bloadLvt({ begin: 0x8000, end: 0x8003, start: 0, body: [0x76, 0x00, 0x00, 0x00] }),
      'bload'
    );

    cpu.run(CYCLES);

    expect(memory.read(0xbea3)).toBe(0x00); // AUTOSTART cleared by the AS=0 guard
    expect(cpu.memory_read_word(0xbea9)).toBe(0x0000); // CODFL_RUN = 0
    // Did not crash into address 0: execution returned to the BASIC loop.
    expect(cpu.get_state().PC).not.toBe(0);
  });

  it('CLOAD sets FILE_TYPE and the BASIC file variables', () => {
    const { cpu, memory } = launchTape(
      createCore('standard', { wait_states: true }),
      booted,
      cloadLvt([0x0a, 0x10, 0x20, 0x30]),
      'cload'
    );

    const begin = cpu.memory_read_word(0x0243);
    cpu.run(CYCLES);

    expect(memory.read(0xbe87)).toBe(0xd3); // FILE_TYPE
    expect(cpu.memory_read_word(0xbe88)).toBe(begin); // BASFL_ORG
    expect(cpu.get_state().PC).not.toBe(0); // reached the CLOAD tail, no crash
  });

  it('cload() copies the program body directly', () => {
    const { cpu, memory, storage } = createCore('standard', { wait_states: true });

    const begin = 0x6000;
    const body = [0x0a, 0x10, 0x20, 0x30];
    cpu.memory_write_word(0x0243, begin);

    expect(storage.cload(cloadLvt(body))).toBe(true);

    expect(memory.read(begin)).toBe(0x0a);
    expect(memory.read(begin + 1)).toBe(0x10);
    expect(memory.read(begin + 3)).toBe(0x30);
    expect(memory.read(0xbe87)).toBe(0xd3); // FILE_TYPE
    expect(cpu.memory_read_word(0xbe88)).toBe(begin); // BASFL_ORG
    expect(cpu.memory_read_word(0xbe8a)).toBe(begin + 3); // BASFL_END
    expect(cpu.memory_read_word(0x0245)).toBe(begin + 3); // BAS_VARS
  });

  // The trap runs inside cpu.run(): before P2.21 a truncated image threw a RangeError out
  // of the frame loop and left the emulator suspended with no further animation frames.
  it('BLOAD of a truncated image reports an I/O error instead of throwing', () => {
    const truncated = new DataView(new Uint8Array(10).buffer);
    truncated.setUint8(0x09, 0xd0);

    const { cpu } = launchTape(
      createCore('standard', { wait_states: true }),
      booted,
      truncated,
      'bload'
    );

    expect(() => cpu.run(CYCLES)).not.toThrow();
    expect(cpu.get_state().PC).not.toBe(0); // the ROM returned to BASIC
  });

  it('CLOAD of a truncated image reports an I/O error instead of throwing', () => {
    const truncated = new DataView(new Uint8Array(10).buffer);
    truncated.setUint8(0x09, 0xd3);

    const { cpu } = launchTape(
      createCore('standard', { wait_states: true }),
      booted,
      truncated,
      'cload'
    );

    expect(() => cpu.run(CYCLES)).not.toThrow();
    expect(cpu.get_state().PC).not.toBe(0);
  });
});
