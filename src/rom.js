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

import { Config } from './config.js';

export function Rom(config, memory) {
  if (!(config instanceof Config)) {
    throw new Error('ROM: Invalid CONFIG object');
  }
  this.config = config;

  if (!memory || typeof memory.get_rom_page !== 'function') {
    throw new Error('ROM: Invalid memory instance [debug: v2]');
  }
  this.rom_page = memory.get_rom_page();

  this.prev_short_name = void 0;
}

Rom.prototype.init = async function () {
  await this.set(this.config.rom.image);
};

Rom.prototype.restart = async function () {
  await this.set(this.prev_short_name);
};

Rom.prototype.set = async function (short_name) {
  if (!(short_name in this.images)) {
    throw new Error('ROM: Selected invalid ROM image');
  }

  // Load binary if not loaded yet
  if (!this.images[short_name].data) {
    try {
      // Path adjusted for root-relative loading in Vite
      const response = await fetch(`/data/rom-${short_name}.bin`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const buffer = await response.arrayBuffer();
      this.images[short_name].data = new Uint8Array(buffer);
    } catch (e) {
      console.error('Failed to load ROM image:', e);
      throw new Error(`ROM: Failed to load image ${short_name}`, { cause: e });
    }
  }

  this.prev_short_name = short_name;

  var rom_image = this.images[short_name].data,
    rom_page = this.rom_page;

  for (var i = 0, l = rom_image.length; i < l; i++) {
    rom_page.burn(i, rom_image[i]);
  }
};

Rom.prototype.get_description = function (short_name) {
  if (!(short_name in this.images)) {
    throw new Error('ROM: Selected invalid ROM image');
  }

  var rom_image = this.images[short_name];

  return {
    name: rom_image.full_name,
    description: rom_image.description,
    version: rom_image.version,
  };
};

Rom.prototype.images = {
  1990: {
    full_name: '1990',
    description: 'Стандартное ПЗУ образца 1990 года.',
    version: 1,
    data: null, // Will be loaded dynamically
  },
};
