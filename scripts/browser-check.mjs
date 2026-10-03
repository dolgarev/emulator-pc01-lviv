// Smoke check of the built application.
//
// Serves dist/, boots it in headless Chrome over the DevTools protocol, sends a key, lets
// the emulator run for a moment and then asserts that the screen exists, that something is
// painted on it and that the console stayed clean. Exits non-zero on failure, so it can
// gate a CI job (see CODE_REVIEW.md, P2.10).
//
//   npm run build && node scripts/browser-check.mjs [--port 5199] [--chrome <path>] [--no-sandbox]
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createProbe } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};

const PORT = Number(option('port', 5199));
const CHROME = option('chrome', '/usr/bin/google-chrome');
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'pc01-check-'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A previous run may have left its server behind, so take the first free pair instead of
// failing on a busy port.
const isFree = (port) =>
  new Promise((resolve) => {
    const probe = createProbe();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });

let app_port = PORT;
let DEBUG_PORT = app_port + 100;
for (let attempt = 0; attempt < 20; attempt++) {
  if ((await isFree(app_port)) && (await isFree(DEBUG_PORT))) break;
  app_port += 1;
  DEBUG_PORT = app_port + 100;
}

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

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
};

// A static server is enough: the application is a plain SPA with data files under /data.
const server = createServer((request, response) => {
  const url = new URL(request.url, `http://localhost:${app_port}`);
  let file = path.join(DIST, decodeURIComponent(url.pathname));

  if (!file.startsWith(DIST)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');

  if (!fs.existsSync(file)) {
    response.writeHead(404).end('not found');
    return;
  }

  response.writeHead(200, {
    'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
  });
  fs.createReadStream(file).pipe(response);
});

// A container (CI) usually cannot use the Chrome sandbox; locally it stays on.
const NO_SANDBOX = args.includes('--no-sandbox') || process.env.CI === 'true';

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-dev-shm-usage', // containers often have a small /dev/shm
    ...(NO_SANDBOX ? ['--no-sandbox'] : []),
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
  server.close();
  fs.rmSync(PROFILE, { recursive: true, force: true });
};
process.on('exit', cleanup);

try {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    throw new Error('dist/index.html is missing - run "npm run build" first');
  }

  await new Promise((resolve) => server.listen(app_port, resolve));

  if (!(await waitFor(`http://127.0.0.1:${DEBUG_PORT}/json/version`))) {
    throw new Error(`Chrome did not open its debug port (${CHROME})`);
  }

  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));

  let id = 0;
  const pending = new Map();
  const console_errors = [];
  let favicon_404 = false;

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      console_errors.push(message.params.exceptionDetails.text ?? 'exception');
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      console_errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    }
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      const entry = message.params.entry;

      // The application ships no favicon, so the browser asks for /favicon.ico and gets a 404
      // from any static server; it is noise, not a defect, and is reported separately below.
      if (entry.url?.endsWith('/favicon.ico')) {
        favicon_404 = true;
        return;
      }

      console_errors.push(`[${entry.source}] ${entry.text}${entry.url ? ` (${entry.url})` : ''}`);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const message_id = ++id;
      pending.set(message_id, resolve);
      ws.send(JSON.stringify({ id: message_id, method, params }));
    });

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    return result.result?.result?.value;
  };

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: `http://localhost:${app_port}/` });

  // Wait for the application to boot and draw its first frames.
  await sleep(2500);

  const canvas = await evaluate(`(() => {
    const canvas = document.querySelector('canvas');
    return canvas ? { width: canvas.width, height: canvas.height } : null;
  })()`);
  console.log(`info serving on port ${app_port}, Chrome debug port ${DEBUG_PORT}`);
  check(
    canvas !== null,
    `the emulator created a canvas (${canvas ? `${canvas.width}x${canvas.height}` : 'none'})`
  );

  const sample = async () =>
    evaluate(`(() => {
      const canvas = document.querySelector('canvas');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = 0;
      let hash = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] || data[i + 1] || data[i + 2]) painted += 1;
        hash = (hash * 31 + data[i]) | 0;
      }
      return { painted, hash };
    })()`);

  const first = await sample();
  check(
    first.painted > 0,
    `the screen is painted (${first.painted} of ${canvas ? canvas.width * canvas.height : 0} pixels)`
  );

  // A key press, then a moment of emulation.
  await send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    code: 'Space',
    key: ' ',
    windowsVirtualKeyCode: 32,
  });
  await sleep(200);
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    code: 'Space',
    key: ' ',
    windowsVirtualKeyCode: 32,
  });
  await sleep(1200);

  const second = await sample();
  console.log(
    `info the screen ${first.hash === second.hash ? 'did not change' : 'changed'} after the key press`
  );
  if (favicon_404) console.log('info the favicon 404 was ignored (the app ships no favicon)');

  check(
    console_errors.length === 0,
    console_errors.length === 0
      ? 'the console stayed clean'
      : `console errors: ${console_errors.slice(0, 3).join(' | ')}`
  );
} catch (error) {
  check(false, error.message);
} finally {
  cleanup();
  console.log(
    failures.length === 0 ? '\nbrowser check passed' : `\nbrowser check failed (${failures.length})`
  );
  process.exit(failures.length === 0 ? 0 : 1);
}
