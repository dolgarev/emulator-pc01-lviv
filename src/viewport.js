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

export function Viewport(emu_settings) {
  if (!(emu_settings instanceof Setting)) {
    throw new Error('VIEWPORT: Invalid emulator settings');
  }

  this.container = emu_settings.viewport.container.node;

  this.CANVAS_HEIGHT = 256;
  this.CANVAS_WIDTH = 256;
  this.SCALE = 2;

  this.init();
}

Viewport.prototype.init = function () {
  this.canvas = document.createElement('canvas');
  this.canvas.style.imageRendering = '-webkit-optimize-contrast';

  this.set_resolution(this.CANVAS_WIDTH, this.CANVAS_HEIGHT, this.SCALE);
  this.container.appendChild(this.canvas);
};

Viewport.prototype.terminate = function () {
  if (this.canvas instanceof HTMLCanvasElement) {
    this.canvas.remove();
    this.container = this.canvas = null;
  }
};

Viewport.prototype.pause = function (state) {
  this.canvas.classList[state ? 'add' : 'remove']('pause');
};

Viewport.prototype.set_resolution = function (width, height, scale = 1) {
  this.canvas.width = width;
  this.canvas.height = height;
  this.canvas.style.width = `${width * scale}px`;
  this.canvas.style.height = `${height * scale}px`;
};
