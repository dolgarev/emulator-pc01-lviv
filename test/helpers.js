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
 *
 * The video/RAM contention (P2.11) is off by default here: the CPU tests assert exact
 * cycle counts, and the contention is a property of the machine rather than of the core.
 * Pass `{ wait_states: true }` to include it.
 *
 * The returned core has completed its power-on reset, so the ROM sits in the top bank
 * (P2.17). `io.restart()` puts it back into the reset state, where the ROM answers for
 * every address until the first I/O write.
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

  boot(io);

  return {
    settings,
    config,
    clock,
    contention,
    beeper,
    keyboard,
    io,
    memory,
    traps,
    cpu,
    storage,
    screen,
  };
}

/**
 * Puts the core into the state the ROM reaches with its very first instruction, a dummy
 * `OUT 00H`: the initial-reset flip-flop is cleared and the ROM stays in the top bank only
 * (P2.17). Until that write the ROM answers for every address, so a test that places code
 * in RAM has to boot the core first.
 *
 * The flag is cleared directly instead of through `io.output()` so that the harness does
 * not charge an I/O wait cycle to the machines whose timing is under test.
 */
export function boot(io) {
  io.initial_rom_mapping = false;
}

/** Writes a byte sequence into memory at the given origin. */
export function load(memory, bytes, origin = 0x0000) {
  bytes.forEach((byte, i) => memory.write(origin + i, byte));
}
