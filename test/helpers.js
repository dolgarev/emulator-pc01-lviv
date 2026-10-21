// Backwards-compatible re-export of the public headless API (P3.17).
//
// The core moved to `src/core.js` so scripts and dev tools can import it from a stable,
// non-test location. Tests and scripts that already import from `test/helpers.js` keep
// working unchanged; new tooling should import `{ createCore }` from `../src/core.js`.
export { createCore, boot, load } from '../src/core.js';
