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
import { Screen } from '../src/screen.js';

/**
 * Builds a headless emulator core (no DOM / browser APIs) and returns the
 * wired components. Mirrors what ComputerProfileBuilder creates in the shell.
 */
export function createCore(profile = 'pc01_lvov_80') {
  const settings = new Settings('default');
  const config = new Config(settings, profile);
  const clock = new Clock();
  const beeper = new Beeper(config, clock);
  const keyboard = new Keyboard();
  const io = new IO(config, beeper, keyboard);
  const memory = new Memory(config, io);
  const traps = new Traps();
  const cpu = new I8080(config, memory, io, traps, clock);
  const storage = new Storage(cpu, memory, io);
  const screen = new Screen(config, io, memory);

  return { settings, config, clock, beeper, keyboard, io, memory, traps, cpu, storage, screen };
}

/** Writes a byte sequence into memory at the given origin. */
export function load(memory, bytes, origin = 0x0000) {
  bytes.forEach((byte, i) => memory.write(origin + i, byte));
}
