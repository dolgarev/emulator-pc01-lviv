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
