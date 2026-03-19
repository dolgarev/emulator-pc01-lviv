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
      const node = document.getElementById(this.settings.controls.help_button.node.dataset.target);
      const clickOnHelpButtonHandler = () => {
        node.classList.add('lightbox_show');

        const clickOnCloseButtonHanlder = (e) => {
          if (e.target.dataset.action === 'close') {
            node.classList.remove('lightbox_show');
            node.removeEventListener('click', clickOnCloseButtonHanlder);
          }
        };
        node.addEventListener('click', clickOnCloseButtonHanlder);
      };
      document.addEventListener('ui:click:help_button', clickOnHelpButtonHandler);

      this.settings.controls.help_button?.node?.addEventListener('click', (e) => {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('ui:click:help_button'));
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
