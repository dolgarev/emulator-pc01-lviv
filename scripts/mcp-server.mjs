#!/usr/bin/env node
// MCP server exposing the headless emulator core to AI tools (P3.17).
//
// Speaks the Model Context Protocol over stdio, so an MCP client (Claude Desktop, Claude
// Code, Cursor, a VS Code agent, ...) can drive the PC-01 "Lviv" emulator: load a
// snapshot, run cycles, read/write memory and I/O ports, press keys and capture a frame.
//
// Register it in the client's MCP config, e.g. Claude Desktop:
//
//   { "mcpServers": { "pc01-lviv": {
//       "command": "node",
//       "args": ["/absolute/path/scripts/mcp-server.mjs"]
//   } } }
//
// Environment (all optional):
//   EMU_PROFILE        Config profile name            (default "pc01_lvov_80")
//   EMU_WAIT_STATES=1  video/RAM contention (P2.11)  (default off)
//   EMU_FRAME          50hz | 48.83hz                (default 50hz)

import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createCore } from '../src/core.js';

const core = createCore(process.env.EMU_PROFILE || 'pc01_lvov_80', {
  wait_states: process.env.EMU_WAIT_STATES === '1',
  frame: process.env.EMU_FRAME || '50hz',
});
// Headless tooling does not play audio; silence the level recorder, exactly as the game
// patcher's verify.mjs / screenshots.mjs do.
core.beeper.process = () => {};

// Upper bound shared by the `cycles` schema and the runtime check, so a debugger cannot ask
// for a run long enough to block the stdio transport for minutes (CODE_REVIEW.md B13).
const MAX_CYCLES = 10_000_000;

// ---------------------------------------------------------------- helpers

function hex(value, width = 2) {
  return value.toString(16).padStart(width, '0').toUpperCase();
}

function hexDump(bytes) {
  return bytes.map((byte) => hex(byte)).join(' ');
}

function stateText() {
  const s = core.cpu.get_state();
  return [
    `PC=${hex(s.PC, 4)}  SP=${hex(s.SP, 4)}`,
    `AF=${hex(s.AF, 4)}  BC=${hex(s.BC, 4)}  DE=${hex(s.DE, 4)}  HL=${hex(s.HL, 4)}`,
    `IFF=${s.IFF}  halted=${Boolean(core.cpu.is_halted)}`,
  ].join('\n');
}

function intArg(value, name, { min = 0, max = 0xffff } = {}) {
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  if (value < min || value > max) {
    throw new Error(`${name} is out of range ${min}..${max}`);
  }
  return value;
}

function parseBytes(args) {
  if (Array.isArray(args.bytes)) {
    return args.bytes.map((byte) => intArg(byte, 'bytes[]', { min: 0, max: 0xff }));
  }
  if (typeof args.hex === 'string') {
    const text = args.hex.replace(/\s+/g, '');
    if (text.length === 0) {
      throw new Error('hex must not be empty');
    }
    if (!/^[0-9a-fA-F]+$/.test(text)) {
      throw new Error('hex must contain only hex digits (0-9, a-f, A-F), without a 0x prefix');
    }
    if (text.length % 2 !== 0) {
      throw new Error('hex must have an even number of digits');
    }
    const bytes = [];
    for (let i = 0; i < text.length; i += 2) {
      const byte = parseInt(text.slice(i, i + 2), 16);
      if (!Number.isFinite(byte)) {
        throw new Error(`hex contains an invalid byte at offset ${i}`);
      }
      bytes.push(byte);
    }
    return bytes;
  }
  throw new Error('provide `bytes` (array of 0..255) or `hex` (string)');
}

function assertSnapshot(buffer) {
  if (buffer.length < 0x1411d) {
    throw new Error(`not a snapshot: ${buffer.length} bytes is too short`);
  }
  if (buffer.subarray(0, 9).toString('latin1') !== 'LVOV/DUMP') {
    throw new Error('not an LVOV snapshot (header must start with "LVOV/DUMP")');
  }
}

// ---------------------------------------------------------------- PNG writer

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function pngBuffer(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// `Screen.takeFrame()` returns the current framebuffer without advancing the machine:
// `draw()` is incremental (null = "nothing changed"), but the pixel buffer always holds the
// last rendered picture, and the refresh touches no clock, CPU or memory state, so a
// screenshot must not run the CPU or change the machine (CODE_REVIEW.md B6).
function frameToPng(scale) {
  const ps32 = core.screen.takeFrame();

  const srcWidth = core.screen.width;
  const srcHeight = core.screen.height;
  const width = srcWidth * scale;
  const height = srcHeight * scale;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < width; x += 1) {
      const p = ps32[sy * srcWidth + Math.floor(x / scale)];
      const o = (y * width + x) * 4;
      rgba[o] = (p >> 16) & 0xff;
      rgba[o + 1] = (p >> 8) & 0xff;
      rgba[o + 2] = p & 0xff;
      rgba[o + 3] = 255;
    }
  }
  return { data: pngBuffer(width, height, rgba), width, height };
}

// ---------------------------------------------------------------- tool handlers

function text(content) {
  return { content: [{ type: 'text', text: content }] };
}

const HANDLERS = {
  async load_snapshot(args) {
    const buffer = args.path
      ? readFileSync(args.path)
      : args.base64
        ? Buffer.from(args.base64, 'base64')
        : null;
    if (!buffer) {
      throw new Error('provide `path` or `base64`');
    }
    assertSnapshot(buffer);
    core.storage.set_snapshot(new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength));
    // The snapshot restores memory, ports and the CPU, but a held key or a partially
    // rendered frame would survive the switch, so clear both (CODE_REVIEW.md B7).
    core.keyboard.restart();
    core.screen.restart();
    core.beeper.restart();
    return text(`loaded ${buffer.length} bytes\n${stateText()}`);
  },

  async run_cycles(args) {
    const requested = intArg(args.cycles, 'cycles', { min: 1, max: MAX_CYCLES });
    // Run in chunks, yielding to the event loop between them, so a long request does not
    // block the stdio transport and starve other tool calls (CODE_REVIEW.md B13).
    const CHUNK = 500_000;
    let actual = 0;
    let remaining = requested;
    while (remaining > 0) {
      const slice = Math.min(CHUNK, remaining);
      actual += core.cpu.run(slice);
      remaining -= slice;
      if (remaining > 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    return text(`ran ${actual} cycles (requested ${requested})\n${stateText()}`);
  },

  async read_memory(args) {
    const address = intArg(args.address, 'address');
    const length =
      args.length === undefined ? 1 : intArg(args.length, 'length', { min: 1, max: 65536 });
    if (address + length > 0x10000) {
      throw new Error(`read past end of RAM (0x${hex(address, 4)} + ${length})`);
    }
    const bytes = [];
    for (let i = 0; i < length; i += 1) {
      // `peek` is the debugger access: it must not charge wait states or move the clock,
      // so reading memory leaves the machine exactly as it was (CODE_REVIEW.md B5).
      bytes.push(core.memory.peek(address + i));
    }
    return text(`0x${hex(address, 4)}: ${hexDump(bytes)}`);
  },

  async write_memory(args) {
    const address = intArg(args.address, 'address');
    const bytes = parseBytes(args);
    if (address + bytes.length > 0x10000) {
      throw new Error(`write past end of RAM (0x${hex(address, 4)} + ${bytes.length})`);
    }
    const previous = [];
    const rejected = [];
    for (let i = 0; i < bytes.length; i += 1) {
      const addr = address + i;
      previous.push(core.memory.peek(addr));
      // `poke` reports whether the byte was actually stored: the ROM (and any RAM hidden
      // behind the initial-reset ROM mapping) is read-only, so the tool must not claim a
      // write that silently did nothing (CODE_REVIEW.md B15).
      if (!core.memory.poke(addr, bytes[i])) {
        rejected.push(addr);
      }
    }
    const written = bytes.length - rejected.length;
    const summary = `wrote ${written} of ${bytes.length} byte(s) at 0x${hex(address, 4)}; previous: ${hexDump(previous)}`;
    if (rejected.length > 0) {
      const list = rejected.map((addr) => `0x${hex(addr, 4)}`).join(', ');
      return {
        content: [{ type: 'text', text: `${summary}\nnot writable: ${list}` }],
        isError: true,
      };
    }
    return text(summary);
  },

  async read_port(args) {
    const port = intArg(args.port, 'port', { max: 0xff });
    return text(`port 0x${hex(port)} = 0x${hex(core.io.read_port(port))}`);
  },

  async write_port(args) {
    const port = intArg(args.port, 'port', { max: 0xff });
    const value = intArg(args.value, 'value', { max: 0xff });
    core.io.write_port(port, value);
    return text(`port 0x${hex(port)} = 0x${hex(value)}`);
  },

  async key_press(args) {
    const { key } = args;
    if (typeof key !== 'string' || key === '') {
      throw new Error('`key` must be a non-empty string (a KeyboardEvent.code, e.g. "Enter")');
    }
    const modifier =
      args.modifier === undefined ? 0 : intArg(args.modifier, 'modifier', { min: 0, max: 0x07 });
    const pressed = args.pressed !== false;
    core.io.keyboard.press(key, pressed, modifier);
    return text(
      `${pressed ? 'pressed' : 'released'} ${key}${modifier ? ` (modifier ${modifier})` : ''}\n${stateText()}`
    );
  },

  async key_tap(args) {
    const { key } = args;
    if (typeof key !== 'string' || key === '') {
      throw new Error('`key` must be a non-empty string (a KeyboardEvent.code, e.g. "Space")');
    }
    const modifier =
      args.modifier === undefined ? 0 : intArg(args.modifier, 'modifier', { min: 0, max: 0x07 });
    // Default to a touch over one video frame (44800/45056 cycles) so a program that polls
    // the keyboard once per frame actually sees the key; 0 is still available for an instant
    // click (CODE_REVIEW.md B16).
    const cycles =
      args.cycles === undefined
        ? 50000
        : intArg(args.cycles, 'cycles', { min: 0, max: MAX_CYCLES });
    core.io.keyboard.press(key, true, modifier);
    const actual = cycles > 0 ? core.cpu.run(cycles) : 0;
    core.io.keyboard.press(key, false, modifier);
    return text(
      `tapped ${key}${modifier ? ` (modifier ${modifier})` : ''} for ${actual} cycles\n${stateText()}`
    );
  },

  async screenshot(args) {
    const scale = args.scale === undefined ? 2 : intArg(args.scale, 'scale', { min: 1, max: 8 });
    const { data, width, height } = frameToPng(scale);
    return {
      content: [
        {
          type: 'text',
          text: `frame ${width}x${height} (${core.screen.width}x${core.screen.height} @ ${scale}x)`,
        },
        { type: 'image', data: data.toString('base64'), mimeType: 'image/png' },
      ],
    };
  },

  async dump_state() {
    return text(stateText());
  },

  async reset() {
    // Match ComputerProfile.reset() (CODE_REVIEW.md B7): a reset is a power-on, so RAM,
    // the keyboard matrix and the peripherals all clear, not just the CPU.
    core.beeper.restart();
    core.keyboard.restart();
    core.io.restart();
    core.memory.restart();
    core.cpu.restart();
    core.screen.restart();
    return text(
      `reset to power-on state (ROM mapped everywhere until the first OUT)\n${stateText()}`
    );
  },
};

// ---------------------------------------------------------------- MCP wiring

const TOOLS = [
  {
    name: 'load_snapshot',
    description:
      'Load a PC-01 "Lviv" snapshot (.lvt/.sav) into the emulator and reset it to the ' +
      'snapshot CPU/RAM/VRAM/port state. Provide a filesystem `path` or `base64` bytes.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Filesystem path to the snapshot file.' },
        base64: { type: 'string', description: 'Snapshot bytes as base64.' },
      },
    },
  },
  {
    name: 'run_cycles',
    description:
      'Execute a number of CPU cycles and report the actual cycles run plus the register ' +
      'state. Deterministic: no real time is involved.',
    inputSchema: {
      type: 'object',
      properties: {
        cycles: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_CYCLES,
          description: 'CPU cycles to execute (max 10,000,000).',
        },
      },
      required: ['cycles'],
    },
  },
  {
    name: 'read_memory',
    description:
      'Read `length` bytes of memory starting at `address` (0x0000..0xFFFF). This is a ' +
      'debugger access: it does not run the CPU or charge wait states.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'integer', minimum: 0, maximum: 65535 },
        length: { type: 'integer', minimum: 1, maximum: 65536, description: 'Default 1.' },
      },
      required: ['address'],
    },
  },
  {
    name: 'write_memory',
    description:
      'Write bytes into memory at `address`. Provide `bytes` (array of 0..255) or `hex` (a ' +
      'hex string). Does not run the CPU or charge wait states; writing into a read-only ' +
      'page (ROM) is reported as an error.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'integer', minimum: 0, maximum: 65535 },
        bytes: {
          type: 'array',
          maxItems: 65536,
          items: { type: 'integer', minimum: 0, maximum: 255 },
        },
        hex: { type: 'string' },
      },
      required: ['address'],
    },
  },
  {
    name: 'read_port',
    description: 'Read an I/O port (0x00..0xFF).',
    inputSchema: {
      type: 'object',
      properties: {
        port: { type: 'integer', minimum: 0, maximum: 255 },
      },
      required: ['port'],
    },
  },
  {
    name: 'write_port',
    description: 'Write a value (0..255) to an I/O port (0x00..0xFF).',
    inputSchema: {
      type: 'object',
      properties: {
        port: { type: 'integer', minimum: 0, maximum: 255 },
        value: { type: 'integer', minimum: 0, maximum: 255 },
      },
      required: ['port', 'value'],
    },
  },
  {
    name: 'key_press',
    description:
      'Press or release a key by its KeyboardEvent.code ("Enter", "Space", "ArrowLeft", ' +
      '"KeyA", "Digit0", ...). `pressed` defaults to true. `modifier` is a bit mask: 1 = ' +
      'Alt, 2 = Ctrl, 4 = Shift (release with the same mask you pressed with).',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        pressed: { type: 'boolean', description: 'true = press down, false = release.' },
        modifier: {
          type: 'integer',
          minimum: 0,
          maximum: 7,
          description: 'Bit mask: 1 = Alt, 2 = Ctrl, 4 = Shift. Default 0.',
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'key_tap',
    description:
      'Press a key, run `cycles` CPU cycles while it is held, then release it. `cycles` ' +
      'defaults to 50000 (~one video frame) so a program polling the keyboard once per ' +
      'frame sees the press; use 0 for an instant click. `modifier` is a bit mask: 1 = ' +
      'Alt, 2 = Ctrl, 4 = Shift.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        cycles: { type: 'integer', minimum: 0, maximum: MAX_CYCLES },
        modifier: {
          type: 'integer',
          minimum: 0,
          maximum: 7,
          description: 'Bit mask: 1 = Alt, 2 = Ctrl, 4 = Shift. Default 0.',
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'screenshot',
    description:
      'Render the framebuffer to a PNG (nearest-neighbour upscaled by `scale`, default 2) ' +
      'and return it as base64 image content. Reads the screen without running the CPU.',
    inputSchema: {
      type: 'object',
      properties: {
        scale: { type: 'integer', minimum: 1, maximum: 8, description: 'Default 2.' },
      },
    },
  },
  {
    name: 'dump_state',
    description: 'Return the current CPU register state (PC, SP, AF, BC, DE, HL, IFF, halted).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'reset',
    description:
      'Reset the CPU and I/O to the power-on state (the ROM answers for every address until ' +
      'the first OUT instruction).',
    inputSchema: { type: 'object', properties: {} },
  },
];

const server = new Server(
  { name: 'emulator-pc01-lviv', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const handler = HANDLERS[name];
  if (!handler) {
    return { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true };
  }
  try {
    return await handler(args);
  } catch (error) {
    return { content: [{ type: 'text', text: `error: ${error.message}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
