import { describe, it, expect } from 'vitest';
import { validateFileHeader } from '../src/utils/fileFormat.js';

function buffer(bytes) {
  return Uint8Array.from(bytes).buffer;
}

function ascii(text) {
  return Array.from(text, (char) => char.charCodeAt(0));
}

describe('validateFileHeader', () => {
  it('accepts the LVOV/DUMP/2.0/H+ snapshot header', () => {
    const data = buffer([...ascii('LVOV/DUMP/2.0/H+'), 0x00, 0x01, 0x02]);

    expect(validateFileHeader(data, 'LVOV/DUMP/2.0/H+')).toBe(true);
  });

  it('accepts the Emulator 3000 (e3) snapshot header', () => {
    const data = buffer([...ascii('Emulator 3000'), 0x00]);

    expect(validateFileHeader(data, 'Emulator 3000')).toBe(true);
  });

  it('rejects a foreign header', () => {
    const data = buffer([...ascii('LVOV/DUMP/9.9/H+'), 0x00]);

    expect(validateFileHeader(data, 'LVOV/DUMP/2.0/H+')).toBe(false);
  });

  it('rejects a file that is shorter than the magic string', () => {
    expect(validateFileHeader(buffer(ascii('LVOV')), 'LVOV/DUMP/2.0/H+')).toBe(false);
    expect(validateFileHeader(buffer([]), 'Emulator 3000')).toBe(false);
  });
});
