# scripts

Development and verification helpers. Nothing here is part of the application; they exist
to measure and to check what the emulator does, and they are the base for the CI job of
P2.10 (see `CODE_REVIEW.md`).

Run them from the repository root with `node scripts/<name>.mjs` (or through the npm
aliases in `package.json`).

| Script | What it does |
| --- | --- |
| `browser-check.mjs` | Serves `dist/`, boots it in headless Chrome over the DevTools protocol, presses a key and asserts that the canvas exists, that it is painted and that the console stayed clean. Non-zero exit on failure: `npm run build && npm run check` |
| `audio-response.mjs` | Measures the frequency response of the `AudioSink` chain in a real browser (`OfflineAudioContext`), relative to the unfiltered output, for the current `speaker_model` and for `flat`. Needs Chrome: `npm run audio:response` |
| `melody-audio.mjs` | Runs the headless core (from `test/helpers.js`), plays a tape image through the real dump path, records every buffer the beeper hands to the sink, writes a WAV of what the sink would output and prints the metrics used in the sound work: frames per second, instructions per frame, note frequencies, overlap, RMS. `npm run audio:melody -- --app <your-tape>.lvt` |

Notes:

- `browser-check.mjs` and `audio-response.mjs` start and stop their own servers and browser
  processes, including a temporary Chrome profile; they need `google-chrome` (override with
  `--chrome <path>`).
- `melody-audio.mjs` needs a tape image (a `.lvt` file); the one used during the sound work is not
  part of the repository, so pass your own with `--app <file.lvt>`.
- `melody-audio.mjs --no-wait-states` runs the machine without the video/RAM contention of
  P2.11, which is how the numbers of the two models were compared.
