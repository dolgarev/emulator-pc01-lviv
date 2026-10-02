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
- Video output to `<canvas>` (256×256, color and grayscale modes, switchable palettes)
- Sound via the Web Audio API (beeper)
- Keyboard input, drag & drop, and file loading
- Snapshot save / load

## Getting started

Requires [Node.js](https://nodejs.org/) 20 or newer.

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

## Project structure

```
src/
  main.js                     entry point
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
- `public/assets/960gs/` — 960 Grid System (dual-licensed); this project uses the MIT option, see
  [`public/assets/960gs/MIT_license.txt`](public/assets/960gs/MIT_license.txt).

## License

Copyright (C) 2014 Oleg Dolgarev <o.dolgarev@gmail.com>

GNU General Public License v3.0 **or later** (`GPL-3.0-or-later`) — see [`gpl-3.0.txt`](gpl-3.0.txt).
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
