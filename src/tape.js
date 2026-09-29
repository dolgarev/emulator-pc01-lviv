import { Config } from './config.js';
import { Notify } from './notify.js';
import { assertInstance } from './utils/assert.js';

export class Tape {
  constructor(config) {
    assertInstance(config, Config, 'TAPE: Invalid CONFIG object');
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
