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

export class Dump {
  static storage = {
    bload: {
      name: 'bload',
      description: 'Образ памяти для команды BLOAD"",R',
      type: 'sav',
      is_hidden: true,
      profile: '*',
    },
    cload: {
      name: 'cload',
      description: 'Образ памяти для команды CLOAD""',
      type: 'sav',
      is_hidden: true,
      profile: '*',
    },
    aerco1: {
      name: 'Aerocobra',
      description: '',
      type: 'sav',
      is_hidden: false,
      profile: 'pc01_lvov_80',
    },
    mtrack: {
      name: 'Moon Tracker',
      description: '',
      type: 'sav',
      is_hidden: false,
      profile: 'pc01_lvov_80',
    },
  };

  static async get(short_name) {
    if (!(short_name in Dump.storage)) {
      throw new Error(`DUMP: Dump "${short_name}" not exists`);
    }

    const dump = new Dump(),
      entry = Dump.storage[short_name];

    if (!entry.data) {
      try {
        const response = await fetch(`/data/dump-${short_name}.bin`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const buffer = await response.arrayBuffer();
        entry.data = new DataView(buffer);
      } catch (e) {
        console.error('Failed to load Dump image:', e);
        throw new Error(`DUMP: Failed to load image ${short_name}`, { cause: e });
      }
    }

    for (const key in entry) {
      Object.defineProperty(dump, key, {
        enumerable: true,
        value: entry[key],
      });
    }

    return Object.freeze(dump);
  }

  static list() {
    const storage = Dump.storage,
      list = {};

    Object.keys(storage)
      .sort()
      .forEach((key) => {
        if (!storage[key].is_hidden) {
          list[key] = storage[key].name;
        }
      });

    return list;
  }
}
