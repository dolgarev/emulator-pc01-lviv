# Emulator PC-01 Lviv — Review, Roadmap and Backlog

> Date: 2026-09-26
> Last updated: 2026-10-02
> Branch: `dev-spa-version`
> Scope: all modules in `src/`, `index.html`, project documentation
> This document consolidates the former `CODE_REVIEW.md`, `IMPROVEMENTS.md` and
> `MIGRATION_PLAN.md` into a single reference.

## Overview

The project is an emulator of the Soviet-era Ukrainian home computer **PC-01 "Lviv"** (1980s),
originally implemented as a Chrome Packaged App (manifest v2) in plain JavaScript and HTML5. The
emulator core is an Intel 8080 (КР580ВМ80А) CPU, paged memory, I/O ports (i8255A), video output to
`<canvas>`, sound via the Web Audio API, and a keyboard.

**Problem:** Chrome Packaged Apps (manifest v2) were **fully removed from Chrome in 2024**, so the
emulator cannot run in modern Chromium/Chrome builds. Migration to a web application is required.

**Chosen strategy — staged migration:** SPA → PWA → Quality. SPA and PWA are not mutually
exclusive: PWA = SPA + Service Worker + Web App Manifest.

**Code quality summary:** the project has already undergone a significant modernization pass — ES
modules, classes, dependency injection via `ComputerProfileBuilder`, binary data extracted into
`.bin` files, and a clean component split (Memory / IO / CPU / Screen / Viewport / Beeper /
Keyboard / Tape / DnD / Storage / Traps). The overall architecture is sound. A code review
subsequently found and fixed a few **real bugs and hidden couplings** (see "Completed" below);
underneath the new code some legacy remains.

---

## Context: the computer and the migration problem

Migration option comparison:

### Option A: SPA (Single Page Application on Vite)

| | |
|---|---|
| ✅ **Maximum simplicity** | Wrapping the code in a Vite project is enough |
| ✅ **Fast start** | Can begin without rewriting to modules |
| ✅ **HMR** | Hot Module Replacement for development |
| ✅ **Predictability** | No Service Worker caching pitfalls |
| ❌ **No offline** | Internet required every time |
| ❌ **No install** | Cannot add a desktop icon |
| ❌ **2+ MB over the network** | Dumps downloaded on every visit |

### Option B: PWA (Progressive Web App)

| | |
|---|---|
| ✅ **Offline support** | Service Worker caches all resources — critical for an emulator |
| ✅ **Install** | Icon + window without an address bar — closest to a Chrome App |
| ✅ **Zero entry barrier** | Just open a URL |
| ✅ **Cross-platform** | Desktop, mobile, tablet |
| ✅ **File System Access API** | Modern equivalent of `chrome.fileSystem` (Chromium) |
| ❌ **Safari/Firefox limits** | No File System Access API, a fallback is needed |
| ❌ **Hotkeys** | Ctrl+P / Ctrl+S are intercepted by the browser |
| ❌ **Complexity** | Service Worker + manifest + caching strategies |

---

## Current state

**Phase 1 (SPA) — ✅ DONE:**
- ✅ Migrated to Vite + ES modules
- ✅ Binary data extracted into `.bin` files
- ✅ Runs in any modern browser
- ✅ Critical security and compatibility bugs fixed

**Phase 2 (PWA) — ⏳ PENDING:**
- ⏳ Service Worker for offline work
- ⏳ Web App Manifest for installation
- ⏳ Resource caching

**Phase 3 (Code quality) — ⏳ IN PROGRESS:**
- ✅ Rendering architecture refactored (Screen ↔ Viewport)
- ✅ Known bugs closed
- ✅ Game loop rebuilt: a single `requestAnimationFrame` with a fixed timestep, at the real PC-01
  clock speed
- ✅ DOM-free core + headless test suite (Vitest, 90 tests in 13 files)
- ⏳ `ARCHITECTURE.md` and JSDoc types (P3.4)
- ⏳ Web Worker for the CPU (P2.5), `.editorconfig` + CI (P2.10)

**Next steps:**
1. Start Phase 2: add PWA support (P3.6) — the last migration phase
2. Phase 3 leftovers: `ARCHITECTURE.md` (P3.4), tests for `io.js`, CI (P2.10)
3. Opportunistically: `i8080.js` modernization (P1.2), Web Worker (P2.5), rendering (P3.7 / P3.8)

---

## Roadmap

### Phase 1: Migrate to SPA (Vite) — ✅ done

> Goal — run the emulator in any modern browser without changing the emulation logic.

**What was done:**
- Initialized a Vite project; the entry point is `index.html` (formerly `window.html`); sources moved
  to `src/`.
- Ported the code to ES modules (`import`/`export`); the rigid `<script>` ordering in HTML is gone.
- Extracted binary data from JS into `public/data/*.bin` (+ `dumps-manifest.json`); ROM and dumps
  load via `fetch()`. Initialization became asynchronous:
  `main.js` → `Emulator` → `Computer` → `Profile` → `Rom`.
- Removed Chrome App dependencies: `background.js`, `manifest.json`; rewrote `tape.js` onto
  `<input type="file">` + File API and `URL.createObjectURL()` + `<a download>`.

**Current configuration:**

```js
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 3000,
  },
});
```

```json
// package.json (scripts)
"dev": "vite",
"build": "vite build",
"preview": "vite preview",
"lint": "eslint src test",
"format": "prettier --write \"{src,test}/**/*.js\"",
"test": "vitest run",
"test:watch": "vitest"
```

Data layout:

```
public/data/
├── rom-1990.bin
├── dump-bload.bin
├── dump-cload.bin
├── dump-aerco1.bin
├── dump-mtrack.bin
└── dumps-manifest.json
```

### Phase 2: Add PWA — ⏳ pending

> Performed after Phase 1 is complete and stable.

**2.1. Install `vite-plugin-pwa`:**

```bash
npm install -D vite-plugin-pwa
```

**2.2. Configure `vite.config.js`:**

```js
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['data/**/*.bin', 'images/*.png'],
      manifest: {
        name: 'Emulator PC-01 Lviv',
        short_name: 'ПК-01 Львов',
        description: 'Emulator of the Soviet computer PC-01 Lviv',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        icons: [
          { src: '/images/lviv-128.png', sizes: '128x128', type: 'image/png' },
          { src: '/images/lviv-16.png', sizes: '16x16', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,bin,png,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/data\/.*\.bin$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'emulator-data',
              expiration: { maxEntries: 50, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
});
```

**2.3. Add icons** of 192×192 and 512×512 (required for PWA).

**2.4. Verify:**
- [ ] Lighthouse audit → PWA score ≥ 90
- [ ] Installation via the browser works
- [ ] Offline mode: disable the network → the emulator works
- [ ] Service Worker update: change the code → the update applies

### Phase 3: Code quality — ⏳ in progress

> Performed after the PWA is stable. Status per task; details and rationale are in "Review findings
> and improvement backlog" below.

**3.1. Critical bugs — ✅ closed**
- ✅ `screen.js` — global `result` localized (`let`)
- ✅ `notify.js` — `innerHTML` → `textContent`
- ✅ `memory.js:263` — memory bank decoding fixed (`io.ports[io.EXTENDED_MODE_PORT]`)
- ✅ `screen.js` grayscale — not a bug but an emulation feature (kept as is)

**3.2. Infrastructure**
- ✅ strict mode (provided by ES modules)
- ✅ ESLint + Prettier (+ husky/lint-staged)
- ⏳ `.editorconfig`
- ⏳ GitHub Actions for linting

**3.3. Code modernization**
- ✅ ES modules
- ⏳ ES6+ classes — 18/19, `i8080.js` remains (P1.2)
- ✅ `evt.which` → `evt.keyCode` → `evt.code` (P3.1)
- ✅ `webkitImageSmoothingEnabled` → `imageSmoothingEnabled`
- ✅ Typos (`standart`, `Unknownn`)

**3.4. Tests — ✅ done, still growing**
- ✅ Unit tests for I8080, Memory, Storage, Screen, Keyboard, Clock, Config
- ✅ Integration test: emulated frame timing and the real PC-01 clock speed
- ✅ Snapshot round-trip (`get_snapshot()` ↔ `set_snapshot()`) and `.e3` load
- ⏳ `io.js` has no test of its own; the 8080 Exerciser ROM remains a possible CPU oracle

---

## Review findings and improvement backlog

Priority legend: **P0** critical, **P1** high maintainability impact, **P2** structural,
**P3** polish / features. Status: ✅ done, ⏳ pending. Completed items have been moved to the
[Completed](#completed) section at the end of this document.

### P1 — Highest maintainability impact

#### P1.2 `i8080.js` is an ES3-style monolith (1174 lines) — ⏳

The only file still written as `function I8080` + `prototype`. It mixes responsibilities: register
accessors (dozens of `get_b`/`set_b`/`get_af`/…), flag handling, lookup tables (`parity_table`,
`half_carry_table`), opcode fetch, and a ~900-line `switch` in `execute()`. Related legacy style:
`store_flags()` has redundant `else` branches (reviewed in P3.2); `var` declarations were re-scoped
to `let`/`const` with `{}` blocks inside `case`.

**Suggested fix (incremental, without losing speed):**
1. Convert to `class I8080`; move lookup tables to `static` fields or a separate module.
2. Extract flag operations into a `Flags` helper.
3. Extract the opcode dispatcher into a separate `opcodes.js` module (or table-driven form) so the
   core becomes testable per-opcode.

### P2 — Structural improvements

#### P2.5 Web Worker for CPU emulation — ⏳

Move `I8080.run()` into a Web Worker so heavy computation does not block the main thread, improving
UI responsiveness. Now unblocked: the core is DOM-free (P2.6) and can be instantiated inside a worker
as is. The remaining work is the message protocol (start/pause/reset, key state, snapshot, frame
buffer, PCM) and moving `Clock` and the `Screen` pixel buffer across the worker boundary.

#### P2.10 `.editorconfig` and CI — ⏳

Add `.editorconfig` and a GitHub Actions workflow for linting.

#### P2.11 Wait states: the video/RAM contention is not modelled — ⏳

The emulator runs the CPU at its **nominal** clock, while the real PC-01 was effectively slower: the
video circuit took cycles from the CPU on every RAM access (RAM regeneration / video fetch). Three
independent sources agree on the size of the effect:

- `vpyk/emu80v4` (Emu80 v4, GPL-3, `dist/lvov/lvov.conf` and `src/Lvov.cpp`) drives the Lviv at
  **2 222 222 Hz** and models **wait states** on top of it: ≈2 2/7 cycles per RAM access (a repeating
  7-step pattern of 2, 2, 2, 3, 2, 2, 3), +0.75 on average for writes, and +1 cycle for the `IN`/`OUT`
  opcodes. All four RAM pages (including the video RAM) carry the contended tag, the ROM does not, so
  code executing from ROM (monitor, BASIC) keeps full speed. For a typical instruction mix this works
  out to roughly **0.6×** of the nominal clock.
- The pre-P2.1 loop produced ≈32 ms per frame (timer + `requestAnimationFrame` + nested-timer clamp)
  — accidentally ≈0.6× as well, which is the speed the emulator was "known" to run at.
- The documentation quotes 2.22 MHz nominal but only "200…300 thousand ops/s", against "2.5 MHz /
  500…625 thousand ops/s" in other descriptions (≈0.5×).

Since `c6c8a72` the loop is honest (44800 cycles × 50 Hz = 2.24 MHz), which is why the emulator now
feels faster than the hardware. The interim fix is `cpu.speed_factor` (P2.12, default `0.6`) — a
uniform approximation that also slows ROM code. The faithful model is per-access wait states:

1. Budget the frame in *hardware* cycles (44 444 per 20 ms frame at 2.22 MHz) and let the wait cycles
   consume that budget, so the frame rate stays 50 Hz while the CPU completes fewer instructions.
2. Count the waits on contended accesses in the injected `Memory`/`IO` and advance the injected
   `Clock` with them (the beeper already derives its sound from the clock, so the pitch follows).
3. `I8080.run()` counts nominal cycles itself and calls `Clock.startFrame()` on every call, so a
   sliced `run()` would break the beeper's frame offsets — needs either the core refactor (P1.2) or a
   feedback loop that sizes the next frame from the waits measured during the previous one.
4. First step: **measure** instead of estimating — wrap `Memory.read`/`write` with counters, run real
   games and BASIC in a headless browser and get the actual accesses/waits per frame.

### P3 — Polish, features and rendering ideas

#### P3.4 Typing and documentation — ⏳

Add JSDoc/TypeScript types at least for public interfaces (`Settings`, `Memory`, `I8080`). The
README was rewritten for v2.0 (installation, controls, file formats, architecture, credits, license);
an `ARCHITECTURE.md` is still missing. Adding screenshots to the README is also pending.

#### P3.6 PWA support — ⏳

Add a Service Worker and Web App Manifest for offline use (this is Phase 2 of the Roadmap).

#### P3.7 Dirty rectangle tracking — ⏳

Currently all 65,536 pixels (256×256) are redrawn every frame even if only one pixel changed. Track
the minimal bounding rectangle of changed pixels and update only that region via
`putImageData(image_data, dirtyX, dirtyY, dirtyX, dirtyY, dirtyWidth, dirtyHeight)`.

Notes for PC-01: resolution 256×256; video memory stores 4 pixels per byte → 64 bytes per row; the
coordinate system is non-standard and needs careful handling. **Gain:** largest for text editors,
menus and static screens.

#### P3.8 Rendering improvement ideas (candidate list, not a single task)

1. **Dirty rectangle tracking** — see P3.7.
2. **WebGL rendering** — upload `ImageData` to a WebGL texture, render via a palette shader, add
   CRT/scanline filters. Gain: 10–100× performance and retro effects.
3. **Dynamic aspect ratio** — UI selector for 1:1, 4:3 (CRT), 16:9, and auto-fit, via
   `Viewport.setAspectRatio(value)`.
4. **Scaling interpolation** — choose nearest-neighbor (pixel art), bilinear (smoothed) or a CRT
   filter via CSS `image-rendering` or WebGL shaders.
5. **HiDPI/Retina support** — scale the canvas by `window.devicePixelRatio`.
6. **Color corrections and filters** — brightness/contrast, color temperature, CRT effect
   (scanlines, bloom), monochrome monitor mode.
7. **Adaptive scaling to window size** — pick the largest integer scale that fits the container.
8. **Fullscreen mode** — Fullscreen API with a toggle button, automatic scaling, ESC to exit.
9. **Screenshots with metadata** — date/time, loaded program name, current settings; PNG/JPEG/WebP.
10. **Animations and transitions** — smooth palette/color-mode changes and loading effects.
11. **Render statistics** — FPS counter, frame render time, dirty-pixel percentage, cache usage.
12. **Multi-threaded rendering** — OffscreenCanvas + Worker, transferring `ImageData` as a
    transferable object.

Priority within this list: **P1** dirty rectangle tracking, dynamic aspect ratio; **P2** HiDPI,
adaptive scaling, fullscreen; **P3** WebGL, color filters, animations, statistics.

#### P3.9 Feature backlog (candidate list, not a single task)

- **Gamepad support** (Gamepad API) for joysticks.
- **Fullscreen mode** (see P3.8.8).
- **State persistence in localStorage / IndexedDB** — autosave and manual snapshots without the old
  Chrome file system.
- **Responsive design** for different screen sizes, including mobile.
- **Improved audio subsystem** — AudioWorklet instead of `ScriptProcessorNode`/`createBufferSource`;
  volume control; mute. The 1-bit output is still not band-limited when it is generated, so very fast
  toggles alias into the audible band: the piezo model of P3.11 makes that less audible, but it cannot
  undo aliasing that has already happened at the sample rate.
- **Loading ROM/dumps from the network** (by URL), not only local files.
- **Snapshot round-trip** — already covered by the tests in P1.1.

---

## Key risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Async ROM/Dump loading breaks initialization order | High | Careful `async/await` chain design; show a loading screen |
| AudioContext requires a user gesture | Medium | Add a splash screen with a "Start" button, or activate on first click |
| `chrome.fileSystem` → File API: loss of write capability | Medium | Use `<a download>` + Blob URL for saving |
| Hotkeys intercepted by the browser (Ctrl+P, Ctrl+S) | Low | Use `evt.preventDefault()` — already done in `keyboard.js` |
| Large dump size (~2 MB) on first load | Medium (until PWA) | gzip compression on the server; lazy-load dumps on demand |

---

## Recommended next steps

1. **Add PWA support** (Phase 2 / P3.6) — the last migration phase: Service Worker, Web App
   Manifest, caching of `data/*.bin`.
2. **Extend the test suite** — an `io.js` test, the 8080 Exerciser ROM as a CPU oracle, snapshot
   fixtures.
3. **Write `ARCHITECTURE.md`** (P3.4) — the module split (DOM-free core vs. browser shell) is now
   stable enough to document.
4. Work on the structural leftovers when the code is touched anyway: `i8080.js` modernization (P1.2),
   Web Worker (P2.5), `.editorconfig` + CI (P2.10), wait states (P2.11), rendering (P3.7 / P3.8).

Only **P1.2, P2.5, P2.10, P2.11, P3.4, P3.6 and P3.7** are open tasks. Everything else in the backlog is
either done (see [Completed](#completed)) or a candidate list (P3.8, P3.9).

---

## Completed

Items below are done; they are kept for reference.

### P0 — Critical bugs and hidden coupling

#### P0.1 Event-listener leaks in `computerProfile.js` and `keyboard.js` — ✅ fixed

`initAsync()` registered a `document`-level listener (`ui:click:load_button`) with an anonymous
arrow function and never removed it. `terminate()` tried to clean up via
`this.local_load_button_handler`, but that field was **never assigned** (dead code), so every
`restart()` (dump/profile switch) leaked listeners and caused duplicate firings. `keyboard.js` had
the same leak: `keydown`/`keyup` listeners on `document` were never removed.

**Fix:** both classes now group their listeners with an `AbortController` and remove them in
`terminate()` via `abort()`; the dead branch was deleted and `ComputerProfile.terminate()` calls
`keyboard.terminate()`.

#### P0.2 Static `I8080` cycle counters couple CPU ↔ Beeper — ✅ fixed

`I8080.total_cpu_cycles` and `I8080.start_frame` were mutable static class fields; `Beeper.process()`
read them directly, creating an implicit cross-module dependency through shared mutable class state
(untestable in isolation, and it made Beeper depend on the CPU's internal cycle accounting).

**Fix:** a shared `Clock` (`src/clock.js`) is injected into both `I8080` and `Beeper`; the static
fields were removed and the circular `i8080 → io → beeper → i8080` import was broken.

#### P0.3 Global variable `result` in `screen.js` — ✅ fixed

`result = 0;` created an implicit global. **Fix:** localized with `let` during the JS modernization.

#### P0.4 XSS in `notify.js` — ✅ fixed

`this.node.firstChild.innerHTML = message;` assigned user-controlled text (e.g. a file name) via
`innerHTML`. **Fix:** replaced with `textContent`.

#### P0.5 Memory bank decoding bug (`memory.js:263`) — ✅ fixed (March 2026)

The condition tested `io.EXTENDED_MODE_PORT` (the constant `0xF0`) against `0x04`, which is always
`0`, so the branch never ran. **Fix:** `io.ports[io.EXTENDED_MODE_PORT]`.

#### P0.6 Deprecated APIs in `tape.js` — ✅ fixed

`FileError.QUOTA_EXCEEDED_ERR` and `webkitRequestFileSystem` were used. **Fix:** `tape.js` was
rewritten during the module migration to use `Blob` and `URL.createObjectURL`.

#### P0.7 Huge inline data files — ✅ fixed

`dump.js` held **2.18 MB** (41,203 lines) and `rom.js` **125 KB** (2,127 lines) of binary data as JS
arrays, slowing parsing and inflating memory. **Fix:** data moved to `public/data/*.bin` and loaded
via `fetch()`.

#### P0.8 Chrome Packaged App deprecated — ✅ resolved by Phase 1

Manifest v2 Chrome Packaged Apps were removed from Chrome in 2024. **Fix:** migrated to a Vite SPA
(see the Roadmap).

#### P0.9 `validateFileHeader()` rejected every user-selected file — ✅ fixed

The check decoded `magicString.length - 1` bytes and compared them with the full magic, so it was
**always false**: every `.sav`/`.e3` file picked through LOAD or drag & drop was answered with
"Invalid file structure." The regression came from `01d31b3` ("Extract storage logic to separate
class"); the original inline check compared exactly 16 (`LVOV/DUMP/2.0/H+`) and 13
(`Emulator 3000`) bytes. The function now compares the full magic and returns `false` for a file
shorter than it. Covered by `test/fileFormat.test.js`.

### P1 — Highest maintainability impact

#### P1.1 No tests (largest gap) and no `test` script — ✅ fixed

Added Vitest (`npm test` / `npm run test:watch`) and a headless suite, since grown to **90 tests
across 13 files**. They run without a DOM against the decoupled core, using a shared `test/helpers.js`
(`createCore()`):
- `i8080` — instruction execution: immediates, register moves, arithmetic flags, `JMP`, `CALL`/`RET`,
  `PUSH`/`POP`, `run()` frame stepping, halt, plus the opcode-fetch/trap contract (P3.5);
- `Memory` — RAM read/write, ROM write protection, `restart()`, `transfer()` (Array/DataView, bounds,
  unsupported type), `get_state()` size, video-memory page;
- `Storage` — snapshot size and `get_snapshot()` ↔ `set_snapshot()` round-trip, `.e3` load, rejects;
- `Screen` — `parse_color` and color caches, palette index range, `draw()` dirty tracking;
- `Keyboard` / `KeyboardBinding` — key matrix and the `evt.code` mapping;
- `ComputerProfile` — the fixed-timestep loop via a fake ticker, including the real PC-01 clock speed;
- `validateFileHeader` — the magic-string checks of the LVOV/DUMP and "Emulator 3000" headers;
- `Clock`, `Config`.

The full 8080 Exerciser ROM remains a possible future oracle for exhaustive CPU coverage.

#### P1.3 `Storage` methods invoked via `.call(this)` — ✅ fixed

`Storage` is now an instance service with injected dependencies (`new Storage(cpu, memory, io)`)
instead of a set of static methods driven through `.call(this)`. `ComputerProfile` receives it via DI
and delegates (`this.storage.get_snapshot()`). This also fixed a latent bug: `set_e3_snapshot()`
called `this.get_rom_page()`/`this.get_vram_page()`, which do not exist on `ComputerProfile`, so
loading an `.e3` snapshot would throw `TypeError`; it now uses `this.memory.get_rom_page()` /
`get_vram_page()`.

#### P1.4 Duplicated type-check boilerplate — ✅ fixed

The repeated `if (!(x instanceof Y)) throw new Error(...)` block (52 occurrences across 16 modules)
was replaced with a single `assertInstance(value, Type, message)` helper in `src/utils/assert.js`.
Error messages are preserved verbatim, so behavior is unchanged.

#### P1.5 ES modules and bundler — ✅

Migrated to ES modules with Vite. This removed the rigid `<script>` ordering in HTML and enabled
tree-shaking and code splitting. (Supersedes the old ES3-style, manually-ordered script setup.)

#### P1.6 Build system and tooling — ✅ (partial)

`package.json`, ESLint (Flat Config), Prettier and husky/lint-staged are configured. CI/CD
(GitHub Actions) is still missing (see P2.10).

#### P1.7 Deprecated web APIs — ✅

`webkitImageSmoothingEnabled` replaced with the standard `imageSmoothingEnabled`. `evt.which` was
first replaced with `evt.keyCode` as a tactical fix and later with `evt.code` (P3.1).

#### P1.8 Typos and license hygiene — ✅

Typos (`'standart'` → `'standard'`, `'Unknow'`/`'Unknownn'` → `'Unknown'`) fixed across the project.
The `dnd.js` Google/Apache-2.0 header was replaced with the project's GPL-3.0 header; the drag & drop
implementation is independently written (only standard DOM API usage overlaps with the original
sample), with a courtesy attribution kept in the README.

**Later** (`7aa178a`) the per-file GPL boilerplate was dropped from all 31 files that carried it, so the
licence is now recorded in one place: `README.md` (copyright, `GPL-3.0-or-later`, warranty disclaimer,
third-party assets) plus `package.json` and `gpl-3.0.txt`. `src/i8080.js` keeps its header because it
also carries the upstream copyright of Alexander Demin (2012).

#### P1.9 Grayscale formula in `screen.js` — ✅ (not a bug)

`~~(p & 0x00ff0000 && GRAYSCALE_RED_WEIGHT) + …` uses logical `&&` rather than multiplication. This
was investigated and confirmed to be an **intentional emulation feature**: it produces a brighter
image resembling a real PC-01 black-and-white TV. Replacing it with correct weights makes the image
too dark. The code is kept as is with an explanatory comment.

### P2 — Structural improvements

#### P2.1 Game loop: `setTimeout` → `requestAnimationFrame` → `setTimeout` — ✅ done

`ComputerProfile` now runs a **single `requestAnimationFrame` loop with a fixed timestep**: it
accumulates the elapsed time and runs whole emulated frames (`cpu.run(frame_cycles)` every
`frame_duration` ms), carrying the remainder over to the next animation frame. The three-timer chain
(`timers.interrupt` / `animation` / `restart`) and `this.timers` are gone — only one
`animation_frame` handle remains, cancelled on `suspend()`.

Additional hardening: the backlog is capped (`MAX_FRAME_BACKLOG`) to avoid a spiral of death after a
long stall, `run()` no longer throws when suspended (it is a no-op), and a frame already in flight no
longer steps the CPU while suspended. Covered by a new `test/computerProfile.test.js` (fake ticker).

**Follow-up:** because the loop now honours `frame_duration` faithfully, `allow_turbo_mode` was
switched off by default (`src/settings.js`) so the emulator keeps the real PC-01 clock speed
(20 ms per frame -> 50 frames/s -> 2.24 M cycles/s). Previously the `requestAnimationFrame` inside the
loop chain throttled the emulator to roughly the display refresh rate, so the turbo flag had no
visible effect. Turbo still exists (it halves `frame_duration` twice -> 4x) as a future opt-in.

#### P2.2 `Settings` mixes data and DOM — ✅ fixed

`Settings` used to resolve DOM nodes in `init()` (`document.getElementById(...)`) and store them in
`node` fields, so it could not be instantiated outside a browser. Now:
- `Settings` is pure, frozen configuration data only (`src/settings.js` no longer touches the DOM and
  is constructible in Node/tests);
- a new `DomResolver` (`src/domResolver.js`) is the only place that resolves elements by id, with
  clear errors when an element is missing;
- `Viewport` and `DnD` receive their container element explicitly, and the resolver is injected
  through `Emulator` → `Computer` → `ComputerProfileBuilder` → `ComputerProfile`.

Side effect: the old `init()` mutated the shared nested `DEFAULT_SETTINGS` objects (leaking nodes
across instances); that is gone.

#### P2.3 Magic numbers and strings — ✅ done

- `memory.js`: the memory maps (80/144/256) and their legacy string aliases are now `MEM_MAP` +
  `MEM_MAP_ALIASES`; page geometry (`PAGE_SHIFT` / `PAGE_MASK` / `PAGE_SIZE` / `PAGE_OFFSET_MASK`),
  bank indices and the extended-RAM decoding constants (`EXTENDED_BANK_SHIFT`, `EXTENDED_PAGE_MASK`,
  `EXTENDED_PAGE_BASE`, `PAGES_PER_BANK_SHIFT`) are named. The 16 copy-pasted
  `new MemPage({ begin: 0xc000 })` blocks became a loop that pushes four pages per extended bank.
- `io.js`: the keyboard ports are named (`KEYBOARD_SELECT_PORT` / `KEYBOARD_STATUS_PORT` /
  `KEYBOARD_DATA_PORT`), plus `EXTENDED_MEMORY_BIT`, `PPI_BASE_PORT`, `PPI_CONTROL_REGISTER` and the
  i8255A bit set/reset constants (`PPI_MODE_BIT`, `BSR_*`).
- `keyboard.js`: the opaque `{ mask: 0x… }` literals were already replaced during P3.1.
- Verified: `get_mem_page_index()` matches the previous implementation over 30,720 input
  combinations, and the page layouts are 5 / 9 / 21 pages for 80 / 144 / 256 KiB.

#### P2.4 `Memory.transfer()` returns `offset` or `false` — ✅ fixed

`Memory.transfer()` no longer returns `false` for an invalid data type; it throws
`TypeError('MEMORY: Param DATA must be an Array or a DataView')` and always returns the new offset
(consistent with the `RangeError`s it already raised for bounds problems).

#### P2.6 Separate UI from emulation logic — ✅ done

The emulation core is now free of the DOM and browser APIs and can be constructed and tested outside
a browser: `settings`, `config`, `clock`, `i8080`, `io`, `memory`, `rom`, `dump`, `traps`, `storage`,
`screen` (plain pixel buffer), `keyboard` (pure key state), `beeper` (pure PCM generation).

The browser parts live in dedicated shell components: `DomResolver`, `KeyboardBinding`, `AudioSink`,
`UiBinding`, `Ticker`, `Viewport`, `Dnd`, `Notify`, `Tape`, plus `Emulator`/`Computer`.

`ComputerProfile` is now the shell coordinator: it no longer uses `document`/`window` directly and
drives the machine through injected components — timers/`requestAnimationFrame`/`performance` via
`Ticker`, and the LOAD button via `UiBinding`. (`Notify` remains a shell singleton used to display
error messages.)

#### P2.7 Screen ↔ Viewport rendering refactor — ✅

Screen previously mixed video-emulation logic with canvas operations. Now:
- **Screen** is a data generator: `draw()` returns `ImageData` or `null`; it has no `context` and
  does not take screenshots.
- **Viewport** is the renderer: `render(image_data)`, screenshot handling, canvas context and
  smoothing settings.
- **Profile** coordinates: `screen.draw()` → `viewport.render()`.

Benefits: Screen is testable without a canvas, renderers are swappable (e.g. WebGL), and each
component has a single responsibility.

#### P2.8 Rendering performance optimizations — ✅

- Precomputed grayscale palette cache (`static cache_grayscale`), removing ~196,608 operations per
  frame (12 ops/pixel × 16,384 pixels).
- Conditional `putImageData()`: a `dirty` flag ensures the canvas is only updated when the image
  actually changed.

#### P2.9 `terminate()` property nulling via split string — ✅ fixed

The `'settings,config,...'.split(',').forEach(...)` teardown in `ComputerProfile.terminate()` was
replaced with an explicit `PROFILE_DEPENDENCIES` array iterated by a `for...of` loop.

#### P2.12 Configurable CPU speed (`cpu.speed_factor`) — ✅ done

The emulator ran the CPU at the full nominal clock (2.24 MHz) and felt faster than a real PC-01 (see
P2.11). The frame rate and the CPU speed are now two separate things: the frame rate belongs to the
video circuit and stays at 50 Hz, while `cpu.speed_factor` sets how much work the CPU gets done
within a frame.

- `src/settings.js`: new `cpu.speed_factor` (default `0.6`, ≈ the effective speed of the real
  machine); `allow_turbo_mode` now multiplies it by 4 (turbo keeps the 50 Hz frame rate). The defaults
  are `structuredClone`d, so instances no longer share nested objects.
- `src/config.js`: `frame_duration` stayed nominal, `frame_work_cycles` (the CPU budget per frame) and
  `effective_clock_speed` (what the CPU really executes) are new; an invalid factor throws
  `RangeError`.
- `src/beeper.js`: converts cycles to samples with `effective_clock_speed` and sizes the buffer from
  `frame_work_cycles`, so the sound stays gapless and a slower machine plays a proportionally lower
  pitch.
- `src/computerProfile.js`: the main loop steps the CPU with `frame_work_cycles`.
- Tests: `Config` frame timing / work budget / turbo / invalid factor, the loop honouring the work
  budget, and the new `test/beeper.test.js` (the buffer covers a whole frame at any speed, the pitch
  follows the factor, the frame reaches the sink).

Measured in headless Chrome: the app boots, `Space` starts Moon Tracker (28 777 painted pixels),
60 rAF/s, no console errors; `k = 1.0` would give 44800 cycles per frame, the default `0.6` gives
26880 (1.34 MHz, +13.3 ms per frame).

### P3 — Polish, features and rendering ideas

#### P3.1 `keyboard.js`: deprecated `evt.keyCode` + manually unrolled loops — ✅ done

- `KeyboardBinding` now forwards `KeyboardEvent.code` instead of the deprecated `evt.keyCode` (this
  is also layout-independent).
- `keyboard.js` was rewritten around an explicit matrix: `MATRIX` maps a key id to
  `[port, column, row bit]`, replacing the packed `{ mask: 0x… }` literals; the ctrl shortcuts now
  switch on `evt.code`.
- The unrolled `get()` loops collapsed into one loop over `state.length` (the obsolete 2012-era
  Chrome-profiler comment is gone).
- Verified against the previous map: all 78 matrix entries and 21 Alt entries are identical.

#### P3.2 Dead code — ✅ done

Removed:
- `viewport.js` — the unused `_ASPECT_RATIO_1_1` / `_ASPECT_RATIO_16_9` constants.
- `Ticker.setTimeout()` / `clearTimeout()` — orphaned once P2.1 replaced the timer chain with a
  single `requestAnimationFrame`.
- Unused API: `Dump.list()`, `Tape.store()`, `Emulator.load_dump()`, `Computer.stop()` / `reset()` /
  `terminate()` / `get_description()` (plus `ComputerProfile.get_description()` and
  `Rom.get_description()`), `Notify.terminate()`.
- `local_load_button_handler` — already removed with the P0.1 fix.

Kept on purpose:
- `IO.interrupt()` — a documented no-op hook called by the CPU.
- `MemPage.is_readable` — symmetry with `is_writable`.
- `i8080.js` `store_flags()` — reviewed and left as-is. Its `else f &= ~F_*` branches are reachable
  (they run when a flag is false) but redundant, because `f` starts at 0 and each flag owns a
  distinct bit that only its own branch writes. The construct is inherited verbatim from the
  upstream core (begoon/i8080-js), so it is kept for fidelity. Verified over all 256 flag values:
  stripping the `else` branches changes nothing.

#### P3.3 Consolidate utilities — ✅ done

- `validateFileHeader` moved to `src/utils/fileFormat.js`; `generateScreenshotFilename` and
  `getFileExtension` moved to `src/utils/screenshot.js` (English file names and JSDoc).
- `Config` now uses `Object.assign(this, settings)` + `Object.freeze(this)` instead of an
  `Object.defineProperty` loop.
- `Notify` singleton simplified: `create()` initialises `Notify.instance` once, the constructor no
  longer returns the existing instance, and `terminate()` clears the instance only if it owns it.
- Comments are now in English across `src/`. The PC-01 key names in `keyboard.js` (`ЗБ`, `ТАБ`,
  `ДИА`, `РУС`, `ЛАТ`, …) are kept verbatim because they are the key labels shown in the UI help
  dialog.

#### P3.5 `get_optcode()` potential infinite loop — ✅ done (the loop was already gone)

The item described the v1 `for` loop that kept fetching while the opcode equalled
`I8080.UNDEF_OPTCODE` (`0x100`). That loop was replaced by an `if` in `e166909` ("Refactor i8080
Traps to use Map"); `17da445` later renamed the constant to a module-level `UNDEF_OPTCODE` and added
the `Number.isInteger()` guard. The current `get_optcode()` (`src/i8080.js:207`) contains no loop at
all, so the risk described by this item no longer exists.

The sentinel contract is now pinned by tests (`test/i8080.test.js`, "opcode fetch and traps"):

- no trap, a trap returning `UNDEF_OPTCODE` (`getUndefOptcode()`), and a trap returning a non-integer
  all fall back to the byte at `pc`;
- a trap returning an opcode (`0x3c`, or `NOPE_OPTCODE` = `0x00` while an async file load is pending)
  shadows the memory byte;
- the sentinel can never be fetched: `MemPage.read()` returns a `Uint8Array` element (0..255), so
  `0x100` is unreachable — and `execute()` would throw on an unknown opcode anyway (`default:`);
- a real profile trap (`0xe55e`, CLOAD) sets `pc` and lets the fetch continue from the jump target.

Where `0x100` is used: `src/i8080.js:44` (definition), `:208` (initial sentinel), `:220` (the only
comparison), `:1173` (`getUndefOptcode()`), and the three trap handlers that return it
(`src/traps.js:40`, `:80`, `:86`).

Still open nearby (not part of this item): `gosub()` runs `do { … } while (this.pc !== ret_pc)` with
no iteration limit, so a subroutine that never returns would freeze the UI thread. It is called from
the tape traps (`src/traps.js`), and `i8080.js` is the upstream CPU core, so it needs a separate
decision.

#### P3.10 Beeper and audio output fixes — ✅ done

The beeper was still the 2014 implementation (added in `cc0ebc5` as `js/beeper.js`); the 2026
refactors had only changed its plumbing (`Clock` injection in P0.2, `AudioSink` extraction in P2.6).
An audit found five defects, all of them audible, three of them original:

1. **No scheduling on the audio clock.** `AudioSink` used `source.start(0)`, so every buffer began
   whenever the animation frame happened to run and rAF jitter (±several ms under load) spliced the
   sound. Buffers are now queued at `max(currentTime, next_start_time)`, and the queue is
   resynchronised after an underrun or when it runs more than 0.5 s ahead of the clock.
2. **The wave restarted every frame.** `generateSquareWave()` started from a local `state = 0`, so the
   first segment of each frame was rendered as a low level whatever the beeper was really doing: about
   0.5 ms of forced silence plus a phase jump, 50 times per second. The level is now carried across
   frames, and the run that the frame boundary cuts is finished by the tail of the frame.
3. **A frame was not exactly one frame long.** `round(clock_speed / 44100)` cycles per sample plus
   `ceil()` on the buffer gave −0.23 % at the nominal clock and +1.70 % at `speed_factor` 0.6, and a
   1000 Hz tone measured 983 Hz (about −30 cents). Samples now come from a continuous resampler with a
   fractional carry across frames, and exactly `frame_duration × sample_rate` samples are emitted.
4. **DC offset instead of a bipolar wave.** The wave was generated as `0…VOLUME`, i.e. with a DC offset
   of half the amplitude, and the only remedy was the optional 440 Hz highpass, which cuts the
   fundamentals of low notes. The wave is bipolar now (±`VOLUME/2`: same loudness, no DC) and the
   optional filter is a 20 Hz DC blocker. It is also created on demand — it used to be built in the
   constructor, when no `AudioContext` exists yet, so the option silently did nothing.
5. **Overflow flushed a partial frame.** The segment buffer was `2 × SAMPLE_BUFFER_SIZE` (a guess: at
   the nominal clock a fast beeper produced ~1792 level changes against 1794 slots) and overflow called
   `play()` in the middle of a frame, dropping the rest of it and warning every time. The buffer is now
   sized from the worst case (one change per 8 cycles) and excess changes are dropped instead: above
   the audible band they cannot be heard.

Also: the beeper asks the sink for its `sample_rate` (the output device rate, e.g. 48 kHz) instead of
hard-coding 44100, so the browser no longer resamples every buffer; a suspended `AudioContext` warns
once instead of 50 times per second; and `process()` no longer merges a repeated write into the
previous run (which fused two runs and distorted the waveform) — a run is now measured from the last
level change or from the frame boundary.

Tests: `test/beeper.test.js` (frame length and rate, level continuity across frames, run length from
the frame boundary, tone frequency, bipolar output, overflow) and `test/audioSink.test.js` (queueing
on the audio clock, underrun resync, device sample rate, lazy DC blocker, warn-once, no context).

Measured over 100 frames of a 1000 Hz tone: the audio per frame is exactly 20.000 ms at every speed
factor, the tone measures 1000 Hz, the DC offset is 0 and no frame starts with a forced low level
(before: 19.955/20.340 ms, 983 Hz, DC 0.075, 0.5 ms).

**Follow-up — notes overlapping (found by ear, after the change above).** Two things were tried. First the
new queueing exposed a long-standing flaw: `beeper.play()` was called once per *animation* frame (60 Hz
on a typical display) instead of once per *emulated* frame (50 Hz), so the emulator produced about
1.2 s of audio per second; that was fixed by producing the buffer inside the frame loop. The
scheduling itself (queuing buffers on the audio clock with a 50 ms lead) was then **reverted**: the
overlapping was still audible, and although the queue is monotonic by construction — a buffer never
starts before the previous one ends — the cause could not be pinned down, so the code went back to
playing every buffer as soon as it is handed over (`source.start(0)`), which is what it did for the
previous twelve years. Everything else in P3.10 was kept, because none of it can superimpose two
sounds: the frame-exact buffer, the phase and fractional carry, the bipolar wave, the buffer sizing,
the device sample rate, and one buffer per emulated frame.

If the overlap shows up again, the next step is to *capture and analyse the PCM* of the exact melody
that reproduces it (buffer contents plus the audio clock) instead of reasoning about the schedule.

What the beeper did not model at that point was the emitter itself: the samples went into the Web Audio
graph as raw square waves. That is what P3.11 adds.

#### P3.11 Piezo emitter model — ✅ done

The beeper fed its raw 1-bit square wave straight into the Web Audio graph, i.e. the emulator had no
emitter at all. The real PC-01 does **not** drive the TV speaker (an earlier note in this document
said so and was wrong): the sound leaves the mainboard through an **open-collector gate** (D29,
К155ЛА8/7401) fed by **PC0** and **PB7** (see P3.12) and reaches the emitter via the **BUZZER** pin (16)
of the keyboard connector - so the emitter sits on the keyboard PCB, and it is a built-in **piezo
emitter** (the manual speaks of «динамик (капсуль)», and a piezo disc is exactly what an
open-collector gate with a series resistor drives).

The emitter itself has since been identified from the part data: it is a **ЗП-1** piezo capsule, and
the data is taken from its TU (12MO.081.085 TU, the designation in the manufacturer's catalogue):
resonance frequency **3-5 kHz**, sound pressure at least 75 dB at 100±3 cm, nominal voltage 5±2 V,
operating range -30..+60 °C, mass up to 5 g. The same capsule also allows a three-wire circuit with
feedback for a self-oscillating generator, but the PC-01 does not use that: the capsule is driven from
the gate as a plain two-wire load.

The two published numbers do not have to be in conflict. Alongside the 3-5 kHz of the TU, several
sources give the primary resonance point as 1-3 kHz, and attribute the difference to batches or to the
way the resonance is measured (the first version of this model was built on that figure, and an earlier
revision of this note called it a propagated copy error - that guess was wrong). The spread therefore
covers roughly 1-5 kHz. The model follows the TU band, as agreed; a particular capsule may sit lower,
which is one more reason to measure the real machine if that ever becomes possible.

The remaining data for the part, from the same sources: it needs an external pulse to do anything (no
built-in generator), it is soldered to the board with two leads, the disc is 39 mm across and 4 mm
thick (one table quotes 32x4 mm, which is the odd one out), the nominal voltage is 5±2 V in the TU and
is given as 3-10 V by the listings. The emulator does not calibrate the absolute level, so the drive
voltage only matters for whoever drives a real capsule. Two leads and an external pulse is also what
the schematic shows: the capsule is driven from the gate, not through the three-wire self-oscillating
circuit.

Evidence collected for this item:

- [codepainters/lvov](https://github.com/codepainters/lvov): `docs/cpu_pio.md` («`PB7` controls a
  speaker»), `docs/connectors.md` (the `BUZZER` row of the keyboard connector) and the rebuilt
  schematic (`sch/pio.kicad_sch`, `sch/pdf/lviv_sch.pdf`, the `SPKR` net).
- The ROM settles the data path: the BEEP entry point at `0xDE94` toggles port `0xC2` between `0xFF`
  and `0xFE`, i.e. **PC0** — the same bit that goes to the tape recorder, which is why the tape
  load/save sound comes out of the built-in emitter. This matches `src/io.js` (`BEEPER_MODE_BIT` = PB7
  as the enable, `BEEPER_BIT` = PC0 as the level).
- `roms/Lvov1.rom` there is byte-identical to our `public/data/rom-1990.bin`.
- The keyboard layout scan (`orig/keyboard_pcb.jpg`) shows a single round emitter with a centre pad
  next to R14, its silkscreen labels mirrored (`ВА1`/`ЗП…`).

What is still **not** established is the *shape* of the response of the mounted capsule: no measured
curve is available, the level is not calibrated to the 75 dB figure, and the drive is not a symmetric
square wave - the open-collector output pulls the line low through the transistor, while the rising
edge is the (unseen) pull-up charging the capacitance of the capsule, i.e. an RC charge. The missing
values are the pull-up resistor of the gate, the series resistor next to the capsule (R14 on the
keyboard board) and the capacitance of the capsule. One constraint follows from the band itself: for the
3-5 kHz resonance to survive, the RC time constant has to stay well below a quarter of a period
(τ ≲ 20-30 µs), so a capsule of a few tens of nF implies a pull-up of about 1 kΩ rather than tens of
kΩ.

Implementation (`src/audioSink.js`) - a chain of biquads in front of the output, with the band taken
from the part data:

| Stage | Type | Frequency | Notes |
| --- | --- | --- | --- |
| DC blocker (optional, `allow_highpass_filter`) | highpass | 20 Hz | only needed in `flat` mode: a piezo is capacitive and blocks DC by itself |
| Low end | highpass | 3000 Hz | lower edge of the resonance band quoted in the TU |
| Resonance | peaking | 4000 Hz, +6 dB, Q 1 | middle of the 3-5 kHz band, broad enough to cover it |
| Top end | lowpass | 5000 Hz | upper edge of the resonance band |

`beeper.speaker_model` in `src/settings.js` switches between `'piezo'` (**the default**: the model
above, now that the part has been identified) and `'flat'` (the raw square wave, kept as the
unfiltered mode); an unknown value throws `RangeError` in `Config`. The raw square wave is what this
emulator has produced since its first version: the sound pipeline is our own design and older than
other PC-01 emulations, so the digital side (the level, the frames, the mixer) was not taken from
another emulator - only the analogue emitter follows the part data. The shape of the response curve of
the mounted capsule is still unknown, so the model remains an approximation, not a measurement.

Measured by rendering tones through the real chain in an `OfflineAudioContext` (level relative to
`flat`, which is flat by definition):

| 100 Hz | 200 Hz | 400 Hz | 700 Hz | 1 kHz | 1.5 kHz | 2 kHz | 2.5 kHz | 3 kHz | 4 kHz | 6 kHz | 10 kHz | 15 kHz |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| −59.3 dB | −47.2 dB | −35.1 dB | −25.0 dB | −18.3 dB | −10.0 dB | −3.5 dB | +1.7 dB | +5.5 dB | +8.4 dB | +1.8 dB | −12.3 dB | −25.3 dB |

The −3 dB points of the model land at about 2.1 kHz and 6.3 kHz, i.e. around the quoted band rather
than inside it: the TU gives the range in which the disc resonates, and the filters have to be centred
on it. The audible consequence is large, because the software does not play in that range: the melody
of the test application (`public/data/apps/almazy_lviv.lvt`) averages about 600 Hz - 24.7 level changes
per 50 Hz frame - which the model passes at about −25 dB, so it is reproduced mainly through the 5th to
7th harmonics of its square wave, i.e. around 3-4 kHz. That is exactly the thin, shrill character of a
ringer capsule, and it is what a real machine does with these melodies; a melody written for the
capsule's own band would come out roughly 25 dB louder. If that turns out to be too extreme by ear, the
constants sit in one block (`PIEZO_MODEL`) and the band can be widened without touching anything else.

Tests (`test/audioSink.test.js`): the chain of each model, that it is built once, that `flat` builds no
nodes, and that the DC blocker stays independent of the model.

#### P3.12 Speaker level: `PC0 OR NOT PB7` — ✅ done

`src/io.js` treated PB7 as a plain enable: PC0 was handed to the beeper only while PB7 was set, and a
PB7 falling edge changed nothing. The rebuilt schematic (codepainters/lvov, `sch/pio.kicad_sch`, PDF
page 6) shows what the circuit actually does: `PC0` and `PB7` are the two inputs of an open-collector
NAND gate (D29D, K155LA8/7401) whose output is the `SPKR` hierarchical label - the emitter on the
keyboard board (the BUZZER pad of the keyboard connector). By De Morgan that gate is `PC0 OR NOT PB7`:
with PB7 high the emitter follows PC0 (sound), with PB7 low the output is a constant high (silence).
The same sheet shows PC0 also feeding the tape path (R3 1k, then R5 1k and C39 150nF to ground, then
C42 150nF in series to the "Tape" connector X3), which is why one bit is both the tape output and the
speaker.

`IO.output()` now stores the port value and calls `updateSound()`, which computes the derived level and
hands it to the beeper only when it changes. The schematic is the source of the fact, and the comment
in `src/io.js` says so. The old
code is audibly equivalent while PB7 is high (both follow PC0) and differs only while PB7 is low,
where it *held* the last level instead of forcing it high: a constant level is silence either way, so
the practical difference is the edge itself. On the traced circuit the output really does step when PB7
is written, so the derived level is the faithful one and a click at such a write is real. How often
that can be heard is limited: the ROM contains six `OUT 0xC1` sites in total (0x3c, 0x5f, 0x8f twice,
0xbd, one from a register, so two with PB7 low) and `dump-mtrack.bin` seven.

Not the cause of the reported note overlap: while a note sounds PB7 is high (both the ROM and Moon
Tracker set it that way), so both models hand the beeper the identical level, and the only extra edges
this change can add are the rare `OUT 0xC1` writes above.

Tests: the new `test/io.test.js` pins the level sequence for PC0 writes, for a PB7 falling/rising edge,
and for the profile that ignores PB7.

For P3.11: the gate has an open-collector output, so the rising edge is set by the pull-up charging the
capacitance of the emitter (sharp falling edge, exponential rising edge), while the model there still
uses a plain square wave. The pull-up is not on this sheet.

#### P3.13 Duplicated animation loop after a synchronous resume — ✅ fixed

**Symptom.** With a `.lvt` application (`public/data/apps/almazy_lviv.lvt`, the melody on its splash
screen) the sound was rough - the tone sounded doubled - and the machine itself ran about 1.66x too
fast. The same defect had earlier been reported as notes overlapping from time to time.

**Cause.** The BLOAD trap resumes the machine from *inside* the frame that is executing: for a `.lvt`
dump `load_dump()` attaches the file, so the trap finds `exists_attached_file()` true and runs
`install()` synchronously, which ends with `this.resume()` -> `run()`. `suspend()` had cancelled the
pending animation frame, but the interrupted `frame()` was still on the stack and at its tail
`is_suspended` was already `false` again, so it queued *itself* as well. Two loops then ran in
parallel, each with its own accumulator: 99.7 emulated frames per second instead of 50, and two
pending `requestAnimationFrame` callbacks instead of one.

Two audible consequences:

- The machine produced 1.66x the audio per second: a 20 ms buffer arrived every ~12 ms of wall time, so
  neighbouring buffers always overlapped by a few milliseconds and the tone doubled itself. Measured
  3706-3886 ms of overlap per 10 s of melody, up to 9 sources at once when animation frames were
  dropped.
- With the audio-clock queue of P3.10 still in place the lead grew twice as fast as wall time and hit
  its 500 ms cap every few seconds. The resynchronisation then restarted the schedule 50 ms ahead of
  the audio clock, i.e. on top of audio that was still queued: up to **25 sources simultaneously** -
  the "notes overlapping every few seconds" that started this investigation, and the reason the queue
  looked guilty and was reverted.

**Why it stayed hidden.** Only the attached-file path resumes synchronously. A `.sav` dump and a plain
boot read the file asynchronously (`tape.load().then(...)`), so the interrupted frame sees itself
suspended and does not queue a second loop. The speed check made after the turbo work therefore
measured 1.02x on Moon Tracker (a `.sav` dump) and missed it.

**Fix.** `ComputerProfile.run()` stores a generation token (`loop_token`); `frame()` returns at once
when it is no longer the current loop and re-queues itself only while it still owns it
(`src/computerProfile.js`, 14 lines).

**Evidence.** A headless reproduction of the real load path (bload snapshot plus attached `.lvt`, ROM
BLOAD trap, animation frames driven by hand, every sink buffer recorded with its wall clock):

| | before | after |
|---|---|---|
| emulated frames | 99.7/s | 49.9/s |
| pending rAF callbacks | 2 | 1 |
| overlap per 10 s of melody | 3706-3886 ms | 341-389 ms |
| longest overlap / sources at once | 20 ms / up to 9 | 20 ms / up to 5 |
| audio-clock queue (P3.10) | 3 resyncs per 12 s, up to 25 sources | none, peak lead 63-120 ms |

**Tests.** `test/computerProfile.test.js` gains the regression: a fake CPU resumes the machine from
inside `cpu.run()`, then exactly one frame must be queued and 11 fixed steps must produce 11 emulated
frames. Without the token it fails with `expected [ [Function frame], [Function frame] ] to have a
length of 1 but got 2`. Suite: 90 tests in 13 files.

**Remaining.** `start(0)` (P3.10) still overlaps for at most one buffer when several emulated frames are
caught up in a single animation frame after a stall (bounded by `MAX_FRAME_BACKLOG`; measured 20 ms,
up to 5 sources). With a correct loop the audio-clock queue measures **0** overlap and a peak lead of
63-120 ms, so the candidate is to bring it back with an overflow policy that *drops* instead of
rewinding the schedule. Not scheduled.

The reproduction harness behind the table is a throwaway script; it is a candidate for `P2.10` if a
headless smoke check is wanted in CI.
