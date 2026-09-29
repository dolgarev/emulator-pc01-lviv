# Emulator PC-01 Lviv — Review, Roadmap and Backlog

> Date: 2026-09-26
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
- ⏳ Tests
- ⏳ Architecture documentation

**Next steps:**
1. Finish Phase 3: add tests, move the CPU to a Web Worker, improve the game loop
2. Start Phase 2: add PWA support
3. Consider the rendering optimizations in P3 (by priority)

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
"extract-data": "node scripts/extract-binaries.js",
"lint": "eslint src",
"format": "prettier --write \"src/**/*.js\""
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
- ⏳ ES6+ classes — 18/19, `i8080.js` remains
- ⏳ `evt.which` → `evt.code` (currently `evt.keyCode`)
- ✅ `webkitImageSmoothingEnabled` → `imageSmoothingEnabled`
- ✅ Typos (`standart`, `Unknownn`)

**3.4. Tests — ⏳**
- ⏳ Unit tests for I8080 (CPU exerciser)
- ⏳ Tests for Memory, IO
- ⏳ Integration test: snapshot load → correct CPU/memory state

---

## Review findings and improvement backlog

Priority legend: **P0** critical, **P1** high maintainability impact, **P2** structural,
**P3** polish / features. Status: ✅ done, ⏳ pending. Completed items have been moved to the
[Completed](#completed) section at the end of this document.

### P1 — Highest maintainability impact

#### P1.2 `i8080.js` is an ES3-style monolith (1179 lines) — ⏳

The only file still written as `function I8080` + `prototype`. It mixes responsibilities: register
accessors (dozens of `get_b`/`set_b`/`get_af`/…), flag handling, lookup tables (`parity_table`,
`half_carry_table`), opcode fetch, and a ~900-line `switch` in `execute()`. Related legacy style:
`store_flags()` has no-op `else` branches; `var` declarations were re-scoped to `let`/`const` with
`{}` blocks inside `case`.

**Suggested fix (incremental, without losing speed):**
1. Convert to `class I8080`; move lookup tables to `static` fields or a separate module.
2. Extract flag operations into a `Flags` helper.
3. Extract the opcode dispatcher into a separate `opcodes.js` module (or table-driven form) so the
   core becomes testable per-opcode.

### P2 — Structural improvements

#### P2.1 Game loop: `setTimeout` → `requestAnimationFrame` → `setTimeout` — ⏳

`computerProfile.js` chains three timers (`timers.interrupt` / `animation` / `restart`). It is
fragile (drift, races on suspend/resume), and `run()` throws when suspended.

**Suggested fix:** a single `requestAnimationFrame` with a fixed-timestep accumulator and a dynamic
number of CPU cycles per frame.

#### P2.3 Magic numbers and strings — ⏳

- `memory.js`: memory maps `80/144/256`, string aliases `'standard'/'default'`, bit arithmetic like
  `((... & 0x07) - 4)`; 16+ copy-pasted `new MemPage({ begin: 0xc000 })` blocks.
- `keyboard.js`: masks such as `0x23ff` with no documented format.
- `io.js`: port bits are partly named, but `0xd0/0xd1/0xd2` decoding is scattered.

**Suggested fix:** named constants (`MEM_MAP.STD_80`, `EXTENDED_MODE_BIT`, `PORT.MEDIA`, …); build
the memory page layout with a loop instead of manual repetition.

#### P2.5 Web Worker for CPU emulation — ⏳

Move `I8080.run()` into a Web Worker so heavy computation does not block the main thread, improving
UI responsiveness.

#### P2.10 `.editorconfig` and CI — ⏳

Add `.editorconfig` and a GitHub Actions workflow for linting.

### P3 — Polish, features and rendering ideas

#### P3.1 `keyboard.js`: deprecated `evt.keyCode` + manually unrolled loops — ⏳

- `evt.keyCode` is deprecated (migration to `evt.code` was already planned).
- `get()` contains manually unrolled `if` blocks with a 2012-era Chrome-profiler comment — an
  obsolete optimization that hurts readability.
- The key map is a huge literal of magic masks.

**Suggested fix:** use `evt.code`; move the key map into data (JSON/table); collapse the unrolled
loops back (re-verify on a modern engine).

#### P3.2 Dead code — ⏳

- `store_flags()` — the `else f &= ~F_*` branches are no-ops (`f` starts at 0).
- `viewport.js:22,24` — `_ASPECT_RATIO_1_1` and `_ASPECT_RATIO_16_9` are declared but unused.
- `local_load_button_handler` — removed with the P0.1 fix.

#### P3.3 Consolidate utilities — ⏳

- `validateFileHeader`, `generateScreenshotFilename`, `getFileExtension` live at the bottom of
  `computerProfile.js` but are standalone utilities → move to `src/utils/`.
- `Config` copies props via `Object.defineProperty` in a loop — simplify and freeze the result.
- `Notify` is a singleton via a static field and `create()` returns the instance (return ignored) —
  simplify.
- Mixed RU/EN comments — pick one convention.

#### P3.4 Typing and documentation — ⏳

Add JSDoc/TypeScript types at least for public interfaces (`Settings`, `Memory`, `I8080`). The
README was rewritten for v2.0 (installation, controls, file formats, architecture, credits, license);
an `ARCHITECTURE.md` is still missing. Adding screenshots to the README is also pending.

#### P3.5 `get_optcode()` potential infinite loop — ⏳

The loop continues while the fetched opcode equals `UNDEF_OPTCODE`. If `memory_read_byte` ever
returned `0x100` (impossible for a `Uint8Array`, but the contract is undocumented), the loop would
never terminate. Document the contract or add a guard.

#### P3.6 PWA support — ⏳

Add a Service Worker and Web App Manifest for offline use (this is Phase 2 of the Roadmap).

#### P3.7 Dirty rectangle tracking — ⏳

Currently all 65,536 pixels (256×256) are redrawn every frame even if only one pixel changed. Track
the minimal bounding rectangle of changed pixels and update only that region via
`putImageData(image_data, dirtyX, dirtyY, dirtyX, dirtyY, dirtyWidth, dirtyHeight)`.

Notes for PC-01: resolution 256×256; video memory stores 4 pixels per byte → 64 bytes per row; the
coordinate system is non-standard and needs careful handling. **Gain:** largest for text editors,
menus and static screens.

#### P3.8 Rendering improvement ideas

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

#### P3.9 Feature backlog

- **Gamepad support** (Gamepad API) for joysticks.
- **Fullscreen mode** (see P3.8.8).
- **State persistence in localStorage / IndexedDB** — autosave and manual snapshots without the old
  Chrome file system.
- **Responsive design** for different screen sizes, including mobile.
- **Improved audio subsystem** — AudioWorklet instead of `ScriptProcessorNode`/`createBufferSource`;
  volume control; mute.
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

1. **Convert `i8080.js` to a class and extract opcodes** (P1.2) — builds on the new test suite.
2. **Extend the test suite** with the 8080 Exerciser ROM and snapshot fixtures.
3. Tidy the remaining P2/P3 items opportunistically as the code is touched.

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

### P1 — Highest maintainability impact

#### P1.1 No tests (largest gap) and no `test` script — ✅ fixed

Added Vitest (`npm test` / `npm run test:watch`) and a first suite of **41 tests across 7 files**.
They run headless (no DOM) against the decoupled core, using a shared `test/helpers.js`:
- `i8080` — instruction execution: immediates, register moves, arithmetic flags, `JMP`, `CALL`/`RET`,
  `PUSH`/`POP`, `run()` frame stepping, halt;
- `Memory` — RAM read/write, ROM write protection, `restart()`, `transfer()` (Array/DataView, bounds,
  unsupported type), `get_state()` size, video-memory page;
- `Storage` — snapshot size and `get_snapshot()` ↔ `set_snapshot()` round-trip, `.e3` load, rejects;
- `Screen` — `parse_color` and color caches, palette index range, `draw()` dirty tracking;
- `Clock`, `Config`, `Keyboard`.

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

#### P1.7 Deprecated web APIs — ✅ (partial)

`webkitImageSmoothingEnabled` replaced with the standard `imageSmoothingEnabled`. `evt.which` was
replaced with `evt.keyCode` as a tactical fix; full migration to `evt.code` is still pending
(see P3.1).

#### P1.8 Typos and license hygiene — ✅

Typos (`'standart'` → `'standard'`, `'Unknow'`/`'Unknownn'` → `'Unknown'`) fixed across the project.
The `dnd.js` Google/Apache-2.0 header was replaced with the project's GPL-3.0 header; the drag & drop
implementation is independently written (only standard DOM API usage overlaps with the original
sample), with a courtesy attribution kept in the README.

#### P1.9 Grayscale formula in `screen.js` — ✅ (not a bug)

`~~(p & 0x00ff0000 && GRAYSCALE_RED_WEIGHT) + …` uses logical `&&` rather than multiplication. This
was investigated and confirmed to be an **intentional emulation feature**: it produces a brighter
image resembling a real PC-01 black-and-white TV. Replacing it with correct weights makes the image
too dark. The code is kept as is with an explanatory comment.

### P2 — Structural improvements

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
