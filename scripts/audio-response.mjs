// Measures the frequency response of the AudioSink chain in a real browser.
//
//   node scripts/audio-response.mjs [--port 5199] [--chrome <path>]
//
// Starts Vite and headless Chrome, renders tones through the real chain in an
// OfflineAudioContext and prints the level of each one relative to the unfiltered output
// (flat). This is how the response table of CODE_REVIEW.md P3.11 was measured.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};

const PORT = Number(option('port', 5199));
const DEBUG_PORT = PORT + 100;
const CHROME = option('chrome', '/usr/bin/google-chrome');
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'pc01-audio-'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  return false;
}

const vite = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: 'ignore',
});

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

const cleanup = () => {
  try {
    chrome.kill('SIGKILL');
  } catch {
    /* already gone */
  }
  try {
    vite.kill('SIGKILL');
  } catch {
    /* already gone */
  }
  fs.rmSync(PROFILE, { recursive: true, force: true });
};
process.on('exit', cleanup);

try {
  const app = `http://localhost:${PORT}/`;

  if (!(await waitFor(app))) throw new Error(`Vite did not come up on port ${PORT}`);
  if (!(await waitFor(`http://127.0.0.1:${DEBUG_PORT}/json/version`))) {
    throw new Error(`Chrome did not open its debug port (${CHROME})`);
  }

  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));

  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const message_id = ++id;
      pending.set(message_id, resolve);
      ws.send(JSON.stringify({ id: message_id, method, params }));
    });

  await send('Page.enable');
  await send('Page.navigate', { url: app });
  await sleep(2000);

  // The chain is built by the sink from the settings, so the page imports the real modules.
  const expression = `(async () => {
    const { Config } = await import('/src/config.js');
    const { Settings } = await import('/src/settings.js');
    const { AudioSink } = await import('/src/audioSink.js');

    const RATE = 48000;
    const frequencies = [100, 200, 400, 700, 1000, 1500, 2000, 2500, 3000, 4000, 6000, 10000, 15000];

    const rms = async (frequency, model) => {
      const settings = new Settings('default');
      settings.beeper.speaker_model = model;
      settings.beeper.allow_highpass_filter = false;

      const config = new Config(settings, 'pc01_lvov_80');
      const context = new OfflineAudioContext(1, RATE / 5, RATE);
      const sink = new AudioSink(config, context);
      const chain = model === 'piezo' ? sink.createChain() : undefined;

      const oscillator = context.createOscillator();
      oscillator.frequency.value = frequency;
      oscillator.connect(chain ?? context.destination);
      oscillator.start(0);
      oscillator.stop(0.2);

      const rendered = await context.startRendering();
      const data = rendered.getChannelData(0);
      const from = Math.floor(RATE * 0.05); // skip the filter transient
      let acc = 0;
      for (let i = from; i < data.length; i++) acc += data[i] * data[i];

      return Math.sqrt(acc / (data.length - from));
    };

    const result = [];
    for (const frequency of frequencies) {
      const flat = await rms(frequency, 'flat');
      const model = await rms(frequency, 'piezo');
      result.push({ frequency, db: 20 * Math.log10(model / flat) });
    }
    return result;
  })()`;

  const response = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (response.result?.exceptionDetails) {
    throw new Error(
      `page error: ${JSON.stringify(response.result.exceptionDetails).slice(0, 300)}`
    );
  }

  const rows = response.result.result.value;
  console.log('frequency, Hz | level relative to flat, dB');
  for (const row of rows) {
    console.log(`${String(row.frequency).padStart(13)} | ${row.db.toFixed(1).padStart(6)}`);
  }
} catch (error) {
  console.error(`failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  cleanup();
  process.exit(process.exitCode ?? 0);
}
