import { describe, it, expect } from 'vitest';
import { createCore, boot, load } from '../src/core.js';
import { createCore as fromHelpers } from './helpers.js';
import { Contention } from '../src/contention.js';

describe('src/core.js public headless API', () => {
  it('builds a complete headless core with contention off by default', () => {
    const core = createCore();

    for (const name of [
      'settings',
      'config',
      'clock',
      'contention',
      'beeper',
      'keyboard',
      'io',
      'memory',
      'traps',
      'cpu',
      'storage',
      'screen',
    ]) {
      expect(core[name]).toBeDefined();
    }

    expect(core.contention).toBeNull();
    expect(core.config.cpu.frame).toBe('50hz');
    expect(core.config.cpu.frame_cycles).toBe(44800);
    expect(core.io.initial_rom_mapping).toBe(false);
  });

  it('turns the video/RAM contention on with wait_states', () => {
    const core = createCore('pc01_lvov_80', { wait_states: true });
    expect(core.contention).toBeInstanceOf(Contention);
    expect(core.config.cpu.frame).toBe('50hz');
  });

  it('combines contention with the 48.83 Hz frame (hardware-faithful machine)', () => {
    const core = createCore('pc01_lvov_80', { wait_states: true, frame: '48.83hz' });
    expect(core.contention).toBeInstanceOf(Contention);
    expect(core.config.cpu.frame).toBe('48.83hz');
    expect(core.config.cpu.frame_cycles).toBe(45056);
    expect(core.config.cpu.effective_clock_speed).toBe(2200000);
  });

  it('accepts an explicit frame without contention', () => {
    const core = createCore('pc01_lvov_80', { frame: '48.83hz' });
    expect(core.contention).toBeNull();
    expect(core.config.cpu.frame).toBe('48.83hz');
    expect(core.config.cpu.effective_clock_speed).toBe(2200000);
  });

  it('boot() clears the initial ROM mapping', () => {
    const core = createCore();
    core.io.initial_rom_mapping = true;
    boot(core.io);
    expect(core.io.initial_rom_mapping).toBe(false);
  });

  it('load() writes bytes at the given origin', () => {
    const core = createCore();
    load(core.memory, [0xde, 0xad, 0xbe, 0xef], 0x100);
    expect(core.memory.read(0x100)).toBe(0xde);
    expect(core.memory.read(0x101)).toBe(0xad);
    expect(core.memory.read(0x102)).toBe(0xbe);
    expect(core.memory.read(0x103)).toBe(0xef);
  });

  it('test/helpers.js re-exports the same API', () => {
    expect(fromHelpers).toBe(createCore);
  });
});
