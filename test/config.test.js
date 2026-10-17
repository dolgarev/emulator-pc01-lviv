import { describe, it, expect } from 'vitest';
import { Settings } from '../src/settings.js';
import { Config } from '../src/config.js';

describe('Config', () => {
  it('gives the machine the frame of the video circuit (P2.20)', () => {
    const settings = new Settings('default');
    const config = new Config(settings, 'pc01_lvov_80');

    expect(config.computer.model).toBe('ПК-01 "Львов"');
    expect(config.computer.profile).toBe('pc01_lvov_80');
    expect(config.cpu.clock_speed).toBe(2200000);
    expect(config.cpu.frame_cycles).toBe(45056);

    // 45056 * 1000 / 2.2e6 = 20.48 ms per frame -> 48.83 frames/s. The frame belongs to
    // the video circuit and does not follow the CPU speed factor.
    expect(settings.computer.allow_turbo_mode).toBe(false);
    expect(config.cpu.frame_duration).toBe(20.48);
  });

  it('switches the video frame while the machine runs (P2.20)', () => {
    const config = new Config(new Settings('default'), 'pc01_lvov_80');

    expect(config.cpu.frame).toBe('pc01');
    expect(config.cpu.frame_cycles).toBe(45056);
    expect(config.cpu.effective_clock_speed).toBe(2200000);

    config.set_frame('legacy');

    expect(config.cpu.frame).toBe('legacy');
    expect(config.cpu.frame_cycles).toBe(44800);
    expect(config.cpu.frame_duration).toBe(20);
    expect(config.cpu.frame_work_cycles).toBe(44800);
    expect(config.cpu.effective_clock_speed).toBe(2240000);

    config.set_frame('pc01');

    expect(config.cpu.frame_work_cycles).toBe(45056);
    expect(config.cpu.effective_clock_speed).toBe(2200000);

    expect(() => config.set_frame('nope')).toThrow(RangeError);
  });

  it('runs the CPU at its nominal clock by default', () => {
    const config = new Config(new Settings('default'), 'pc01_lvov_80');

    // 1.0 * 45056 = 45056 cycles in the 20.48 ms frame of the video circuit -> exactly
    // 2.2 MHz, the documented clock of the machine (P2.20). The wait-state model (0.6) is
    // reachable through cpu.speed_factor, but it also lowers the pitch of the beeper by the
    // same factor, so it is not the default (see P2.11 and P3.11).
    expect(config.cpu.frame_work_cycles).toBe(45056);
    expect(config.cpu.effective_clock_speed).toBe(2200000);
  });

  it('scales the work done per frame, not the frame rate', () => {
    const settings = new Settings('default');
    settings.cpu.speed_factor = 0.5;

    const config = new Config(settings, 'pc01_lvov_80');

    expect(config.cpu.frame_duration).toBe(20.48); // the frame rate does not follow it
    expect(config.cpu.frame_work_cycles).toBe(22528);
    expect(config.cpu.effective_clock_speed).toBe(1100000);
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

    // Turbo multiplies the speed factor by 4: 4 * 1.0 * 45056 = 180224 cycles per frame
    // -> 8.8 MHz. The frame rate is the one of the video circuit, 48.83 Hz.
    expect(config.cpu.frame_duration).toBe(20.48);
    expect(config.cpu.frame_work_cycles).toBe(180224);
    expect(config.cpu.effective_clock_speed).toBe(8800000);
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
