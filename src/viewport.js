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

// Aspect ratio constants for screen scaling
// Original PC-01 had non-square pixels, modern displays need correct aspect ratio
const _ASPECT_RATIO_1_1 = 1.0; // Square pixels (current implementation)
const ASPECT_RATIO_4_3 = 4 / 3; // Traditional CRT aspect ratio
const _ASPECT_RATIO_16_9 = 16 / 9; // Widescreen aspect ratio

// Current aspect ratio setting (can be changed to ASPECT_RATIO_4_3 or ASPECT_RATIO_16_9)
const ASPECT_RATIO = ASPECT_RATIO_4_3;

const IMAGE_RENDERING = 'crisp-edges'; // -webkit-optimize-contrast | pixelated | crisp-edges
const IMAGE_SMOOTHING_ENABLED = false;

export class Viewport {
  constructor(emu_settings) {
    if (!(emu_settings instanceof Settings)) {
      throw new Error('VIEWPORT: Invalid emulator settings');
    }

    this.canvas = document.createElement('canvas');
    this.container = emu_settings.viewport.container.node;

    this.CANVAS_HEIGHT = 256;
    this.CANVAS_WIDTH = 256;
    this.SCALE = 2;
    this.ASPECT_RATIO = ASPECT_RATIO;

    this.init();
  }

  init() {
    this.canvas.style.imageRendering = IMAGE_RENDERING
    this.set_resolution();
    this.container.appendChild(this.canvas);
  }

  terminate() {
    if (this.canvas instanceof HTMLCanvasElement) {
      this.canvas.remove();
      this.container = this.canvas = null;
    }
  }

  pause(state) {
    this.canvas.classList[state ? 'add' : 'remove']('pause');
  }

  set_resolution(
    width = this.CANVAS_WIDTH,
    height = this.CANVAS_HEIGHT,
    aspectRatio = this.ASPECT_RATIO,
    scale = this.SCALE
  ) {
    this.canvas.width = width;
    this.canvas.height = height;

    // Apply aspect ratio scaling to width
    const scaledWidth = width * scale * aspectRatio;
    const scaledHeight = height * scale;

    this.canvas.style.width = `${scaledWidth}px`;
    this.canvas.style.height = `${scaledHeight}px`;
  }

  render(image_data) {
    if (!image_data) return;

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('VIEWPORT: 2D context not available');
    }

    // Enable image smoothing for better visual quality
    context.imageSmoothingEnabled = IMAGE_SMOOTHING_ENABLED;

    context.putImageData(image_data, 0, 0);
  }

  renderScreen(screen) {
    const image_data = screen.draw();
    this.render(image_data);
  }

  takeScreenshoot(cb) {
    this.canvas.toBlob(cb);
  }
}
