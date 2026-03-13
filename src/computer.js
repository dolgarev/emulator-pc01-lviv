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

import { Setting } from './setting.js';
import { Profile } from './profile.js';
import { Dump } from './dump.js';

export function Computer(emu_settings) {
  if (!(emu_settings instanceof Setting)) {
    throw new Error('COMPUTER: Invalid emulator settings');
  }
  this.settings = emu_settings;

  this.profile = void 0;
  this.profile_name = 'default';
}

Computer.prototype.initAsync = async function () {
  if (this.settings.dump.is_connected) {
    await this.load_dump(this.settings.dump.default_dump);
  } else {
    await this.init();
  }
};

Computer.prototype.init = async function () {
  this.profile = new Profile(this.settings, this.profile_name === '*' ? void 0 : this.profile_name);
  await this.profile.initAsync();
};

Computer.prototype.restart = async function (profile) {
  if (this.profile instanceof Profile) {
    this.profile.terminate();
  }

  this.profile_name = profile;
  await this.init();
};

Computer.prototype.terminate = function () {
  if (this.profile instanceof Profile) {
    this.profile.terminate();

    this.profile = this.profile_name = this.settings = null;
  } else {
    throw new Error('COMPUTER: Invalid PROFILE object');
  }
};

Computer.prototype.reset = function () {
  if (this.profile instanceof Profile) {
    this.profile.reset();
  } else {
    throw new Error('COMPUTER: Invalid PROFILE object');
  }
};

Computer.prototype.run = function () {
  if (this.profile instanceof Profile) {
    this.profile.resume();
  } else {
    throw new Error('COMPUTER: Invalid PROFILE object');
  }
};

Computer.prototype.stop = function () {
  if (this.profile instanceof Profile) {
    this.profile.suspend();
  } else {
    throw new Error('COMPUTER: Invalid PROFILE object');
  }
};

Computer.prototype.load_dump = async function (dump_name) {
  var dump = await Dump.get(dump_name);

  await this.restart(dump['profile']);
  this.profile.load_dump(dump);
};

Computer.prototype.get_description = function () {
  if (!(this.profile instanceof Profile)) {
    throw new Error('COMPUTER: Invalid PROFILE object');
  }

  return this.profile.get_description();
};
