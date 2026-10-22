# Emulator PC-01 Lviv

An emulator of the Soviet-era Ukrainian home computer **PC-01 "Lviv"** (ПК-01 «Львов»),
written in JavaScript and HTML5.

> **This is the new version (2.0).**
> The original release was a Chrome Packaged App (Manifest V2), which modern browsers no
> longer support. Version 2.0 has been migrated to a single-page web application built with
> [Vite](https://vitejs.dev/) and runs in any modern browser (Chrome, Edge, Firefox, Safari).

## About the computer

The PC-01 "Lviv" was produced in Ukraine in the 1980s. It was the first Ukrainian home
computer — and, as the story goes, you did not need the KGB's permission to buy one.

📖 **Documentation for the computer: <https://github.com/codepainters/lvov>**

The project began in 2014 as the author's first step into the world of Open Source.

## Features

- Intel 8080 (КР580ВМ80А) CPU core
- Adjustable CPU speed: `cpu.speed_factor` in `src/settings.js` — `1.0` is the nominal 2.2 MHz
  clock, the default `0.6` matches the effective speed of the real machine (the video circuit
  took cycles on every RAM access, see [P2.11](CODE_REVIEW.md))
- Paged memory (maps: 80, 144, 256 KiB) with RAM / ROM / VRAM
- i8255A programmable peripheral interface (I/O ports, partial address decoding)
- Video output to `<canvas>` (256×256, color and grayscale modes, switchable palettes), plus the
  512×256 mode and the screen blanking of the PK-02 upgrade (see [P2.13](CODE_REVIEW.md))
- Sound via the Web Audio API: the beeper as a raw 1-bit square wave, with an optional model of the
  built-in ЗП-1 piezo emitter (`beeper.speaker_model` in `src/settings.js`, see
  [P3.11](CODE_REVIEW.md))
- Keyboard input, drag & drop, and file loading
- Snapshot save / load

## Getting started

Requires [Node.js](https://nodejs.org/) 22 or newer (vitest 5 no longer accepts 20).

```bash
npm install
npm run dev       # start the dev server at http://localhost:3000
```

Production build:

```bash
npm run build     # outputs a static site to dist/
npm run preview   # preview the production build locally
```

Other scripts:

| Script | Description |
| --- | --- |
| `npm run lint` | Lint the sources with ESLint |
| `npm run format` | Format the sources with Prettier |
| `npm test` | Run the unit tests (Vitest, headless) |

## Controls

Keyboard shortcuts (the same list is available in the in-app **HELP** dialog):

| Shortcut | Action |
| --- | --- |
| `Ctrl` + `P` | Pause |
| `Ctrl` + `R` | Reset |
| `Ctrl` + `G` | Turn grayscale mode on / off |
| `Ctrl` + `S` | Take a screenshot |
| `Ctrl` + `+` | Increment palette |
| `Ctrl` + `-` | Decrement palette |

The PC-01 keyboard has several keys that a modern keyboard does not. They are mapped to `Alt`
combinations:

| Modern keyboard | PC-01 key |
| --- | --- |
| `Alt` + `0` | `<F0>` |
| `Alt` + `1` … `Alt` + `5` | `<F1>` … `<F5>` |
| `Alt` + `6` | `<ДИН>` |
| `Alt` + `7` | `<CD>` |
| `Alt` + `8` | `<ПЧ>` |
| `Alt` + `9` | `<П/Д>` |
| `Alt` + `-` | `_` |
| `Alt` + `+` | `<ГТ>` |
| `Alt` + `C` | `<СТР>` |
| `Alt` + `G` | `<G>` |
| `Alt` + `B` | `<B>` |
| `Alt` + `R` | `<R>` |
| `Alt` + `L` | `<ЛАТ>` |
| `Alt` + `U` | `<РУС>` |
| `Alt` + `H` | `<ДИА>` |
| `Alt` + `Shift` | `<ВР>` |
| `Alt` + `Enter` | `<ПС>` |
| `Esc` | `<СУ>` |

## Loading programs

Use the **LOAD** button or drag & drop a file onto the window.

Supported file extensions:

- `.lvt`, `.lvr`, `.lv0` … `.lv99` — tape / snapshot files
- `.sav` — snapshots
- `.e3` — Emulator 3000 snapshots

Bundled software:

- **Aerocobra** — courtesy of Andrey Chistyakov
- **Moon Tracker**

## Machines

The **Machine** selector chooses the computer to emulate:

- **PC-01 Lviv** (`standard`) — the serial machine, the default.
- **PC-01 Lviv fixed** (`standard_fixed`) — the same machine with RAM bank 0 reachable; the only
  difference from `standard`.
- **PC-01 with upgrades** (`standard_extended`) — the serial machine with the PK-02 add-on board,
  whose latch on port `0xF0` carries the 512×256 video mode, the screen blanking and the extended
  RAM banks (see [P2.13](CODE_REVIEW.md) and [P2.14](CODE_REVIEW.md)).

Switching rebuilds the emulator from scratch and boots the chosen model into its ROM: the attached
dump is not replayed, because a dump names the machine it was taken from. The bundled dumps were
saved on the serial machine.

## Video frame

The emulated video frame is **20 ms (50 Hz)** by default — the approximation the emulator used
before [P2.20](CODE_REVIEW.md), in which the machine runs 2.4 % fast and its tones are 1.8 %
sharp. `cpu.frame` in `src/settings.js` also takes `'48.83hz'`, the **20.48 ms** frame the video
circuit makes: 409600 ticks of the 20 MHz oscillator, 45056 CPU cycles at the documented 2.2 MHz.
The faithful frame is not the default because it slows the timing of every program by 2.4 %, drops
its pitch by 1.8 % and makes some of them click audibly ([P2.20](CODE_REVIEW.md) records the open
question). Neither frame is exposed in the interface.

Because the length of the frame belongs to the running profile rather than to the machine, it can
be switched while the emulator runs (`Config.set_frame()`), so the two can be compared by ear
without a restart.

## Project structure

```
src/
  main.js                     entry point
  core.js                     headless public API (createCore, boot, load)
  emulator.js                 top-level wiring
  computer.js                 machine lifecycle
  computerProfile.js          main loop, snapshots, UI coordination
  computerProfileBuilder.js   dependency-injection builder
  clock.js                    shared CPU cycle counter
  i8080.js                    Intel 8080 CPU core
  memory.js, io.js            memory paging and I/O ports
  rom.js, dump.js,            ROM images, bundled dumps,
  storage.js, traps.js        snapshots and BLOAD/CLOAD hooks
  screen.js, viewport.js      video output
  beeper.js, keyboard.js      sound and input
  tape.js, dnd.js             file loading
  config.js, settings.js      configuration
public/data/                  ROM and dump binaries (.bin)
```

## Automation and AI tools (headless core + MCP)

The emulator core is DOM-free and can run headlessly in Node, which is how the bundled
scripts and external dev tooling drive it. The public entry point is
[`src/core.js`](src/core.js):

```js
import { createCore } from './src/core.js';

// the hardware-faithful machine: video/RAM contention (P2.11) + the 48.83 Hz frame (P2.20)
const core = createCore('standard', { wait_states: true, frame: '48.83hz' });
core.storage.set_snapshot(new DataView(snapshotBytes));
core.io.keyboard.press('Enter', true);
core.cpu.run(2_500_000);
const value = core.memory.read(0xaf10);
```

`createCore(profile, { wait_states, frame })` builds the same machine the browser shell
wires, minus the DOM/audio/tape layers. The two knobs are independent and both default to
the test-friendly approximation: `wait_states: false` (no contention) and `frame: '50hz'`
(20 ms). Set `wait_states: true` for the video/RAM contention (P2.11) and
`frame: '48.83hz'` for the frame the video circuit actually produces (P2.20); together they
give the hardware-faithful machine. The returned components (`cpu`, `memory`, `io`,
`keyboard`, `screen`, ...) are documented in the file.

For AI tools there is an MCP server ([`scripts/mcp-server.mjs`](scripts/mcp-server.mjs),
`npm run mcp`) that speaks the Model Context Protocol over stdio and exposes the core as
tools — `load_snapshot`, `run_cycles`, `read_memory`, `write_memory`, `read_port`,
`write_port`, `key_press`, `key_tap`, `screenshot`, `dump_state`, `reset`. Register it in
any MCP client with `command: node`, `args: ["<repo>/scripts/mcp-server.mjs"]`. See
[`scripts/README.md`](scripts/README.md) for the full list and environment options.

## Documentation and development notes

- PC-01 Lviv documentation (computer itself): <https://github.com/codepainters/lvov>
- [`CODE_REVIEW.md`](CODE_REVIEW.md) — project review, roadmap and improvement backlog

## Credits

- Emulator author: Oleg Dolgarev
- i8080 core based on [Alexander Demin's i8080-js](https://github.com/begoon/i8080-js) Intel 8080
  model. Thanks to Viacheslav Slavinsky, Dmitry Tselikov, Ian Bartholomew, and Frank Cringle.
- "Aerocobra" game — Andrey Chistyakov.
- Drag & drop handling inspired by Eric Bidelman's HTML5Rocks article *Reading files in JavaScript using the File APIs*.

### Third-party assets

- `public/assets/fontello/` — icon font generated with [Fontello](https://fontello.com) from Font Awesome
  (Copyright (C) 2012 Dave Gandy, SIL OFL 1.1) and other icon sets; the full list is in
  [`public/assets/fontello/LICENSE.txt`](public/assets/fontello/LICENSE.txt).

## License

Copyright (C) 2014 Oleg Dolgarev <o.dolgarev@gmail.com>

GNU General Public License v3.0 **or later** (`GPL-3.0-or-later`) — see [`LICENSE`](LICENSE).
This program is distributed in the hope that it will be useful, but **without any warranty**; without
even the implied warranty of merchantability or fitness for a particular purpose. See the GNU General
Public License for more details.

`src/i8080.js` is a modified port of Alexander Demin's i8080-js (see Credits) and keeps its own
copyright notice; the changes to it are tracked in the repository history.

## Links

- Repository: <https://github.com/dolgarev/emulator-pc01-lviv>
- Issues: <https://github.com/dolgarev/emulator-pc01-lviv/issues>
- PC-01 Lviv documentation: <https://github.com/codepainters/lvov>
- Legacy Chrome Web Store release (obsolete): <http://goo.gl/iqoj80>
