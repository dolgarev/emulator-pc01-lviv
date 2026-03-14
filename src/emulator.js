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
import { Notify } from './notify.js';
import { Computer } from './computer.js';

export class Emulator {
  constructor(profile) {
    this.settings = new Settings(profile);

    Notify.create(this.settings.notify.node, this.settings.notify.delay);

    this.computer = new Computer(this.settings);
  }

  async initAsync() {
    this.init(); // UI setup
    await this.computer.initAsync();
  }

  init() {
    if ('help_button' in this.settings.controls) {
      const bttn = this.settings.controls.help_button;
      const node = document.getElementById(bttn.node.dataset.target);

      node.addEventListener('click', function (evt) {
        if (evt.target.dataset.action === 'close') {
          this.classList.remove('lightbox_show');
        }
      });

      bttn.node.addEventListener('click', () => {
        node.classList.add('lightbox_show');
      });
    }
  }

  load_dump(dump_name) {
    this.computer.load_dump(dump_name);
  }

  run() {
    this.computer.run();
  }
}
