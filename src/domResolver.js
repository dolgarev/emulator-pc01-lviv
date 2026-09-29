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

/**
 * Resolves the DOM elements referenced by `Settings` and exposes them to the
 * components. This is the only place that touches the DOM on behalf of the
 * configuration, keeping `Settings` itself pure and testable.
 */
export class DomResolver {
  constructor(settings) {
    if (!(settings instanceof Settings)) {
      throw new Error('DOM_RESOLVER: Invalid Settings object');
    }

    this.viewport_container = DomResolver.resolve(
      settings.viewport.container.id,
      HTMLDivElement,
      'VIEWPORT'
    );

    this.dnd_container = DomResolver.resolve(settings.dnd.container.id, HTMLElement, 'DND');

    this.notify = DomResolver.resolve(settings.notify.id, HTMLElement, 'NOTIFY');

    this.local_load_button = settings.controls.local_load_button
      ? DomResolver.resolve(
          settings.controls.local_load_button.id,
          HTMLButtonElement,
          'LOCAL_LOAD_BUTTON'
        )
      : undefined;

    this.help_button = settings.controls.help_button
      ? DomResolver.resolve(settings.controls.help_button.id, HTMLButtonElement, 'HELP_BUTTON')
      : undefined;
  }

  static resolve(id, Type, label) {
    const node = document.getElementById(id);

    if (!(node instanceof Type)) {
      throw new Error(`DOM_RESOLVER: Element ${label} not found`);
    }

    return node;
  }
}
