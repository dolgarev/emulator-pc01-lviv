/*
 Copyright 2012 Google Inc.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.

 Author: Eric Bidelman (ericbidelman@chromium.org)
 */

import { Config } from './config.js';
import { Notify } from './notify.js';

export class DnD {
  constructor(config) {
    if (!(config instanceof Config)) {
      throw new Error('DnD: Invalid CONFIG object');
    }
    this.config = config;

    this.node = this.config.dnd.container.node;

    this.handlers = {
      dragenter: this.dragenter.bind(this),
      dragover: this.dragover.bind(this),
      dragleave: this.dragleave.bind(this),
      drop: this.drop.bind(this),
    };

    this.node.addEventListener('dragenter', this.handlers.dragenter);
    this.node.addEventListener('dragover', this.handlers.dragover);
    this.node.addEventListener('dragleave', this.handlers.dragleave);
    this.node.addEventListener('drop', this.handlers.drop);

    this.files = undefined;

    this.init();
  }

  init() {
    this.reset();
  }

  reset() {
    this.files = undefined;
  }

  close() {
    this.node.removeEventListener('dragenter', this.handlers.dragenter);
    this.node.removeEventListener('dragover', this.handlers.dragover);
    this.node.removeEventListener('dragleave', this.handlers.dragleave);
    this.node.removeEventListener('drop', this.handlers.drop);

    this.node = this.files = this.success_callback = this.handlers = null;
  }

  attachDropHandler(success_callback) {
    if (typeof success_callback !== 'function') {
      throw new Error('DnD: Callback must be function');
    }
    this.success_callback = success_callback;
  }

  dragenter(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    this.node.classList.add('dropping');
  }

  dragover(evt) {
    evt.stopPropagation();
    evt.preventDefault();
  }

  dragleave(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    this.node.classList.remove('dropping');
  }

  drop(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    this.node.classList.remove('dropping');

    let files = [];

    if (evt.dataTransfer.items?.length) {
      files = [...evt.dataTransfer.items]
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter(Boolean);
    } else if (evt.dataTransfer.files?.length) {
      files = evt.dataTransfer.files;
    }

    if (files.length) {
      this.files = files;
      queueMicrotask(this.success_callback);
    } else {
      console.warn('DnD: File not loaded');
      Notify.show('File not loaded. Try again.');
    }
  }

  async read() {
    const file = this.files[0];

    if (!this.is_file(file)) {
      const error = new Error(`File "${file.name}" not loaded.`);
      console.error('DnD: Read failed.', error);
      Notify.show(error.message);
      throw error;
    }

    try {
      const buffer = await file.arrayBuffer();
      return new DataView(buffer);
    } catch (err) {
      console.error('DnD: Read failed.', err);
      Notify.show(`File "${file.name}" not loaded.`);
      throw err;
    }
  }

  is_file(file) {
    return (
      file instanceof File && file.size > 0 && file.name.match(this.config.dnd.file_extensions)
    );
  }
}
