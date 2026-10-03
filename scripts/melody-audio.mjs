// Plays a tape image with the headless core and writes what the sink would output.
//
//   node scripts/melody-audio.mjs [--app <file.lvt>] [--seconds 12] [--out melody.wav]
//                                 [--no-wait-states]
//
// The core comes from test/helpers.js, so this drives the same components the tests do. Every
// buffer the beeper hands to the sink is recorded with the wall clock of the animation frame
// that produced it, and the output is the sum of those buffers placed where they are handed
// over - which is what the sink does with source.start(0). The metrics printed are the ones
// used in the sound work (CODE_REVIEW.md, P3.10/P3.11): frames per second, instructions per
// frame, note frequencies, overlap, level and how much of the audio actually sounds.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};

const APP = path.resolve(ROOT, option('app', 'public/data/apps/almazy_lviv.lvt'));
const SECONDS = Number(option('seconds', 12));
const OUT = path.resolve(process.cwd(), option('out', 'melody.wav'));
const WAIT_STATES = !args.includes('--no-wait-states');

const RATE = 48000;

if (!fs.existsSync(APP)) {
  console.error(`tape image not found: ${APP}`);
  console.error('pass one with --app <file.lvt>, see scripts/README.md');
  process.exit(2);
}

// The core loads the ROM and the dumps over HTTP; serve them from the repository instead.
globalThis.fetch = async (url) => {
  const file = path.join(ROOT, 'public', String(url).split('?')[0].replace(/^\//, ''));
  if (!fs.existsSync(file))
    return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };

  const buffer = fs.readFileSync(file);
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
};

const { createCore } = await import(path.join(ROOT, 'test/helpers.js'));
const { ComputerProfile } = await import(path.join(ROOT, 'src/computerProfile.js'));
const { Rom } = await import(path.join(ROOT, 'src/rom.js'));
const { Tape } = await import(path.join(ROOT, 'src/tape.js'));
const { Dump } = await import(path.join(ROOT, 'src/dump.js'));

class FakeTicker {
  constructor() {
    this.time = 0;
    this.frames = [];
    this.requests = 0;
    this.cancels = 0;
  }

  now() {
    return this.time;
  }

  requestAnimationFrame(handler) {
    this.requests += 1;
    this.frames.push(handler);
    return this.frames.length;
  }

  cancelAnimationFrame() {
    this.cancels += 1;
    this.frames = [];
  }
}

const core = createCore('pc01_lvov_80', { wait_states: WAIT_STATES });
const { config, beeper, keyboard, io, memory, traps, cpu, storage, screen } = core;
const ticker = new FakeTicker();

const plays = [];
beeper.sink = {
  sample_rate: RATE,
  play: (data, rate) => plays.push({ at: ticker.now(), data: Float32Array.from(data), rate }),
};

let frames = 0;
const run = cpu.run.bind(cpu);
cpu.run = (cycles) => {
  frames += 1;
  return run(cycles);
};

// One execute() call per instruction: the contention charges its wait cycles to the frame
// budget, so this is the work the machine really does per frame.
let instructions = 0;
const execute = cpu.execute.bind(cpu);
cpu.execute = (opcode) => {
  instructions += 1;
  return execute(opcode);
};

const profile = new ComputerProfile({
  settings: { tape: { is_connected: false }, dnd: { is_connected: false } },
  profile: config.profile,
  config,
  beeper,
  keyboard,
  keyboard_binding: {},
  io,
  memory,
  rom: new Rom(config, memory),
  traps,
  cpu,
  viewport: { renderScreen() {}, pause() {}, terminate() {}, takeScreenshoot() {} },
  screen,
  tape: new Tape(config),
  dnd: { attachDropHandler() {}, read() {}, close() {} },
  ticker,
  ui: { onLoad() {}, terminate() {} },
  storage,
});

await profile.initAsync();

const image = fs.readFileSync(APP);
const data = new DataView(
  image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength)
);
const dump = Object.create(Dump.prototype);
Object.assign(dump, { type: 'lvt', data });
await profile.load_dump(dump);
profile.run();

const step_ms = 1000 / 60;
let display_frames = 0;

while (ticker.now() < SECONDS * 1000) {
  const handler = ticker.frames.shift();
  if (!handler) break;

  ticker.time += step_ms;
  handler();
  display_frames += 1;

  // Space starts the loading of the tape image in most of the tape-based software.
  if (display_frames === 120) keyboard.press('Space', true, 0);
  if (display_frames === 140) keyboard.press('Space', false, 0);
}

const wall = ticker.now() / 1000;
const wall_samples = Math.ceil(wall * RATE);

// What the sink outputs: every buffer starts as soon as it is handed over, so buffer n
// contributes from plays[n].at onwards, and overlaps are summed as the graph sums them.
const mixed = new Float32Array(wall_samples + RATE);
const active = new Float32Array(wall_samples + RATE);
let audio_seconds = 0;
let sounding = 0;
let sounding_seconds = 0;

for (const play of plays) {
  const start = Math.round((play.at / 1000) * RATE);
  const rate = play.rate ?? RATE;

  audio_seconds += play.data.length / rate;

  let changes = 0;
  for (let i = 1; i < play.data.length; i++) {
    if (play.data[i] !== play.data[i - 1]) changes += 1;
  }
  if (changes > 8) {
    sounding += 1;
    sounding_seconds += play.data.length / rate;
  }

  for (let i = 0; i < play.data.length && start + i < mixed.length; i++) {
    mixed[start + i] += play.data[i];
    active[start + i] += 1;
  }
}

let overlap_samples = 0;
let overlap_max = 0;
let peak = 0;
let sum = 0;
let mean = 0;

for (let i = 0; i < wall_samples; i++) {
  if (active[i] > 1) {
    overlap_samples += 1;
    overlap_max = Math.max(overlap_max, active[i]);
  }
  peak = Math.max(peak, Math.abs(mixed[i]));
  sum += mixed[i] * mixed[i];
  mean += mixed[i];
}

const rms = Math.sqrt(sum / wall_samples);
mean /= wall_samples;

let ac = 0;
for (let i = 0; i < wall_samples; i++) ac += (mixed[i] - mean) ** 2;
ac = Math.sqrt(ac / wall_samples);

// Note frequencies, from the level changes inside each buffer.
const notes = plays
  .map((play) => {
    let changes = 0;
    for (let i = 1; i < play.data.length; i++) {
      if (play.data[i] !== play.data[i - 1]) changes += 1;
    }
    return changes ? changes / (2 * (play.data.length / RATE)) : 0;
  })
  .filter((frequency) => frequency > 100)
  .sort((a, b) => a - b);
const db = (value) => 20 * Math.log10(Math.max(value, 1e-9));

console.log(`app        ${APP}`);
console.log(
  `machine    ${frames} emulated frames (${(frames / wall).toFixed(1)}/s), ` +
    `${instructions} instructions (${(instructions / frames).toFixed(0)} per frame), ` +
    `wait states ${WAIT_STATES ? 'on' : 'off'}`
);
console.log(
  `audio      ${plays.length} buffers handed over, ${audio_seconds.toFixed(2)} s of audio ` +
    `on ${wall.toFixed(2)} s of wall time (${(audio_seconds / wall).toFixed(2)}x), ` +
    `${sounding} of them sounding (${sounding_seconds.toFixed(2)} s)`
);
console.log(
  `overlap    ${((overlap_samples / wall_samples) * 100).toFixed(0)} % of the time, ` +
    `up to ${overlap_max} buffers at once`
);
console.log(
  `level      peak ${peak.toFixed(3)}, RMS ${db(rms).toFixed(1)} dB ` +
    `(${db(ac).toFixed(1)} dB without the DC component)`
);
console.log(
  `notes      ${notes.length}, median ${notes.length ? notes[Math.floor(notes.length / 2)].toFixed(0) : 0} Hz, ` +
    `range ${notes[0]?.toFixed(0) ?? 0}..${notes[notes.length - 1]?.toFixed(0) ?? 0} Hz`
);

// The WAV is peak-normalised so that the timbre is compared rather than the loudness.
const wav = Buffer.alloc(44 + wall_samples * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + wall_samples * 2, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(RATE, 24);
wav.writeUInt32LE(RATE * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);

const norm = peak > 0 ? 0.9 / peak : 1;
for (let i = 0; i < wall_samples; i++) {
  wav.writeInt16LE(
    Math.max(-32768, Math.min(32767, Math.round(mixed[i] * norm * 32767))),
    44 + i * 2
  );
}

fs.writeFileSync(OUT, wav);
console.log(`written    ${OUT}`);
