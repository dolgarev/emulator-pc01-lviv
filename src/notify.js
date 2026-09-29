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

import { assertInstance } from './utils/assert.js';

export class Notify {
  static instance = null;

  static create(node, delay) {
    Notify.instance ??= new Notify(node, delay);
    return Notify.instance;
  }

  static show(message) {
    if (Notify.instance instanceof Notify) {
      Notify.instance.show(message);
    } else {
      throw new Error('NOTIFY: Object is not initialized');
    }
  }

  constructor(node, delay = 5000) {
    assertInstance(node, HTMLElement, 'NOTIFY: Invalid element');

    this.node = node;
    this.delay = delay;
    this.timer = undefined;

    this.handlers = {
      close: this.close.bind(this),
    };

    this.node.lastChild.addEventListener('click', this.handlers.close, false);

    Notify.instance = this;
  }

  close() {
    window.clearTimeout(this.timer);
    this.hide();
  }

  show(message) {
    if (this.node.classList.contains('notify_show')) {
      window.clearTimeout(this.timer);
    } else {
      this.node.classList.add('notify_show');
    }

    this.node.firstChild.textContent = message;
    this.timer = window.setTimeout(this.handlers.close, this.delay);
  }

  hide() {
    this.node.firstChild.textContent = '';
    this.node.classList.remove('notify_show');
  }

  terminate() {
    this.close();
    this.node.lastChild.removeEventListener('click', this.handlers.close);

    if (Notify.instance === this) {
      Notify.instance = null;
    }
  }
}
