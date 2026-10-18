import { describe, it, expect } from 'vitest';
import { Settings } from '../src/settings.js';
import { Config } from '../src/config.js';

describe('Config', () => {
  it('gives the machine the 20 ms frame the versions before P2.20 used by default', () => {
    const settings = new Settings('default');
    const config = new Config(settings, 'pc01_lvov_80');

    expect(config.computer.model).toBe('ПК-01 "Львов"');
    expect(config.computer.profile).toBe('pc01_lvov_80');
    expect(config.cpu.clock_speed).toBe(2200000);
    expect(config.cpu.frame_cycles).toBe(44800);

    // 44800 * 1000 / 20 ms = 2.24 MHz: in the default frame the machine runs 2.4 % fast.
    // The frame belongs to the video circuit and does not follow the CPU speed factor.
    expect(settings.computer.allow_turbo_mode).toBe(false);
    expect(config.cpu.frame_duration).toBe(20);
    expect(config.cpu.effective_clock_speed).toBe(2240000);
  });

  it('takes the frame from the settings and rejects an unknown one (P2.20)', () => {
    const settings = new Settings('default');
    settings.cpu.frame = '48.83hz';

    const config = new Config(settings, 'pc01_lvov_80');

    // The faithful frame is not the default (P2.20): it is this setting that picks it, and
    // `Config` lays its numbers over the profile with `set_frame()`.
    expect(config.cpu.frame).toBe('48.83hz');
    expect(config.cpu.frame_cycles).toBe(45056);
    expect(config.cpu.frame_duration).toBe(20.48);
    expect(config.cpu.frame_work_cycles).toBe(45056);
    expect(config.cpu.effective_clock_speed).toBe(2200000);

    settings.cpu.frame = 'nope';
    expect(() => new Config(settings, 'pc01_lvov_80')).toThrow(RangeError);
  });

  it('switches the video frame while the machine runs (P2.20)', () => {
    const config = new Config(new Settings('default'), 'pc01_lvov_80');

    expect(config.cpu.frame).toBe('50hz');
    expect(config.cpu.frame_cycles).toBe(44800);
    expect(config.cpu.effective_clock_speed).toBe(2240000);

    config.set_frame('48.83hz');

    expect(config.cpu.frame).toBe('48.83hz');
    expect(config.cpu.frame_cycles).toBe(45056);
    expect(config.cpu.frame_duration).toBe(20.48);
    expect(config.cpu.frame_work_cycles).toBe(45056);
    expect(config.cpu.effective_clock_speed).toBe(2200000);

    config.set_frame('50hz');

    expect(config.cpu.frame_work_cycles).toBe(44800);
    expect(config.cpu.effective_clock_speed).toBe(2240000);

    expect(() => config.set_frame('nope')).toThrow(RangeError);
  });

  it('runs 2.4 % fast in the frame of the versions before P2.20 (P2.20)', () => {
    const config = new Config(new Settings('default'), 'pc01_lvov_80');

    // 1.0 * 44800 cycles in the 20 ms frame -> 2.24 MHz, i.e. 2.4 % above the documented
    // clock. The faithful frame (45056 cycles in 20.48 ms) lands exactly on 2.2 MHz, but it
    // also lowers the pitch of every program by 1.8 %, so it is not the default.
    expect(config.cpu.frame_work_cycles).toBe(44800);
    expect(config.cpu.effective_clock_speed).toBe(2240000);
  });

  it('scales the work done per frame, not the frame rate', () => {
    const settings = new Settings('default');
    settings.cpu.speed_factor = 0.5;

    const config = new Config(settings, 'pc01_lvov_80');

    expect(config.cpu.frame_duration).toBe(20); // the frame rate does not follow it
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

    // Turbo multiplies the speed factor by 4: 4 * 1.0 * 44800 = 179200 cycles per frame
    // -> 8.96 MHz. The frame rate does not follow the speed factor.
    expect(config.cpu.frame_duration).toBe(20);
    expect(config.cpu.frame_work_cycles).toBe(179200);
    expect(config.cpu.effective_clock_speed).toBe(8960000);
  });

  it('keeps the raw square wave by default', () => {
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
  });

  it('gives the port 0xF0 latch only to the machine with the upgrades (P2.14)', () => {
    expect(new Config(new Settings('default'), 'pc01_lvov_80').io.extended_port_latch).toBe(false);
    expect(new Config(new Settings('default'), 'pc01_lvov_80_fixed').io.extended_port_latch).toBe(
      true
    );
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
