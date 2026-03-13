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

import { Emulator } from './emulator.js';
import { Beeper } from './beeper.js';

document.addEventListener('DOMContentLoaded', async () => {
  const emulator = new Emulator();
  await emulator.initAsync();
  emulator.run();

  // Modern browsers require user interaction to resume audio
  const audioActivator = function () {
    console.log('MAIN: User interaction detected, activating sound...');
    const context = Beeper.activate();
    if (context) {
      if (context.state === 'suspended') {
        context.resume().then(() => {
          console.log('MAIN: AudioContext resumed. New state:', context.state);
        });
      } else {
        console.log('MAIN: AudioContext already active. State:', context.state);
      }
    }
  };

  document.addEventListener('click', audioActivator, { once: true });
  document.addEventListener('keydown', audioActivator, { once: true });
});
