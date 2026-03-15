/*
 * Copyright (C) 2014 Oleg Dolgarev <o.dolgarev@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { Settings } from './settings.js';
import { ComputerProfile } from './computerProfile.js';
import { ComputerProfileBuilder } from './computerProfileBuilder.js';
import { Dump } from './dump.js';

export class Computer {
  constructor(emu_settings) {
    if (!(emu_settings instanceof Settings)) {
      throw new Error('COMPUTER: Invalid emulator settings');
    }
    this.settings = emu_settings;

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
    // Используем ComputerProfileBuilder для создания профиля
    this.profile = ComputerProfileBuilder.createStandard(
      this.settings,
      this.profile_name === '*' ? undefined : this.profile_name
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

  terminate() {
    if (this.profile instanceof ComputerProfile) {
      this.profile.terminate();

      this.profile = this.profile_name = this.settings = null;
    } else {
      throw new Error('COMPUTER: Invalid ComputerProfile object');
    }
  }

  reset() {
    if (this.profile instanceof ComputerProfile) {
      this.profile.reset();
    } else {
      throw new Error('COMPUTER: Invalid ComputerProfile object');
    }
  }

  run() {
    if (this.profile instanceof ComputerProfile) {
      this.profile.resume();
    } else {
      throw new Error('COMPUTER: Invalid ComputerProfile object');
    }
  }

  stop() {
    if (this.profile instanceof ComputerProfile) {
      this.profile.suspend();
    } else {
      throw new Error('COMPUTER: Invalid ComputerProfile object');
    }
  }

  async load_dump(dump_name) {
    const dump = await Dump.get(dump_name);

    await this.restart(dump.profile);
    this.profile.load_dump(dump);
  }

  get_description() {
    if (!(this.profile instanceof ComputerProfile)) {
      throw new Error('COMPUTER: Invalid ComputerProfile object');
    }

    return this.profile.get_description();
  }
}
