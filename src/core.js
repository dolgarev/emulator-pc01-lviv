// Public headless API (P3.17): the emulator core without any DOM or browser dependency.
//
// `createCore` builds the same machine `ComputerProfileBuilder.buildStandard()` wires in the
// browser shell, minus the DOM / audio-sink / tape / dump layers, and returns the wired
// components as a plain object. The core is the stable contract for scripts and dev tools
// (the MCP server in `scripts/mcp-server.mjs`, the game patcher, `melody-audio.mjs`): load a
// snapshot, run N cycles, read/write memory and ports, press keys, draw a frame.
//
//   import { createCore } from './src/core.js';
//   const core = createCore('pc01_lvov_80', { wait_states: true, frame: '48.83hz' });
//   core.storage.set_snapshot(new DataView(snapshotBytes));
//   core.io.keyboard.press('Enter', true);
//   core.cpu.run(2_500_000);
//
// Timing: `wait_states` is off and the frame is `50hz` by default, so CPU tests and logic
// checks see exact, contention-free cycle counts. The two knobs are independent: set
// `wait_states: true` for the video/RAM contention (P2.11) and `frame: '48.83hz'` for the
// frame the video circuit actually produces (P2.20). Together they give the
// hardware-faithful machine, e.g. `{ wait_states: true, frame: '48.83hz' }`.

import { Settings } from './settings.js';
import { Config } from './config.js';
import { Clock } from './clock.js';
import { Beeper } from './beeper.js';
import { Keyboard } from './keyboard.js';
import { IO } from './io.js';
import { Memory } from './memory.js';
import { Traps } from './traps.js';
import { I8080 } from './i8080.js';
import { Storage } from './storage.js';
import { Contention } from './contention.js';
import { Screen } from './screen.js';

/**
 * Builds a headless emulator core and returns the wired components.
 *
 * @param {string} profile - `Config` profile name (default `pc01_lvov_80`).
 * @param {{ wait_states?: boolean, frame?: '50hz'|'48.83hz' }} options
 *   Timing knobs, independent of each other. `wait_states` switches on the video/RAM
 *   contention (P2.11); `frame` names the video frame in `Config`'s `FRAMES` table —
 *   `'50hz'` (20 ms, the default approximation) or `'48.83hz'` (20.48 ms, the frame the
 *   video circuit makes, P2.20).
 * @returns {{ settings: object, config: object, clock: object, contention: object|null,
 *   beeper: object, keyboard: object, io: object, memory: object, traps: object,
 *   cpu: object, storage: object, screen: object }}
 */
export function createCore(profile = 'pc01_lvov_80', { wait_states = false, frame = '50hz' } = {}) {
  const settings = new Settings('default');
  const config = new Config(settings, profile);
  config.set_frame(frame);

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
