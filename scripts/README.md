# scripts

Development and verification helpers. Nothing here is part of the application; they exist
to measure and to check what the emulator does, and they are the base for the CI job of
P2.10 (see `CODE_REVIEW.md`).

Run them from the repository root with `node scripts/<name>.mjs` (or through the npm
aliases in `package.json`).

The headless emulator core they drive is a public API in [`src/core.js`](../src/core.js)
(`createCore`, `boot`, `load`); `test/helpers.js` re-exports it for backwards
compatibility.

| Script | What it does |
| --- | --- |
| `browser-check.mjs` | Serves `dist/`, boots it in headless Chrome over the DevTools protocol, presses a key and asserts that the canvas exists, that it is painted and that the console stayed clean. Non-zero exit on failure: `npm run build && npm run check` |
| `audio-response.mjs` | Measures the frequency response of the `AudioSink` chain in a real browser (`OfflineAudioContext`), relative to the unfiltered output, for the current `speaker_model` and for `flat`. Needs Chrome: `npm run audio:response` |
| `melody-audio.mjs` | Runs the headless core (from `src/core.js`), plays a tape image through the real load path (header kind, `launch_tape()`), records every buffer the beeper hands to the sink, writes a WAV of what the sink would output and prints the metrics used in the sound work: frames per second, instructions per frame, note frequencies, overlap, RMS. `npm run audio:melody -- --app <your-tape>.lvt` |
| `mcp-server.mjs` | A Model Context Protocol server over stdio: exposes the headless core to AI tools (Claude Desktop, Claude Code, Cursor, VS Code agents). Tools: `load_snapshot`, `run_cycles`, `read_memory`, `write_memory`, `read_port`, `write_port`, `key_press`, `key_tap`, `screenshot`, `dump_state`, `reset`. `npm run mcp` |

Notes:

- `browser-check.mjs` and `audio-response.mjs` start and stop their own servers and browser
  processes, including a temporary Chrome profile; they need `google-chrome` (override with
  `--chrome <path>`).
- `melody-audio.mjs` needs a tape image (a `.lvt` file); the one used during the sound work is not
  part of the repository, so pass your own with `--app <file.lvt>`.
- `melody-audio.mjs --no-wait-states` runs the machine without the video/RAM contention of
  P2.11, which is how the numbers of the two models were compared.
- `melody-audio.mjs --frame <50hz|48.83hz>` picks the video frame (P2.20). Without it the tool
  runs the frame the settings ask for, which is the 20 ms (`50hz`) one by default.
- `mcp-server.mjs` speaks JSON-RPC on stdin/stdout and must be launched by an MCP client, not
  from a shell (a shell launch would just sit there waiting for protocol messages). Configure
  the client with `command: node`, `args: ["<repo>/scripts/mcp-server.mjs"]`. Optional
  environment: `EMU_PROFILE` (default `standard`), `EMU_WAIT_STATES=1` (video/RAM
  contention, P2.11), `EMU_FRAME=50hz|48.83hz` (video frame, P2.20). Together
  `EMU_WAIT_STATES=1 EMU_FRAME=48.83hz` gives the hardware-faithful machine.
