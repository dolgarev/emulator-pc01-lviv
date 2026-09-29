import { Settings } from './settings.js';
import { ComputerProfile } from './computerProfile.js';
import { ComputerProfileBuilder } from './computerProfileBuilder.js';
import { Dump } from './dump.js';
import { assertInstance } from './utils/assert.js';

export class Computer {
  constructor(emu_settings, dom) {
    assertInstance(emu_settings, Settings, 'COMPUTER: Invalid emulator settings');
    this.settings = emu_settings;
    this.dom = dom;

    this.profile = undefined;
    this.profile_name = 'default';
  }

  async initAsync() {
    if (this.settings.dump.is_connected) {
      await this.load_dump(this.settings.dump.default_dump);
    } else {
      await this.init();
    }
  }

  async init() {
    // Build the profile through ComputerProfileBuilder
    this.profile = ComputerProfileBuilder.createStandard(
      this.settings,
      this.profile_name === '*' ? undefined : this.profile_name,
      this.dom
    );
    await this.profile.initAsync();
  }

  async restart(profile) {
    if (this.profile instanceof ComputerProfile) {
      this.profile.terminate();
    }

    this.profile_name = profile;
    await this.init();
  }

  run() {
    if (this.profile instanceof ComputerProfile) {
      this.profile.resume();
    } else {
      throw new Error('COMPUTER: Invalid ComputerProfile object');
    }
  }

  async load_dump(dump_name) {
    const dump = await Dump.get(dump_name);

    await this.restart(dump.profile);
    this.profile.load_dump(dump);
  }
}
