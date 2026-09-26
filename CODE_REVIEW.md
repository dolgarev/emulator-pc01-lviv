# Code Quality & Architecture Review

> Date: 2026-09-26
> Branch: `dev-spa-version`
> Scope: all 19 modules in `src/` plus `index.html`
> Related: `IMPROVEMENTS.md` (RU), `MIGRATION_PLAN.md` (RU)

## Executive summary

The project has already undergone a significant modernization pass: ES modules, classes,
dependency injection via `ComputerProfileBuilder`, binary data extracted into `.bin` files, and
a clean split into components (Memory / IO / CPU / Screen / Viewport / Beeper / Keyboard / Tape /
DnD / Storage / Traps). The overall architecture is sound.

However, underneath the new code there remains a legacy foundation, along with a few **real bugs
and hidden couplings**. The recommendations below are ordered by priority.

---

## P0 — Real bugs and hidden coupling

### 1. Event-listener leak in `computerProfile.js`

**What:** In `initAsync()` a `document`-level listener is registered but never removed:

```js
document.addEventListener('ui:click:load_button', clickOnLoadButtonHandler);
```

`clickOnLoadButtonHandler` is an anonymous arrow function; the reference is not stored anywhere.

**Bug:** `terminate()` attempts to clean up via `this.local_load_button_handler`, but that field
is **never assigned** anywhere in the codebase (verified by grep — only read inside `terminate()`).
The cleanup branch is dead code.

**Impact:** Every `restart()` (dump/profile switch) adds new listeners to `document`, causing
duplicate firings and a memory leak.

**Suggested fix:** store handler references in fields and remove them explicitly; use
`AbortController`/`AbortSignal` to group listeners for bulk removal. Delete the dead
`local_load_button_handler` branch.

### 2. Static `I8080` cycle counters couple CPU ↔ Beeper

**What:** `I8080.total_cpu_cycles` and `I8080.start_frame` are mutable static class fields.
`Beeper.process()` reads them directly (`beeper.js:150`), while `i8080.js` increments/resets them.

**Impact:** This is an implicit cross-module dependency through shared mutable class state. It is
not thread-safe, cannot be tested in isolation, and makes the Beeper depend on the CPU's internal
cycle accounting.

**Suggested fix:** introduce an explicit `Clock`/`CycleCounter` object injected into both CPU and
Beeper; remove the static fields.

---

## P1 — Highest maintainability impact

### 3. No tests (largest gap) and no `test` script

**What:** The core — the 8080 CPU, memory paging, I/O ports, snapshot format — has **zero tests**.
There is no `"test"` script in `package.json`.

**Impact:** Any refactoring is done blind; regressions are easy to introduce without noticing.

**Suggested fix:** add Vitest and write:
- unit tests for `i8080` (the 8080 Exerciser ROM already credited in the file header is an ideal
  oracle);
- `Memory` tests (paging, VRAM/ROM, strict mode);
- a round-trip test for `Storage.get_snapshot` ↔ `set_snapshot`;
- `Screen.compute_color_index` palette tests.

### 4. `i8080.js` is an ES3-style monolith (1179 lines)

**What:** The only file still written as `function I8080` + `prototype`. It mixes responsibilities:
register accessors (dozens of `get_b`/`set_b`/`get_af`/…), flag handling, lookup tables
(`parity_table`, `half_carry_table`), opcode fetch, and a ~900-line `switch` in `execute()`.

**Suggested fix (incremental, without losing speed):**
1. Convert to `class I8080`; move lookup tables to `static` fields or a separate module.
2. Extract flag operations into a `Flags` helper (it currently contains dead `else` branches).
3. Extract the opcode dispatcher into a separate `opcodes.js` module (or table-driven form) so the
   core becomes testable per-opcode.

### 5. `Storage` methods invoked via `.call(this)`

**What:** `Storage.get_snapshot.call(this)`, `Storage.bload.call(this, data)`, etc. (5 call sites).
These static methods require `this` to be a `ComputerProfile` with `cpu`/`memory`/`io` fields.

**Impact:** A stateless class whose methods depend on a foreign `this` is a classic code smell and
is fragile to refactor.

**Suggested fix:** turn them into plain functions with explicit arguments `(profile, data)` or into
`ComputerProfile` instance methods; remove `.call`.

### 6. Duplicated type-check boilerplate

**What:** The pattern `if (!(x instanceof Config)) throw new Error(...)` is repeated **9+ times**
for `Config` alone (plus many more for other types), in virtually every constructor.

**Suggested fix:** a single `assertInstance(value, Type, label)` helper in `src/utils/assert.js`, or
a step toward JSDoc/TypeScript typing.

---

## P2 — Structural improvements

### 7. `Settings` mixes data and DOM

**What:** `Settings` stores configuration but `init()` calls `document.getElementById(...)` and
mutates `node` fields, throwing when elements are missing.

**Impact:** Settings cannot be instantiated outside a browser and cannot be unit-tested.

**Suggested fix:** split into a pure config object plus a `DomResolver`/`UI` bootstrap that locates
elements and passes them into components.

### 8. Magic numbers and strings

- `memory.js`: memory maps `80/144/256`, string aliases `'standard'/'default'`, bit arithmetic like
  `((... & 0x07) - 4)`; 16+ copy-pasted `new MemPage({ begin: 0xc000 })` blocks.
- `keyboard.js`: masks such as `0x23ff` with no documented format.
- `io.js`: port bits are partly named, but `0xd0/0xd1/0xd2` decoding is scattered.

**Suggested fix:** named constants (`MEM_MAP.STD_80`, `EXTENDED_MODE_BIT`, `PORT.MEDIA`, …); build
the memory page layout with a loop instead of manual repetition.

### 9. Game loop: `setTimeout` → `requestAnimationFrame` → `setTimeout`

**What:** `computerProfile.js` chains three timers (`timers.interrupt/animation/restart`). It is
fragile (drift, races on suspend/resume), and `run()` throws when suspended.

**Suggested fix:** a single `requestAnimationFrame` with a fixed-timestep accumulator (already noted
in `IMPROVEMENTS.md` §26).

### 10. `Memory.transfer()` returns `offset` or `false`

**What:** The method returns the new offset on success and `false` for an invalid data type; callers
ignore the return value.

**Suggested fix:** throw on invalid input (consistent with the rest of the codebase) and always
return the offset.

---

## P3 — Polish

### 11. `keyboard.js`: deprecated `evt.keyCode` + manually unrolled loops

- `evt.keyCode` is deprecated (migration to `evt.code` was already planned).
- `get()` contains manually unrolled `if` blocks with a 2012-era Chrome-profiler comment — an
  obsolete optimization that hurts readability.
- The key map is a huge literal of magic masks.

**Suggested fix:** use `evt.code`; move the key map into data (JSON/table); collapse the unrolled
loops back (re-verify on a modern engine).

### 12. Dead code

- `store_flags()` — the `else f &= ~F_*` branches are no-ops (`f` starts at 0).
- `viewport.js:22,24` — `_ASPECT_RATIO_1_1` and `_ASPECT_RATIO_16_9` are declared but unused.
- `local_load_button_handler` — see P0 #1.
- `terminate()` — nulls properties via `'a,b,c'.split(',').forEach(...)` (see `IMPROVEMENTS.md` §13).

### 13. Consolidate utilities

- `validateFileHeader`, `generateScreenshotFilename`, `getFileExtension` live at the bottom of
  `computerProfile.js` but are standalone utilities → move to `src/utils/`.
- `Config` copies props via `Object.defineProperty` in a loop — simplify and freeze the result.
- `Notify` is a singleton via a static field and `create()` returns the instance (return ignored) —
  simplify.
- Mixed RU/EN comments — pick one convention.

### 14. Documentation and typing

- `README.md` is outdated (still references the Chrome Web Store); there is no `ARCHITECTURE.md`.
- Consider JSDoc/TypeScript at least for public interfaces (`Settings`, `Memory`, `I8080`).

---

## Recommended first steps

1. **Add tests** (P1 #3) — provides a safety net for everything that follows.
2. **Fix the listener leak** (P0 #1) — small change, tangible effect.
3. **Remove the `I8080` statics** (P0 #2) — decouples CPU and Beeper.
4. **Convert `i8080.js` to a class and extract opcodes** (P1 #4) — unlocks CPU testing.
