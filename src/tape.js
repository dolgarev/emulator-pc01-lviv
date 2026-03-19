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

import { Config } from './config.js';
import { Notify } from './notify.js';

export class Tape {
  constructor(config) {
    if (!(config instanceof Config)) {
      throw new Error('TAPE: Invalid CONFIG object');
    }
    this.config = config;
  }

  terminate() {
    this.config = null;
  }

  async load() {
    const file = await this.pickFile();

    if (!file) {
      throw new Error('No file selected');
    }

    if (!this.is_file(file)) {
      Notify.show('Invalid file format.');
      throw new Error('Invalid file format.');
    }

    return this.read(file);
  }

  pickFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';

      input.addEventListener('change', (e) => {
        resolve(e.target.files?.[0]);
      });

      input.addEventListener('cancel', () => {
        resolve(null);
      });

      input.addEventListener('focusout', () => {
        setTimeout(() => resolve(null), 100);
      });

      input.click();
    });
  }

  async read(file) {
    try {
      const buffer = await file.arrayBuffer();
      return new DataView(buffer);
    } catch (err) {
      console.error('TAPE: Read failed.', err);
      Notify.show(`File "${file.name}" not loaded.`);
      throw err;
    }
  }

  store(data, options = {}) {
    const { name = 'untitled', ext = 'sav', mime = 'application/octet-stream' } = options;

    const finalMime = ext === 'sav' || ext === 'lvt' ? 'application/octet-stream' : mime;

    const buffer = data.buffer ? data.buffer : data;
    const blob = new Blob([buffer], { type: finalMime });
    const filename = `${name}.${ext}`;

    return this.save(blob, filename);
  }

  save(blob, filename = 'download.sav') {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      queueMicrotask(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });

      return Promise.resolve();
    } catch (e) {
      console.error('TAPE: Save failed.');
      Notify.show(`File "${filename}" not saved.`);
      throw e;
    }
  }

  is_file(file) {
    return (
      file instanceof File && file.size > 0 && file.name.match(this.config.tape.file_extensions)
    );
  }
}
