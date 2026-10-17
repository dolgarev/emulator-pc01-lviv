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

export class Contention {
  constructor(clock) {
    assertInstance(clock, Clock, 'CONTENTION: Invalid CLOCK object');
    this.clock = clock;
    this.step = 0;
    this.write_quarters = 0;
    this.pending = 0;
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

  io() {
    this.charge(IO_EXTRA);
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
