import { describe, it, expect } from 'vitest';
import { Settings } from '../src/settings.js';
import { Config } from '../src/config.js';

describe('Config', () => {
  it('derives the frame duration from the clock speed', () => {
    const settings = new Settings('default');
    const config = new Config(settings, 'pc01_lvov_80');

    expect(config.computer.model).toBe('ПК-01 "Львов"');
    expect(config.computer.profile).toBe('pc01_lvov_80');
    expect(config.cpu.clock_speed).toBe(2200000);
    expect(config.cpu.frame_cycles).toBe(44800);

    // round(44800 * 1000 / 2.2e6) = 20 ms per frame -> 50 frames/s. The frame rate
    // belongs to the video circuit and does not follow the CPU speed factor.
    expect(settings.computer.allow_turbo_mode).toBe(false);
    expect(config.cpu.frame_duration).toBe(20);
  });

  it('runs the CPU below its nominal clock by default (video/RAM contention)', () => {
    const config = new Config(new Settings('default'), 'pc01_lvov_80');

    // 0.6 * 44800 = 26880 cycles in the same 20 ms frame -> 1.344 MHz (P2.11)
    expect(config.cpu.frame_work_cycles).toBe(26880);
    expect(config.cpu.effective_clock_speed).toBe(1344000);
  });

  it('scales the work done per frame, not the frame rate', () => {
    const settings = new Settings('default');
    settings.cpu.speed_factor = 0.5;

    const config = new Config(settings, 'pc01_lvov_80');

    expect(config.cpu.frame_duration).toBe(20); // still 50 frames/s
    expect(config.cpu.frame_work_cycles).toBe(22400);
    expect(config.cpu.effective_clock_speed).toBe(1120000);
  });

  it('rejects an invalid speed factor', () => {
    const settings = new Settings('default');
    settings.cpu.speed_factor = 0;

    expect(() => new Config(settings, 'pc01_lvov_80')).toThrow(RangeError);
  });

  it('runs 4x faster when turbo mode is enabled', () => {
    const settings = new Settings('default');
    settings.computer.allow_turbo_mode = true;

    const config = new Config(settings, 'pc01_lvov_80');

    // Turbo multiplies the speed factor by 4: 4 * 0.6 * 44800 = 107520 cycles per
    // frame -> 5.376 MHz. The frame rate stays at 50 Hz.
    expect(config.cpu.frame_duration).toBe(20);
    expect(config.cpu.frame_work_cycles).toBe(107520);
    expect(config.cpu.effective_clock_speed).toBe(5376000);
  });

  it('falls back to the raw square wave by default, as Emu80 v4 does', () => {
    const config = new Config(new Settings('default'), 'pc01_lvov_80');

    expect(config.beeper.speaker_model).toBe('flat');
  });

  it('accepts the piezo emitter model and rejects unknown ones', () => {
    const settings = new Settings('default');

    settings.beeper.speaker_model = 'piezo';
    expect(new Config(settings, 'pc01_lvov_80').beeper.speaker_model).toBe('piezo');

    settings.beeper.speaker_model = 'bass-reflex';
    expect(() => new Config(settings, 'pc01_lvov_80')).toThrow(RangeError);
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
