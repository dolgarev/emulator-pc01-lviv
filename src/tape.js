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

  load() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      // Map regex to accepts roughly, or let user pick any and validate after

      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) {
          reject(new Error('No file selected'));
          return;
        }
        if (!this.is_file(file)) {
          Notify.show('Invalid file format.');
          reject(new Error('Invalid file format.'));
          return;
        }
        this.read(file).then(resolve).catch(reject);
      };

      input.click();
    });
  }

  read(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => {
        console.log('TAPE: Read failed.');
        Tape.display_error(reader.error);
        Notify.show(`File "${file.name}" not loaded.`);
        reject(reader.error);
      };

      reader.onload = (evt) => {
        resolve(new DataView(evt.target.result));
      };

      reader.readAsArrayBuffer(file);
    });
  }

  store(data, options) {
    const default_options = {
      name: 'untitled',
      ext: 'sav',
      mime: 'application/octet-stream',
    };

    for (const key in default_options) {
      if (!Object.prototype.hasOwnProperty.call(options, key)) {
        options[key] = default_options[key];
      }
    }

    if (options.ext === 'sav' || options.ext === 'lvt') {
      options.mime = 'application/octet-stream';
    }

    // Convert DataView/Buffer to Blob
    const buffer = data.buffer ? data.buffer : data;
    const blob = new Blob([buffer], { type: options.mime });
    const filename = `${options.name}.${options.ext}`;

    return this.save(blob, filename);
  }

  save(blob, filename = 'download.sav') {
    return new Promise((resolve, reject) => {
      try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          resolve();
        }, 100);
      } catch (e) {
        console.log('TAPE: Save failed.');
        Tape.display_error(e);
        reject(e);
      }
    });
  }

  is_file(file) {
    return (
      file instanceof File && file.name.match(this.config.tape.file_extensions) && file.size > 0
    );
  }

  static display_error(e) {
    if (!e) return;
    console.error(e.message || e);
  }
}
