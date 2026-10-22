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
    // The machine comes from the settings preset (`new Settings('standard_fixed')`) or
    // from a plain machine name passed to Emulator. It used to be hard-coded to 'default'
    // here, which silently ignored the preset and always ran the default machine
    // (CODE_REVIEW.md P3.21).
    this.profile_name = emu_settings.computer?.profile ?? 'default';
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
    this.profile.onMachine((machine) => this.select_machine(machine));
    await this.profile.initAsync();
  }

  /**
   * Switches the machine (P2.16): the profile is rebuilt from the settings of the
   * chosen model and boots into its ROM - deliberately without the dump that may
   * have started the session, because that dump names the machine it was taken
   * from.
   * @param {string} profile - Profile name of the machine to run.
   */
  async select_machine(profile) {
    await this.restart(profile);
    this.run();
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
