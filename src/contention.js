import { Clock } from './clock.js';
import { assertInstance } from './utils/assert.js';

/**
 * Video/RAM contention of the PC-01: the video circuit takes cycles from the CPU on every
 * access to RAM (the video RAM included), while the ROM is not contended. That is why the
 * machine is effectively slower than the nominal clock - but only for code that lives in
 * RAM. A routine that runs from ROM and touches nothing but registers and I/O ports, like
 * the BEEP routine at 0xDE94, keeps the full nominal speed; its tone therefore sounds at
 * the pitch the ROM generates, no matter how much the RAM code around it is slowed.
 *
 * The numbers come from the documented behaviour: a repeating 7-step pattern of
 * 2, 2, 2, 3, 2, 2, 3 cycles per RAM access (2 2/7 on average), an extra 3/4 of a cycle for
 * a write and one for an I/O access. See CODE_REVIEW.md, P2.11 and P2.18.
 *
 * The arbiter has one failure mode that is not a number: an I/O cycle to a port below 0xC0.
 * The 8080 duplicates the port address onto the upper half of the address bus, so the
 * ~ROM_OE decode sees something that is not a ROM access, the arbiter samples a low ROM_OE
 * and waits for a VIDEO_CPU pulse - and the RAM controller issues that pulse only for a CPU
 * RAM cycle. An I/O cycle is not one, so READY stays low and the CPU stops until RESET. See
 * CODE_REVIEW.md, P2.19.
 *
 * The cycles are charged twice, and that is deliberate: they advance the shared Clock (so
 * the beeper sees the real timeline and a frame still holds 44800 ticks) and they are
 * added to the cycle count of the instruction that caused them (so the frame budget buys
 * less work). The second half lives in attach(), because the frame loop of the CPU core
 * counts only what its instructions report - the core itself is an upstream port and stays
 * untouched.
 */
const READ_PATTERN = [2, 2, 2, 3, 2, 2, 3];
// A RAM write costs 3/4 of a cycle on top of the pattern (P2.18). Fractional cycles would
// spread through the whole timing model, so three writes in four pay one extra whole cycle
// and the fourth pays none: the average is exact and no write is off by more than 1/4 cycle.
const WRITE_EXTRA = 3;
const WRITE_EXTRA_PERIOD = 4;
const IO_EXTRA = 1;
// Only the ports 0xC0..0xFF put A15 = A14 = 1 on the address bus during an I/O cycle, and
// those two bits are all the ~ROM_OE decode looks at (P2.19).
const ROM_PORT_MASK = 0xc0;
// A stalled CPU hands out this many cycles per call: the frame keeps its budget and the
// shared clock keeps the beeper's timeline, while the CPU itself executes nothing (P2.19).
const STALLED_CYCLES = 4;

export class Contention {
  constructor(clock) {
    assertInstance(clock, Clock, 'CONTENTION: Invalid CLOCK object');
    this.clock = clock;
    this.restart();
  }

  /**
   * Puts the arbiter back into its power-on state: the pattern starts over and a CPU that an
   * I/O cycle below 0xC0 has deadlocked runs again (P2.19). A RESET pulse releases the
   * flip-flop with the VIDEO_CPU pulse that D47C guarantees.
   */
  restart() {
    this.step = 0;
    this.write_quarters = 0;
    this.pending = 0;
    this.is_stalled = false;
  }

  read() {
    this.charge(READ_PATTERN[this.step++ % READ_PATTERN.length]);
  }

  write() {
    this.charge(READ_PATTERN[this.step++ % READ_PATTERN.length] + this.writeExtra());
  }

  /**
   * The extra cycles of one RAM write. The machine charges 3/4 of a cycle per write; the
   * model has no fractional cycles, so the quarters are accumulated and paid out as whole
   * cycles - the sequence of extras is 0, 1, 1, 1, 0, 1, 1, 1 ... (P2.18).
   *
   * @returns {number} The whole cycles to charge for this write, 0 or 1.
   */
  writeExtra() {
    this.write_quarters += WRITE_EXTRA;
    const cycles = Math.floor(this.write_quarters / WRITE_EXTRA_PERIOD);
    this.write_quarters -= cycles * WRITE_EXTRA_PERIOD;

    return cycles;
  }

  /**
   * An I/O cycle: one extra cycle for the port itself (P2.11), and the arbiter's only way
   * to hang the machine (P2.19). A port outside 0xC0..0xFF leaves READY low with no
   * VIDEO_CPU pulse to release it, so the CPU stops until RESET.
   *
   * @param {number} port - The address the CPU put on the bus.
   * @param {boolean} initial_rom_mapping - The state of the RESET flip-flop of P2.17 at the
   *   start of the cycle. While it is set, ~ROM_OE is held low and every address and port
   *   looks like a ROM access, which is what lets the ROM start with a dummy `OUT 00H`.
   */
  io(port, initial_rom_mapping = false) {
    this.charge(IO_EXTRA);

    if (initial_rom_mapping) return;
    if ((port & ROM_PORT_MASK) === ROM_PORT_MASK) return;

    this.is_stalled = true;
  }

  charge(cycles) {
    this.pending += cycles;
    this.clock.addCycles(cycles);
  }

  /**
   * Makes the CPU's frame budget pay for the wait cycles as well.
   *
   * @param {object} cpu - The I8080 instance.
   */
  attach(cpu) {
    // Never wrap the same CPU twice: the counts would be charged twice.
    if (cpu.contention_attached) return;
    cpu.contention_attached = true;

    const instruction = cpu.instruction.bind(cpu);

    cpu.instruction = () => {
      // READY is held low and no VIDEO_CPU pulse will ever come (P2.19): the CPU executes
      // nothing at all. The frame still gets its cycles, so the video and the beeper keep
      // their real timeline while the machine sits there until RESET. They are not charged:
      // pending belongs to an instruction, and there is none to attribute them to.
      if (this.is_stalled) {
        this.clock.addCycles(STALLED_CYCLES);

        return STALLED_CYCLES;
      }

      this.pending = 0;
      const cycles = instruction();

      return cycles + this.take();
    };
  }

  take() {
    const cycles = this.pending;
    this.pending = 0;
    return cycles;
  }
}
