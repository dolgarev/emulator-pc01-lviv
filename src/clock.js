/**
 * Shared CPU cycle counter.
 *
 * Tracks the total number of executed CPU cycles and the cycle count at the
 * start of the current frame. It is injected into both the CPU (which advances
 * it) and the Beeper (which reads the elapsed frame offset), replacing the
 * former hidden coupling through the static `I8080.total_cpu_cycles` /
 * `I8080.start_frame` fields.
 */
export class Clock {
  constructor() {
    this.totalCycles = 0;
    this.frameStart = 0;
  }

  restart() {
    this.totalCycles = 0;
    this.frameStart = 0;
  }

  startFrame() {
    this.frameStart = this.totalCycles;
  }

  addCycles(cycles) {
    this.totalCycles += cycles;
  }

  get frameOffset() {
    return this.totalCycles - this.frameStart;
  }
}
