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

// I/O port decoding (P2.14). D28 (74155) selects one of the four peripheral blocks
// from A5 and A4, and it is enabled only while A7 and A6 are high: ~ROM_OE goes low
// when A15 and A14 are high, and because an I/O cycle puts the 8-bit port address on
// both halves of the address bus, that is the documented trick which decodes A7 and
// A6 without extra gates (docs/cpu_pio.md of the lvov repository).
const BLOCK_ENABLE_MASK = 0xc0; // A7, A6: nothing is selected outside 0xC0..0xFF
const BLOCK_SELECT_MASK = 0x30; // A5, A4: ~CS0 .. ~CS3
const BLOCK_SHIFT = 4;
const REGISTER_MASK = 0x03; // A1, A0: the register inside a PPI

// A read of an address that selects no device (or of a device that does not drive
// the bus) answers with the floating bus. Nothing pulls it low, so all bits read
// high - the same value IO.restart() puts into the media port for "no tape here".
const FLOATING_BUS = 0xff;
const NO_DEVICE = -1;

export class IO {
  constructor(config, beeper, keyboard, contention = undefined) {
    assertInstance(config, Config, 'IO: Invalid CONFIG object');
    this.config = config;

    assertInstance(beeper, Beeper, 'IO: Invalid BEEPER object');
    this.beeper = beeper;

    assertInstance(keyboard, Keyboard, 'IO: Invalid KEYBOARD object');
    this.keyboard = keyboard;

    // Optional: an I/O access costs one extra cycle (P2.11).
    this.contention = contention;

    //port 0xF0
    //[http://lvovpc.cu.cc/article.shtml?id=6]
    this.EXTENDED_MODE_PORT = 0xf0;
    this.EXTENDED_MEMORY_BIT = 0x4; //1 - extended RAM banks are enabled
    this.HIGH_RESOLUTION_BIT = 0x8; //0 - 256*256, 1 - 512*256
    this.BLANK_SCREEN_BIT = 0x10; //1 - on, 0 - off
    this.INTERRUPT_BIT = 0x20; //1 - on, 0 - off

    //Ports 0xE0-0xE4 were used to work with the FDD controller in
    //Chameleon DOS and Dmitry Skachkov's CP/M-80 (the ~CS2 block of the decoder).
    //~CS3 (0xF0..0xFF) is the X1 connector: the PK-02 board hangs its port 0xF0
    //latch there (P2.13), so the device exists only in a profile that has it.
    this.extended_port_latch = config.io.extended_port_latch;

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

    // RESET releases the CPU from the deadlock an I/O cycle below 0xC0 causes (P2.19).
    this.contention?.restart();

    // RESET sets the initial-reset flip-flop (D5A, cleared by the I/O write strobe on
    // D5.1). While it is set it holds ~ROM_OE low, the ROM answers for every address and
    // its 16 KiB are mapped into all four banks; the first I/O write leaves the ROM in
    // the top bank only (docs/memories.md, CODE_REVIEW.md P2.17).
    this.initial_rom_mapping = true;

    this.ignore_cntrl_bit = this.config.beeper.ignore_control_bit;
    this.ports[this.PALETTE_PORT] = 0x8f;
    this.ports[this.MEDIA_PORT] = 0xff;

    this.beeper_level = undefined;
    this.updateSound();
  }

  /**
   * Decodes an I/O port address into the canonical index of the device it selects,
   * or NO_DEVICE when no ~CS is active (P2.14). A2/A3 are not decoded by the
   * hardware, so 0xC4, 0xC8 and 0xCC are the same register as 0xC0.
   *
   * @param {number} port the address the CPU put on the bus
   * @returns {number} the port index of the selected device, or NO_DEVICE
   */
  decode_port(port) {
    port &= 0xff;

    if ((port & BLOCK_ENABLE_MASK) !== BLOCK_ENABLE_MASK) {
      return NO_DEVICE;
    }

    const register = port & REGISTER_MASK;

    // 0x00: ~CS0, the main PPI. 0x01: ~CS1, the keyboard PPI - both decode A1/A0,
    // so they answer on a 4-address window. 0x03: ~CS3, the PK-02 latch - its clock
    // comes from ~CS3 alone, so A1/A0 do not reach it and all sixteen addresses
    // write the one register; a serial machine has nothing wired there at all.
    // 0x02: ~CS2 is wired to X1, where this machine has no device.
    switch ((port & BLOCK_SELECT_MASK) >> BLOCK_SHIFT) {
      case 0:
        return this.PPI_BASE_PORT | register;

      case 1:
        return this.KEYBOARD_SELECT_PORT | register;

      case 3:
        return this.extended_port_latch ? this.EXTENDED_MODE_PORT : NO_DEVICE;

      default:
        return NO_DEVICE;
    }
  }

  // The speaker level is PC0 OR NOT PB7. The circuit is on the rebuilt schematic
  // (codepainters/lvov, sch/pio.kicad_sch, PDF page 6): PC0 and PB7 are the two
  // inputs of an open-collector NAND gate (D29D, K155LA8/7401) and its output is the
  // SPKR label, which reaches the emitter through the keyboard connector. With PB7
  // high the emitter follows PC0, with PB7 low the output is a constant high, i.e.
  // silence; by De Morgan the gate is PC0 OR NOT PB7. Whichever of the two ports is
  // written the level has to be recomputed - and it is the level that changed, not
  // just the port value, that the beeper has to see.
  updateSound() {
    const pc0 = this.ports[this.MEDIA_PORT] & this.BEEPER_BIT;
    const pb7 = this.ports[this.PALETTE_PORT] & this.BEEPER_MODE_BIT;
    const level = this.ignore_cntrl_bit ? pc0 : pc0 || !pb7 ? 1 : 0;

    if (level === this.beeper_level) return;

    this.beeper_level = level;
    this.beeper.process(level);
  }

  /**
   * Reads a port as the CPU does, in an I/O cycle: the access is timed and the wait state
   * arbiter decides whether the machine survives it (P2.11, P2.19).
   *
   * @param {number} port the address the CPU put on the bus
   * @returns {number} the value the selected device drives onto the bus
   */
  input(port) {
    this.contention?.io(port, this.initial_rom_mapping);

    return this.read_port(port);
  }

  /**
   * Reads a port without the timing and the arbitration of a CPU I/O cycle: the emulator's
   * own bookkeeping - the palette sample of the screen, the port window of a snapshot - is
   * not an access the CPU made, so it must not charge a wait cycle, and it must not hang the
   * machine the way a real I/O cycle below 0xC0 does (P2.19).
   *
   * @param {number} port the port address
   * @returns {number} the value the selected device drives onto the bus
   */
  read_port(port) {
    const decoded = this.decode_port(port);

    if (decoded === NO_DEVICE) {
      // No device is selected, so nothing drives the bus.
      return FLOATING_BUS;
    }

    if (decoded === this.KEYBOARD_STATUS_PORT) {
      this.ports[decoded] = this.keyboard.get(
        this.ports[this.KEYBOARD_SELECT_PORT],
        this.KEYBOARD_SELECT_PORT
      );
    } else if (decoded === this.KEYBOARD_DATA_PORT) {
      this.ports[decoded] = this.keyboard.get(
        this.ports[this.KEYBOARD_DATA_PORT],
        this.KEYBOARD_DATA_PORT
      );
    } else if ((decoded & REGISTER_MASK) === this.PPI_CONTROL_REGISTER) {
      // Per the i8255A/i8255A-5 datasheet, the Control Word Register is
      // write-only: "The Control Word Register can Only be written into.
      // No Read operation of the Control Word Register is allowed."
      //[http://www.classiccmp.org/rtellason/chipdata/8255.pdf]
      // Read the datasheets, folks. A device that does not drive the bus is not a
      // device that drives zeroes, though: the 8255 leaves the data bus undriven,
      // so it floats high - the same value the undecoded addresses answer with
      // (P2.15).
      return FLOATING_BUS;
    }

    return this.ports[decoded];
  }

  output(port, w8) {
    // The flip-flop of P2.17 is addressless: the I/O write strobe clears it before the
    // address decoder is reached. The ROM depends on that - its very first instruction is a
    // dummy `OUT 00H`, and 0x00 selects no device at all (P2.14). The arbiter has to judge
    // the state the cycle started in, so the flag is read before it is cleared (P2.19).
    const initial_rom_mapping = this.initial_rom_mapping;
    this.initial_rom_mapping = false;

    this.contention?.io(port, initial_rom_mapping);

    this.write_port(port, w8);
  }

  /**
   * Writes a port without the timing and the arbitration of a CPU I/O cycle: a snapshot
   * replay, palette fix included, is not an access the CPU made and must not hang the machine
   * (P2.19).
   *
   * @param {number} port the port address
   * @param {number} w8 the byte to write
   */
  write_port(port, w8) {
    const decoded = this.decode_port(port);

    if (decoded === NO_DEVICE) {
      // Nothing is selected: the write goes nowhere.
      return;
    }

    // Bit 7 == 0 selects the bit set/reset mode.
    if ((decoded & REGISTER_MASK) === this.PPI_CONTROL_REGISTER && (w8 & PPI_MODE_BIT) === 0) {
      const mask = 0x01 << ((w8 & BSR_BIT_MASK) >> BSR_BIT_SHIFT),
        target = decoded - 1;

      if (w8 & BSR_SET_BIT) {
        this.output(target, this.input(target) | mask);
      } else {
        this.output(target, this.input(target) & ~mask);
      }
    }

    // The speaker follows PC0 (see updateSound), so only remember the value here.
    this.ports[decoded] = w8;

    this.updateSound();
  }

  interrupt(iff) {
    return void iff;
  }

  get_state() {
    const ports = [];

    for (let i = 0, L = this.ports.length; i < L; i++) {
      ports[i] = this.read_port(i);
    }

    return ports;
  }
}
