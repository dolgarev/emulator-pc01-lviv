import { describe, it, expect, vi, afterEach } from 'vitest';
import { Computer } from '../src/computer.js';
import { ComputerProfileBuilder } from '../src/computerProfileBuilder.js';
import { Settings } from '../src/settings.js';

// `Computer.init()` builds the profile through the static factory; the real one needs a DOM
// (Viewport), so the factory is replaced with a stub that records what it was given.
function stubBuilder() {
  return vi
    .spyOn(ComputerProfileBuilder, 'createStandard')
    .mockImplementation((settings, profile) => ({
      onMachine() {},
      async initAsync() {},
      profile,
    }));
}

describe('Computer machine selection (P3.21)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds the machine chosen by the settings preset', async () => {
    const createStandard = stubBuilder();
    const computer = new Computer(new Settings('standard_fixed'), undefined);

    await computer.init();

    expect(computer.profile_name).toBe('pc01_lvov_80_fixed');
    expect(createStandard).toHaveBeenCalledWith(
      expect.any(Settings),
      'pc01_lvov_80_fixed',
      undefined
    );
  });

  it('accepts a plain machine profile name', async () => {
    const createStandard = stubBuilder();
    const computer = new Computer(new Settings('pc01_lvov_80'), undefined);

    await computer.init();

    expect(createStandard).toHaveBeenCalledWith(expect.any(Settings), 'pc01_lvov_80', undefined);
  });

  it('keeps the serial machine as the default', async () => {
    const createStandard = stubBuilder();
    const computer = new Computer(new Settings(), undefined);

    await computer.init();

    expect(createStandard).toHaveBeenCalledWith(expect.any(Settings), 'pc01_lvov_80', undefined);
  });
});
