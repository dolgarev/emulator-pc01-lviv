import { Settings } from '../src/settings.js';
import { Config } from '../src/config.js';
import { Clock } from '../src/clock.js';
import { Beeper } from '../src/beeper.js';
import { Keyboard } from '../src/keyboard.js';
import { IO } from '../src/io.js';
import { Memory } from '../src/memory.js';
import { Traps } from '../src/traps.js';
import { I8080 } from '../src/i8080.js';
import { Storage } from '../src/storage.js';
import { Contention } from '../src/contention.js';
import { Screen } from '../src/screen.js';

/**
 * Builds a headless emulator core (no DOM / browser APIs) and returns the
 * wired components. Mirrors what ComputerProfileBuilder creates in the shell.
 */
/**
 * Builds a headless emulator core (no DOM / browser APIs) and returns the
 * wired components. Mirrors what ComputerProfileBuilder creates in the shell.
 *
 * The video/RAM contention (P2.11) is off by default here: the CPU tests assert exact
 * cycle counts, and the contention is a property of the machine rather than of the core.
 * Pass `{ wait_states: true }` to include it.
 */
export function createCore(profile = 'pc01_lvov_80', { wait_states = false } = {}) {
  const settings = new Settings('default');
  const config = new Config(settings, profile);
  const clock = new Clock();
  const contention = wait_states ? new Contention(clock) : null;
  const beeper = new Beeper(config, clock);
  const keyboard = new Keyboard();
  const io = new IO(config, beeper, keyboard, contention);
  const memory = new Memory(config, io, contention);
  const traps = new Traps();
  const cpu = new I8080(config, memory, io, traps, clock);
  contention?.attach(cpu);
  const storage = new Storage(cpu, memory, io);
  const screen = new Screen(config, io, memory);

  return { settings, config, clock, beeper, keyboard, io, memory, traps, cpu, storage, screen };
}

/** Writes a byte sequence into memory at the given origin. */
export function load(memory, bytes, origin = 0x0000) {
  bytes.forEach((byte, i) => memory.write(origin + i, byte));
}
