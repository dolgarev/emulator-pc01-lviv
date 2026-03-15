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

const DEFAULT_SETTINGS = {
  viewport: {
    container: {
      id: 'canvas_container',
    },
  },
  controls: {
    local_load_button: {
      id: 'load_button',
      node: undefined,
    },
    help_button: {
      id: 'help_button',
      node: undefined,
    },
  },
  notify: {
    id: 'notify',
    node: undefined,
    delay: 3000,
  },
  beeper: {
    allow_sound: true,
    allow_highpass_filter: false,
  },
  cpu: {
    i8080: {
      clock_speed: 2.2 * 1000000,
      frame_cycles: 44800,
    },
  },
  memory: {
    strict_mode: false,
  },
  rom: {
    image: 1990,
  },
  screen: {
    allow_color_mode: true,
    screenshot_type: 'image/png',
  },
  dump: {
    is_connected: true,
    default_dump: 'mtrack',
  },
  tape: {
    is_connected: true,
    file_extensions: /\.(lv(t|r|[0-9]{1,2})|sav|e3)$/i,
  },
  dnd: {
    is_connected: true,
    container: {
      id: 'body_container',
      node: undefined,
    },
    file_extensions: /\.(lv(t|r|[0-9]{1,2})|sav|e3)$/i,
  },
};

export class Settings {
  constructor(profile = 'default') {
    const predefined_settings = {};
    switch (profile) {
      case 'default':
      case 'standard':
        predefined_settings.computer = {
          profile: 'pc01_lvov_80',
          allow_turbo_mode: true,
        };
        break;

      case 'standard_fixed':
        predefined_settings.computer = {
          profile: 'pc01_lvov_80_fixed',
          allow_turbo_mode: true,
        };
        break;
    }

    const settings = { ...DEFAULT_SETTINGS, ...predefined_settings };
    for (const [prop, value] of Object.entries(settings)) {
      Object.defineProperty(this, prop, { value, enumerable: true });
    }

    this.init();

    Object.freeze(this);
  }

  init() {
    this.viewport.container.node = document.getElementById(this.viewport.container.id);

    if (!(this.viewport.container.node instanceof HTMLDivElement)) {
      throw new Error('SETTINGS: Element VIEWPORT not found');
    }

    this.dnd.container.node = document.getElementById(this.dnd.container.id);

    if (!(this.dnd.container.node instanceof HTMLElement)) {
      throw new Error('SETTINGS: Element DND not found');
    }

    if (this.controls.local_load_button) {
      this.controls.local_load_button.node = document.getElementById(
        this.controls.local_load_button.id
      );

      if (!(this.controls.local_load_button.node instanceof HTMLButtonElement)) {
        throw new Error('SETTINGS: Element LOCAL_LOAD_BUTTON not found');
      }
    }

    if (this.controls.help_button) {
      this.controls.help_button.node = document.getElementById(this.controls.help_button.id);

      if (!(this.controls.help_button.node instanceof HTMLButtonElement)) {
        throw new Error('SETTINGS: Element HELP_BUTTON not found');
      }
    }

    this.notify.node = document.getElementById(this.notify.id);

    if (!(this.notify.node instanceof HTMLElement)) {
      throw new Error('SETTINGS: Element NOTIFY not found');
    }
  }
}
