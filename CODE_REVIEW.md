# Emulator PC-01 Lviv — Review, Roadmap and Backlog

> Date: 2026-09-26
> Last updated: 2026-10-17
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
- ✅ DOM-free core + headless test suite (Vitest, 95 tests in 14 files)
- ⏳ `ARCHITECTURE.md` and JSDoc types (P3.4)
- ⏳ Web Worker for the CPU (P2.5)

**Next steps:**
1. Start Phase 2: add PWA support (P3.6) — the last migration phase
2. Phase 3 leftovers: `ARCHITECTURE.md` (P3.4), tests for `io.js`
3. Opportunistically: `i8080.js` modernization (P1.2), Web Worker (P2.5), rendering (P3.7 / P3.8)
4. Emulation fidelity, from the real-hardware measurements of the forum thread in P2.17:
   the reset ROM mapping (P2.17), the write contention (P2.18), the frame length (P2.20)

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
- ✅ `.editorconfig`
- ✅ GitHub Actions workflow (manual trigger for now): format check, lint, tests, build, browser smoke check

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

#### P2.10 `.editorconfig` and CI — ✅ done

`.editorconfig` mirrors `.prettierrc` (two spaces, 100 columns, LF, UTF-8) so that editors do not fight
the formatting, with trailing whitespace kept in markdown. Prettier only reads this file, it does not
format it, so it stays outside the format check.

`.github/workflows/ci.yml` runs `npm ci` on Node 22 - the lowest version that satisfies the engines of
vite (20.19), eslint (20.19) and vitest (22.12), while the README promised 20 - then `npm run
format:check`, `npm run lint`, `npm test`, `npm run build` and the browser smoke check `npm run check`.
That check needs Chrome, which the GitHub runner images ship; the script also takes `--chrome <path>` and
adds `--no-sandbox` when CI is set, because a container usually cannot use the sandbox.

The workflow is triggered by hand for now (`workflow_dispatch`), because the project does not need a run
on every change yet; the `push` and `pull_request` triggers sit next to it commented out and come back by
removing the `#`. Two GitHub rules decide when a trigger fires: the file has to be on the **default
branch** for the "Run workflow" button (and the dispatch API) to exist at all, and a `push` only starts a
workflow that is present on the pushed branch. So the job stays dormant until this file reaches `master`,
which matches what the project wants at the moment.

The measurement tools (`npm run audio:response`, `npm run audio:melody`) are deliberately not part of the
job: they print numbers for a human instead of asserting anything. See `scripts/README.md`.

#### P2.11 Wait states: the video/RAM contention is not modelled — ✅ done

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

**Implemented** (`src/contention.js`, `cpu.wait_states`, on by default): every access to RAM charges a
wait from the repeating 7-step pattern 2, 2, 2, 3, 2, 2, 3 (2 2/7 on average), a write costs one more
and an I/O access costs one. The cycles are charged twice, and that is the mechanism: they advance the
shared `Clock`, so a frame still holds 44800 ticks and the beeper sees the real timeline, and they are
added to the cycle count of the instruction that caused them, so the frame budget buys less work.
`I8080.run()` counts the cycles of its instructions locally and that core is an upstream port which stays
untouched, so the second half lives in `Contention.attach(cpu)` - a wrapper around `cpu.instruction()`
that adds the waits incurred inside the call. `Memory` charges on contended pages only (`is_rom`), which
is what makes the model selective: ROM code keeps the nominal speed.

Measured on the test application (`almazy_lviv.lvt`, 12 s): 6051 instructions per frame without the
contention against 4100 with it, i.e. the machine completes about **0.68×** of its nominal work - the
exact figure depends on the instruction mix, of which 0.6× was the estimate for a typical one. The frame
rate stays at 50 Hz.

The selectivity has a consequence worth knowing: **the pitch of music generated by code in RAM drops**
with the work, because the tone loop itself is slowed. On the test melody 99 % of the speaker toggles
come from RAM (10568 of 10640, the other 72 from ROM), so its notes fall from 1017 Hz to 642 Hz - which
is what the hardware does with that program. The ROM's own BEEP routine touches registers and ports only
(`0xDE94`: `MVI`/`OUT`/`DCX`/`MOV`/`ORA`/`JNZ`, no memory access), so it is not contended and keeps the
nominal pitch.

`cpu.speed_factor` (P2.12) remains the crude alternative - one uniform multiplier that also slows ROM
code and therefore lowers every tone by the same ratio. With the contention in place it belongs at 1.0.

The measurement planned as the first step here was done with the test harness rather than in a headless
browser: the accesses per frame are charged in `Memory`/`IO` and counted by the tests in
`test/contention.test.js`.

#### P2.15 Reads of the write-only registers return the floating bus — ⏳

`IO.input()` answers `0` for the control register of a PPI (`0xC3`, `0xD3` and their `A2`/`A3`
mirrors), with a correct comment that the i8255A control word register is write-only. A device that
does not drive the bus is not a device that drives zeroes, so the faithful answer is the floating bus
of P2.14. `Storage.set_snapshot()` carries a workaround built on the same assumption: it treats a
returned `0xFF` at port `0xC1` (the palette) as "not readable" and forces the default palette.

#### P2.17 The ROM is not mapped in all four banks until the first I/O write — ⏳

`memory.js` resolves the four 16 KiB banks directly, so a low address always answers RAM.
That contradicts the boot circuit: the `D5A` flip-flop is cleared by RESET and holds
`~ROM_OE` low, so **the ROM answers for every address** and its 16 KiB appear in all four
banks; the first write to an I/O port raises `~Q` and maps the ROM into `0xC000..0xFFFF`
only (`docs/memories.md`, item `D5A`). The ROM does exactly that itself: its very first
instruction after the reset vector is a dummy `OUT 00H`. The same sequence is described in
the forum thread [Повышаем качество эмуляции Львов ПК-01](https://zx-pk.ru/threads/33071-povyshaem-kachestvo-emulyatsii-lvov-pk-01.html)
(posts by Pyk and NEO SPECTRUMAN).

The flip-flop is *addressless*: it is set by RESET and cleared by the `I/O W` strobe, not
by the address decoder. The dummy write goes to `0x00`, which selects no device at all
(P2.14), so the clear has to happen in `IO.output()` before the decode.

**Symptom:** the machine boots through empty RAM. The reset vector at `0x0000` is
`C3 00 E0` (`JMP 0xE000`), but the emulator answers `0x00` there, so the CPU runs NOPs
until it wanders up into the ROM. Measured headlessly with `createCore()` and
`public/data/rom-1990.bin`: `PC` reached `0xC000` only after **7 emulated frames**
(~140 ms) instead of a few instructions.

**Fix:** an `initial_rom_mapping` flag on `IO`, armed by `IO.restart()` and cleared by the
first `IO.output()` (before the decode); while it is set, `Memory.get_mem_page_index()`
returns `rom_page_index` for every bank. Reads are then served by the ROM and are not
contended, because the RAM cycle never starts; writes are lost, because the EPROM is not
writable. A restored snapshot describes a machine that has already performed I/O writes,
so the snapshot loaders clear the flag explicitly.

#### P2.18 A RAM write is charged one extra cycle instead of 3/4 — ⏳

`src/contention.js` charges `WRITE_EXTRA = 1` on top of the read pattern. The real-hardware
measurements collected in the thread above disagree: Pyk puts a RAM write at about +0.75
cycle, and ivagor's fit over the real programs (Mandelbrot, Pi32, PiRk20 - each timed on a
real machine) gives optima around `READ ≈ 2.277 / WRITE ≈ 0.745`, for which he chose the
rational `16/7` and `3/4`. `READ_PATTERN = [2, 2, 2, 3, 2, 2, 3]` averages `2 2/7 = 2.286`
and already matches (`16/7`); `WRITE_EXTRA` is the one parameter that is off, by ~1 % of the
average speed. Implement as "3 extra cycles every 4 writes" so the average stays exact.

#### P2.19 `IN`/`OUT` below `0xC0` should stall the CPU — ⏳

The thread claims that any `IN`/`OUT` to ports 0-191 hangs the machine: the video/RAM access
arbiter reacts to `A14 = A15 = 1` and does not distinguish a RAM access from a port access,
and the 8080 duplicates `A0..A7` onto `A8..A15` during an I/O cycle, so READY is held low.
The BASIC manual allows ports 192-255 only. The emulator answers the floating bus instead.
**This must be verified before it is implemented:** `docs/cpu_pio.md` says the opposite
(`ROM_OE` is high for EPROM *and* PIO requests, so `Q` - and therefore the wait state - goes
low for RAM accesses only), and the emulator cannot afford to hang on a stray `OUT`.
Status: claim to verify against the schematic, not a settled fact.

#### P2.20 The video frame is 20.48 ms (48.83 Hz), not 20 ms (50 Hz) — ⏳

`src/settings.js` fixes `frame_cycles: 44800` and `Config` derives `frame_duration = 20 ms`.
`docs/timing.md`: the 20 MHz OSC feeds modulo-16, modulo-80 and modulo-320 counters, so a
frame is `320 × 80 × 16 = 409600` OSC ticks = **20.48 ms**, i.e. `15625/320 = 48.83 Hz`
(and ~45056 CPU cycles at the nominal 2.2 MHz, not 44800). The 2.4 % difference is in the
same direction as the two items above and is visible in whole-program timings. Touching it
means touching the audio budget too (`effective_clock_speed`, `frame_work_cycles`), so it
needs its own change and a measurement - the forum's real-program timings are the oracle.

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
3. **Dynamic aspect ratio** — ✅ done: UI selector for 1:1, 4:3 (CRT), 16:9 via
   `Viewport.setAspectRatio(value)` and `screen.aspect_ratio`.
4. **Scaling interpolation** — choose nearest-neighbor (pixel art), bilinear (smoothed) or a CRT
   filter via CSS `image-rendering` or WebGL shaders.
5. **HiDPI/Retina support** — scale the canvas by `window.devicePixelRatio`.
6. **Color corrections and filters** — brightness/contrast, color temperature, CRT effect
   (scanlines, bloom), monochrome monitor mode.
7. **Adaptive scaling to window size** — ✅ done: `fitScale()` picks the largest integer scale that
   fits the container, driven by a `ResizeObserver` (`screen.auto_scale`, "Fit window" checkbox).
8. **Fullscreen mode** — Fullscreen API with a toggle button, automatic scaling, ESC to exit.
9. **Screenshots with metadata** — date/time, loaded program name, current settings; PNG/JPEG/WebP.
10. **Animations and transitions** — smooth palette/color-mode changes and loading effects.
11. **Render statistics** — FPS counter, frame render time, dirty-pixel percentage, cache usage.
12. **Multi-threaded rendering** — OffscreenCanvas + Worker, transferring `ImageData` as a
    transferable object.

Priority within this list: **P1** dirty rectangle tracking; **P2** HiDPI, fullscreen; **P3** WebGL,
color filters, animations, statistics.

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

#### P3.14 Palette multicolour is not rendered — ⏳

`Screen.draw()` samples the palette **once per frame** (`io.input(PALETTE_PORT) & 0x7f`) and
renders the whole frame with it, so a program that rewrites port `0xC1` while the raster
runs gets no effect. On the real machine it does: the video demultiplexer is fed from PB[6..0]
as they stand when the byte reaches it, so fast palette writes paint coloured raster bands,
and the same register's PB7 makes the emitter squeak while they are drawn. The thread
(P2.17's source) has DDp's recordings and a test ROM (`palette_beep`) and concludes that
even Emu80 reproduces it only "to within 4 pixels": a palette *знакоместо* is 4 pixels wide
and shifted one pixel against the video *знакоместо*. Reproducing it faithfully means
knowing where in the frame each palette write lands, i.e. the per-cycle timeline of the
video fetch, which is the model P2.20 approaches only statistically. The sound half already
works: `IO.updateSound()` recomputes the level on every port write (`P3.12`).

#### P3.15 RAM content at power-on — ⏳

`MemPage.init()` fills RAM with zeroes, and the thread argues the ROM does not clear all of
it: DDp's `lvov_initial_memory_state` dump of a freshly powered machine was proposed as a
better initial state (a game that sweeps memory would see it). The thread itself does not
settle the question - it also notes that the video memory *is* cleared at power-on - so this
is a "check against the dump first" item, not a change to make.

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
2. **Extend the test suite** — an 8080 Exerciser ROM as a CPU oracle, snapshot fixtures; the `io.js`
   test now exists (`test/io.test.js`).
3. **Write `ARCHITECTURE.md`** (P3.4) — the module split (DOM-free core vs. browser shell) is now
   stable enough to document.
4. Work on the structural leftovers when the code is touched anyway: `i8080.js` modernization (P1.2),
   Web Worker (P2.5), dirty rectangles (P3.7), the remaining rendering ideas (P3.8).

Only **P1.2, P2.5, P2.15 and P2.17-P2.20, P3.4, P3.6, P3.7 and P3.14-P3.15** are open tasks.
Everything else in the backlog is either done (see [Completed](#completed)) or a candidate
list (P3.8, P3.9).

The sound work needs one thing from outside the repository: a recording of a real PC-01 (see P3.10 and
P3.11) - without it the emitter model cannot be checked against the hardware, and the video/RAM
contention of P2.11 rests on the documented pattern rather than on a measurement of a real machine.

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

Added Vitest (`npm test` / `npm run test:watch`) and a headless suite, since grown to **109 tests
across 16 files**. They run without a DOM against the decoupled core, using a shared `test/helpers.js`
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
- `Viewport` — `fitScale()` integer fitting (aspect ratio, limiting dimension, minimum scale) and
  aspect-ratio preset normalization;
- `UiBinding` — aspect-ratio and auto-scale control forwarding plus `terminate()` (EventTarget mocks);
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

`package.json`, ESLint (Flat Config), Prettier and husky/lint-staged are configured, `.editorconfig`
keeps editors in line, and a GitHub Actions workflow can run all of the checks (by hand for now, see P2.10).

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
third-party assets) plus `package.json` and `LICENSE` — renamed from `gpl-3.0.txt`, because GitHub
recognises a licence by file name only when it is `LICENSE`, `LICENCE` or `COPYING`. `src/i8080.js`
keeps its header because it also carries the upstream copyright of Alexander Demin (2012).

The licence text itself was then brought to the current FSF wording: `http` becomes `https` in the three
links, the old `philosophy/why-not-lgpl` address becomes `licenses/why-not-lgpl`, and the missing final
newline is added. `LICENSE` is now byte-identical to the canonical copy shipped with the system
(`/usr/share/common-licenses/GPL-3`); the text carries no trailing whitespace, so no `.editorconfig`
exception is needed. The third-party licences under `public/assets/` are untouched.

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

#### P2.13 512×256 video mode and screen blanking (PK-02 upgrade) — ✅ done

The PK-02 add-on board documented in `docs/Lviv PK-02 Upgrade.pdf` carries a latch on port `0xF0`
and two gates around the pixel shift register of the main board. The latch is the same register the
emulator already reads for the extended RAM banks (`src/memory.js`), and two of its bits were
declared in `src/io.js` but never used:

| Bit | Signal | Effect |
| --- | --- | --- |
| `0x8` | `512X256` | high-resolution mode |
| `0x10` | `BLANK-SCR` | screen blanking |

Reconstruction (verified against the schematic and `sch/video.kicad_sch` of the `lvov` repository):

- `D49'` (74153) replaces the shift clock of `D55` (74198) with 10 MHz instead of 5 MHz and feeds
  `Q7` into the colour demultiplexer input `A0` (`D56` pin 13) instead of `Q3`. Both demultiplexer
  select inputs are then driven by the same bit, so a dot carries **one** bit and only the first and
  the last of the four palette colours are reachable. A line still holds 64 bytes and 256 lines —
  the framebuffer becomes **512×256**, at half the dot width, i.e. the same 4:3 picture.
- `D2:F` inverts `BLANK-SCR` into `-BLANK-SCR`, which drives the master reset of the shift register
  (on the stock board that pin is a `no_connect`): every dot is cleared, so the screen shows a flat
  field of the background colour while the video memory and the CPU keep running.

Implementation: `Screen.set_high_resolution()` allocates the 8-dots-per-byte buffer, `Screen.draw()`
re-reads the port every frame, maps a byte to 8 dots (bit 7 leftmost) or blanks the whole frame, and
invalidates its per-byte cache on a mode change. `Viewport.renderScreen()` follows `screen.width` /
`screen.height` and rebuilds its `ImageData` when they change; `Viewport.dot_aspect_ratio()` halves
the horizontal stretch in the new mode, so the picture keeps both its aspect ratio and its size on
screen. Covered by tests in `test/screen.test.js` and `test/viewport.test.js`.

The latch is a register of the PK-02 board, so `Screen` and `Memory` only ever see it under a profile
that models that board's port `0xF0` device (P2.14): on the serial machine the address selects nothing
and a write to it is lost, which is why the modes and the extended RAM banks exist only on the
machine with the board, which the **Machine** selector of P2.16 provides.

#### P2.14 I/O port decoding: `A5`, the `A7`/`A6` enable and "nothing selected" — ✅ done

The four peripheral blocks are selected by `D28` (74155) from `A5` and `A4`, and the decoder is only
enabled while `A7` and `A6` are high: `~ROM_OE` goes low when `A15` and `A14` are high, and because
during an I/O cycle the 8080 puts the 8-bit port address on both halves of the address bus, that is
the documented trick which decodes `A7`/`A6` without extra gates (`docs/cpu_pio.md` in the `lvov`
repository).

| Block | Range | Device |
| --- | --- | --- |
| `~CS0` | `0xC0..0xCF` | main PPI (D30) |
| `~CS1` | `0xD0..0xDF` | keyboard PPI, on the keyboard PCB |
| `~CS2` | `0xE0..0xEF` | `X1` connector — wired to the FDD controller of the Chameleon era, empty on the serial machine |
| `~CS3` | `0xF0..0xFF` | `X1` connector — the port `0xF0` latch of the PK-02 board (P2.13) |

`A1`/`A0` pick the register inside a PPI and `A2`/`A3` are not decoded at all (`0xC4`, `0xC8` and
`0xCC` are the same register as `0xC0`).

The emulator instead builds the port index arithmetically, as `PPI_BASE_PORT + (port & mask)`, and
`io.allow_brief_decoding` picks the mask `0x13` instead of `0x33`, i.e. it drops `A5` altogether:
`OUT 0xF0` then lands on the keyboard PPI port A (`0xD0`) and `ports[0xF0]` stays 0 forever, although
`src/memory.js` reads it for the extended RAM banks and `src/screen.js` for the video bits (P2.13).
Nor does anything check the `A7`/`A6` enable: `IN 00H` reads the main PPI in the emulator, while the
hardware selects no block at all and leaves the data bus floating.

The flag is not a jumper or a register of the real machine — it is a modelling switch, `true` in
every profile since the pre-Vite `js/config.js` (commit `b0876bf`) with no item recording where it
came from. The two address masks it chooses between are two different *wrong* models of the same
circuit, and `fixed` is the wrong place for the choice: the decoding belongs to the machine model.

**Fix:** decode the four blocks explicitly and drop the flag from both profiles:

- Replace the mask with a `decode_port()` that returns the canonical port index of the selected
  device, or "no device" — `A7`/`A6` not both high, and the block of `0xE0..0xEF` (nothing is wired
  to it in this machine), select nothing.
- "Nothing selected" is a state the emulator does not have yet: a read returns the floating bus
  (`0xFF`; the same value `IO.restart()` already puts into `ports[MEDIA_PORT]` for "nothing
  connected") and a write is lost.
- `0xF0..0xFF` selects the PK-02 latch, and only in a profile that has the board (`io.extended_port_latch`,
  switched by the **Machine** selector of P2.16); unlike a
  PPI it is clocked by `~CS3` alone, so `A1`/`A0` do not reach it and all sixteen
  addresses write the one register. `IN 0F0H` returning the latch is an assumption — the output
  enable of the `8282` is not visible in the scanned sheet (`docs/Lviv PK-02 Upgrade.pdf`), which
  only shows the latch clocked by the write strobe.
- Keep the read of a write-only PPI control register as it is (it returns 0 rather than the floating
  bus): that is P2.15, and the two behaviour changes should not travel in one commit.

Snapshots need no format change. `Storage.get_state()` reads all 256 ports through `IO.input()` and
`Storage.set_snapshot()` replays them through `IO.output()`, and the strict decoding turns that pair
into exactly the right thing: a read of an address that selects nothing answers the floating bus and
a write to it is lost, so a dump carries the state of the devices the machine has — the `0xF0` latch
of the upgraded machine included — and the filler an older `.sav` keeps in the unused cells cannot
reach them. The old mask did the opposite: the `0xFF` filler of `0xE0..0xEF` folded onto
`0xC0..0xD3` and overwrote the real registers of the machine, which is why the palette had to be
patched back to its default on every load.

**Implementation:** `src/io.js` (`decode_port()`, `BLOCK_ENABLE_MASK`, `BLOCK_SELECT_MASK`,
`REGISTER_MASK`, `FLOATING_BUS`, `NO_DEVICE` and comments citing `docs/cpu_pio.md`), `src/config.js`
(`io.extended_port_latch` replaces `io.allow_brief_decoding`), `test/config.test.js`, six cases in
`test/io.test.js` (the block table, the `A2`/`A3` mirrors, nothing selected, the latch absent on the
serial machine and present on the upgraded one, `OUT 0F0H` no longer reaching `0xD0`, the bit
set/reset register through a mirror), two integration cases in `test/screen.test.js` (`OUT 0F0H`
switching the video mode of P2.13 on the upgraded machine, and being lost on the serial one) and two
in `test/storage.test.js` (a snapshot round-trip of the latch, the palette workaround).
`src/storage.js` only gained a comment.

Verified against the build without the change by running both bundled dumps (`mtrack`, `aerco1`)
through the real `ComputerProfile` for 360 frames and hashing the memory, the video memory, the
screen and the CPU state: identical, byte for byte. The only visible difference is the answer of
`IN 0F0H` — the floating bus now, instead of the keyboard register the old mask folded it onto — and
the snapshot, which stores the floating bus in the cells that select nothing.

#### P2.16 The machine with the upgrades cannot be selected — ✅ done

`src/main.js` always built `new Emulator()`, i.e. the `default` settings and the `pc01_lvov_80`
profile; the `pc01_lvov_80_fixed` machine was only reachable by constructing the emulator with
`'standard_fixed'`, or by loading a dump that carries that profile (`Computer.restart(dump.profile)`).
With the port `0xF0` latch being a property of the upgraded machine (P2.13, P2.14), the 512×256 mode,
the screen blanking and the extended RAM banks were unreachable in the shipped build.

**Fix:** the page now has a **Machine** selector (`<select id="machine_select">` in `.row_2` of
`index.html`) whose options carry the profile names. `Settings.controls.machine_select` and
`DomResolver` resolve it like the other controls, `UiBinding` gains an `onMachine()` handler, and
`ComputerProfile.onMachine()` passes the choice on to the owner of the profile — the machine is not a
property of the running one, switching rebuilds the whole emulator. `Computer.select_machine()`
restarts the profile of the chosen model (`restart(profile)`) and resumes it. It boots into the ROM
*without* replaying the attached dump, because a dump names the machine it was taken from: the two
bundled dumps come from serial machines and are not replayed after a switch.

Verified in headless Chrome: the selector offers both models, the serial machine boots and paints,
each switch rebuilds the emulator and paints the new machine, switching back works, and the console
stays clean.

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

**Follow-up: the pipeline repairs were reverted by ear, and the original generation is back.** The
author compared this emulator against the build of `356a48b` - where the sound came from the code it has
always had - and preferred it, so the arithmetic of that generation was ported into `src/beeper.js`. The
injected `Clock` and sink stay: the original read the static counters of `I8080` directly and owned its
own `AudioContext`, and those two couplings were removed in P0.2 and P2.6. Kept deliberately, with their
consequences: a unipolar wave (a DC offset), a phase restart in every frame (a ~50 Hz amplitude
modulation, the "body" of the sound), a fixed 44100 Hz output, an integer number of cycles per sample
(round(2.2e6/44100) = 50, so a 1000 Hz tone renders at ~984 Hz) and a frame of 897 samples = 20.34 ms
which overlaps the next one by ~0.34 ms. A repeated write extends the open run, and the tail of a frame
is zero rather than a held level. The frame-exact framing, the fractional carry, the bipolar wave and the
device sample rate stay in the history (branch `feature/sound-work`) for the day the sound can be judged
against a reference recording. The judgement was made by ear instead, and it went the other way: see the
closing note of this item - the exact rendering is the default now (`9b09f51`).

The pitch of a tone is the machine's cycle rate divided by twice the length of its loop, so it follows
the CPU model: with the video/RAM contention of P2.11 (the default) ROM-driven tones keep the nominal
pitch, while music whose generator lives in RAM is slowed together with the work - the hardware's
behaviour, and the test melody is of the second kind (99 % of its toggles come from RAM).

What the beeper did not model at that point was the emitter itself: the samples went into the Web Audio
graph as raw square waves. That is what P3.11 adds.

**The exact rendering replaced the original generation (`9b09f51`).** Five properties of the original
generation were turned the other way round, so that every level change the machine makes reaches the
output unchanged:

- every change is sampled with a fractional carry: no 50-cycle grid, nothing merged, nothing rounded;
- a frame is exactly `frame_duration x sample_rate` samples (20.00 ms at the device rate), so frames
  neither overlap nor leave a gap - the original emits 897 samples (20.34 ms) per 20 ms frame;
- the wave is bipolar (`+/-VOLUME/2`), so no DC offset is added where buffers meet;
- the level is carried across frames and a frame is emitted even when nothing changed, so the stream is
  continuous; a held level is a constant, i.e. silence;
- buffers are queued on the audio clock with a 50 ms lead, and a buffer more than 0.5 s ahead (a
  catch-up burst after a stall) is dropped instead of rewinding the schedule.

The pieces only work together, which is why they failed one at a time before. The queue was blamed for
the overlapping notes, but the real cause was the doubled animation loop (`603b937`); and the queue
cannot stay balanced with the original framing anyway, because 20.34 ms of audio produced every 20 ms
runs it dry every few seconds - that is a gap, not a click. The held-level frame produced a constant
buzz because with a unipolar wave and a zero tail every frame ended in a step down to zero.

Measured on the same tape (`almazy_lviv.lvt`, 15 emulated seconds, wait states on, `speed_factor` 1.0):
the machine's level changes are unchanged (466/s), but all 750 frames now hand over a buffer instead of
262 of them. Judged against `d6678ce` - where the original generation was still the default - and
then adopted: the exact rendering is the clean one. The "body" of the original sound was the per-frame
phase restart, which it removes; this is the sound the emulator ships now.

#### P3.11 Piezo emitter model — ✅ done

The beeper fed its raw 1-bit square wave straight into the Web Audio graph, i.e. the emulator had no
emitter at all. The real PC-01 does **not** drive the TV speaker (an earlier note in this document
said so and was wrong): the sound leaves the mainboard through an **open-collector gate** (D29,
К155ЛА8/7401) whose inputs are **PC0** and **PB7** of the main PPI (see P3.12) and reaches the emitter
via the **BUZZER** pin (16) of the keyboard connector - so the emitter sits on the keyboard PCB, and it
is a built-in **piezo emitter** (the manual speaks of «динамик (капсуль)»).

**The emitter is a ЗП-1 piezo capsule.** What the part data says (technical conditions 12МО.081.085 ТУ,
the designation the manufacturer uses, plus the listings that quote them):

- passive, no built-in oscillator: it needs an external pulse, which is exactly what the gate provides;
- **resonance range 3-5 kHz**, sound pressure at least **75 dB at 100±3 cm**, nominal voltage **5±2 V**;
- operating range -30…+60 °C, mass up to 5 g, soldered to the board with two leads;
- the same capsule can also be used in a three-wire circuit with feedback for a self-oscillating
  generator, but the PC-01 does not use that: the capsule is driven from the gate as a plain two-wire
  load, which is what the schematic shows.

Two published figures disagree and both are kept here: the TU gives the 3-5 kHz above, while several
reseller pages give "resonance 1000…3000 Hz" and a 39x4 mm disc and put the difference down to batches
or to the way the resonance is measured. The spread over specimens is therefore somewhere in 1-5 kHz,
and the first version of the model below - built on the reseller figure - was one end of that range
rather than simply a mistake.

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
square wave - the open-collector output pulls the line low through the transistor while the rising edge
is the (unseen) pull-up charging the capacitance of the capsule, i.e. an RC charge. The missing values
are the pull-up resistor of the gate, the series resistor next to the capsule (R14 on the keyboard
board) and the capacitance of the capsule. One constraint follows from the band itself: for a 3-5 kHz
resonance to survive at all, the RC time constant has to stay well below a quarter of a period
(τ ≲ 20-30 µs), which for a capsule of a few tens of nF means a pull-up of about 1 kΩ rather than tens
of kΩ.

Implementation (`src/audioSink.js`) - a chain of biquads in front of the output, with the resonance
taken from the part data:

| Stage | Type | Frequency | Notes |
| --- | --- | --- | --- |
| DC blocker (optional, `allow_highpass_filter`) | highpass | 20 Hz | only needed in `flat` mode: a piezo is capacitive and blocks DC by itself |
| Low end | highpass | 700 Hz | below the resonance; the TU says nothing about the skirt, so it stays well under the band |
| Resonance | peaking | 3500 Hz, +5 dB, Q 0.8 | inside the 3-5 kHz band of the TU, broad enough to cover it |
| Top end | lowpass | 8000 Hz | rolls off instead of ringing |

`beeper.speaker_model` in `src/settings.js` switches between `'flat'` (**the default**: the unfiltered
square wave) and `'piezo'` (the model above, opt-in); an unknown value throws `RangeError` in `Config`.
No filtering is the default because the model has never been compared against a real capsule and the
response of the mounted one is unknown: the emitter is real, the numbers are not measured. Where the
sound does come from is settled elsewhere: the ROM's BEEP routine runs from ROM and is therefore not
slowed by the video/RAM contention (P2.11), so its tones keep the nominal pitch.

Measured by rendering tones through the real chain in an `OfflineAudioContext` (level relative to
`flat`, which is flat by definition):

| 100 Hz | 200 Hz | 400 Hz | 1 kHz | 2 kHz | 3 kHz | 6 kHz | 10 kHz | 15 kHz |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| −33.7 dB | −21.4 dB | −8.5 dB | +2.0 dB | +3.3 dB | +5.4 dB | +3.9 dB | −2.9 dB | −15.8 dB |

Low notes are attenuated and the 3-5 kHz region is lifted: the thin, sharp character of a ringer
capsule, without pushing the fundamental of the software's notes out of the picture. One earlier variant
did push it out - treating the rated 3-5 kHz band as a *passband* (highpass at 3000 Hz, lowpass at
5000 Hz) left a 550 Hz note at −29 dB with its 7th harmonic as the loudest component and a 300 Hz note at
−40 dB with its 9th, which sounds like a pinched whistle instead of a melody. The TU does not describe
the skirt below the resonance, so the low cut stays where the measurement says the notes survive: with
700 Hz the fundamental of the test melody sits at −2.8 dB and remains the loudest part of the note.
Tests (`test/audioSink.test.js`): the chain of each model, that it is built once, that `flat` builds no
nodes, and that the DC blocker stays independent of the model.

**Where the further work went.** The emitter model was developed further in one session - the ЗП-1 TU
data, the 3-5 kHz band, the response tables, the batch spread, the failed held-level experiment - and
then reverted, because without a recording or a measured curve of the real capsule none of it could be
checked, and two rounds of tuning by reasoning made the sound worse before they were measured. Code and
notes of that session are on branch `feature/sound-work` (tag `sound-session-2026-10-04`); the emulator
itself renders the sound exactly now (P3.10, `9b09f51`) and models the video/RAM
contention (P2.11), with no emitter filtering by default. The `'piezo'` model is an option and now follows
the band of the TU (the table above, measured); the shape of the curve of the mounted capsule, its level
and the RC of its drive are still unverified, which is why filtering is not the default until a recording
of a real machine can be compared against.

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
hands it to the beeper only when it changes. The schematic is the source of the fact and the comment in
`src/io.js` says so. The old
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

**Symptom.** With a `.lvt` application (`almazy_lviv.lvt`, a local tape image - the melody on its splash
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

The reproduction harness behind the table is a throwaway script; if the audio-clock queue is brought back,
it is the starting point for a regression check.
