import { describe, it, expect } from 'vitest';
import { Settings } from '../src/settings.js';
import { Config } from '../src/config.js';

describe('Config', () => {
  it('derives the frame duration from the clock speed (real PC-01 speed)', () => {
    const settings = new Settings('default');
    const config = new Config(settings, 'pc01_lvov_80');

    expect(config.computer.model).toBe('ПК-01 "Львов"');
    expect(config.computer.profile).toBe('pc01_lvov_80');
    expect(config.cpu.frame_cycles).toBe(44800);

    // round(44800 * 1000 / 2.2e6) = 20 ms per frame -> 50 frames/s (2.24 MHz)
    expect(settings.computer.allow_turbo_mode).toBe(false);
    expect(config.cpu.frame_duration).toBe(20);
  });

  it('runs 4x faster when turbo mode is enabled', () => {
    const settings = new Settings('default');
    settings.computer.allow_turbo_mode = true;

    expect(new Config(settings, 'pc01_lvov_80').cpu.frame_duration).toBe(5);
  });

  it('exposes the memory map and ROM image', () => {
    const config = new Config(new Settings('default'), 'pc01_lvov_80');

    expect(config.memory.map).toBe(80);
    expect(config.rom.image).toBe(1990);
    expect(config.io.allow_brief_decoding).toBe(true);
  });

  it('applies the fixed-model profile differences', () => {
    const config = new Config(new Settings('default'), 'pc01_lvov_80_fixed');

    expect(config.memory.hide_0_mem_bank).toBe(false);
    expect(config.beeper.ignore_control_bit).toBe(true);
  });

  it('rejects an unknown profile', () => {
    expect(() => new Config(new Settings('default'), 'unknown-profile')).toThrow();
  });
});
