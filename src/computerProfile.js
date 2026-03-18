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

import { Tape } from './tape.js';
import { DnD } from './dnd.js';
import { Dump } from './dump.js';
import { Notify } from './notify.js';
import { Storage } from './storage.js';

export class ComputerProfile {
  /**
   * Конструктор с внедрением зависимостей (DI)
   */
  constructor({
    settings,
    profile,
    config,
    beeper,
    keyboard,
    io,
    memory,
    rom,
    cpu,
    viewport,
    screen,
    traps,
    tape,
    dnd,
  }) {
    this.settings = settings;
    this.profile = profile;
    this.config = config;
    this.beeper = beeper;
    this.keyboard = keyboard;
    this.io = io;
    this.memory = memory;
    this.rom = rom;
    this.traps = traps;
    this.cpu = cpu;
    this.viewport = viewport;
    this.screen = screen;
    this.tape = tape;
    this.dnd = dnd;

    this.attached_file = void 0;

    this.timers = {
      interrupt: void 0,
      animation: void 0,
      restart: void 0,
    };

    this.is_paused = false;
    this.is_suspended = false;
  }

  async initAsync() {
    await this.rom.init();

    this.traps.activate(this.config.traps.profile, this);

    if (this.settings.tape.is_connected) {
      if ('local_load_button' in this.settings.controls) {
        this.local_load_button_handler = () => {
          if (this.is_suspended) return;

          this.suspend();
          this.tape
            .load()
            .then((file) => {
              this.load(file);
              this.resume();
            })
            .catch(() => {
              this.resume();
            });
        };

        this.settings.controls.local_load_button.node.addEventListener(
          'click',
          this.local_load_button_handler
        );
      }
    }

    if (this.settings.dnd.is_connected) {
      this.dnd.attachDropHandler(() => {
        if (this.is_suspended) return;

        this.suspend();
        this.dnd
          .read()
          .then((file) => {
            this.load(file);
            this.resume();
          })
          .catch(() => {
            this.resume();
          });
      });
    }
  }

  run() {
    const self = this,
      beeper = this.beeper,
      cpu = this.cpu,
      f_duration = this.config.cpu.frame_duration,
      f_cycles = this.config.cpu.frame_cycles,
      keyboard = this.keyboard,
      screen = this.screen,
      viewport = this.viewport,
      timers = this.timers;

    if (this.is_suspended) {
      throw new Error('COMPUTER_PROFILE: MAIN LOOP suspended!');
    } else {
      window.setTimeout(main_loop, 0);
    }

    function main_loop() {
      if (keyboard.special_keys) {
        switch (keyboard.special_keys) {
          case keyboard.IS_PAUSE:
            self.pause();
            break;

          case keyboard.IS_SHOOT:
            self.shoot();
            break;

          case keyboard.IS_RESET:
            self.reset();
            break;

          case keyboard.IS_COLOR:
            screen.change_color_mode();
            break;

          case keyboard.IS_INC_PALETTE:
            screen.change_palette(1);
            break;

          case keyboard.IS_DEC_PALETTE:
            screen.change_palette(-1);
            break;
        }
        keyboard.reset_special_keys();
      }

      const t_start = window.performance.now();

      if (!self.is_paused) {
        cpu.run(f_cycles);
      }

      const t_end = window.performance.now();

      if (!self.is_suspended) {
        const delay = f_duration - ~~(t_end - t_start);

        timers.interrupt = window.setTimeout(interrupt_handler, delay > 0 ? delay : 0);
      }
    }

    function interrupt_handler() {
      beeper.play();
      timers.animation = window.requestAnimationFrame(() => {
        viewport.renderScreen(screen);
        timers.restart = window.setTimeout(main_loop, 0);
      });
    }
  }

  pause(state = !this.is_paused) {
    this.is_paused = state;

    this.viewport.pause(this.is_paused);
  }

  resume() {
    this.is_suspended = false;

    this.cpu.idle(this.is_suspended);
    //Уходим от залипания клавиш
    this.keyboard.reset();

    window.setTimeout(this.run.bind(this), 0);
  }

  suspend() {
    this.is_suspended = true;

    this.cpu.idle(this.is_suspended);

    //Экран необходимо перерисовать, чтобы отобразить изменения,
    //которые произошли до блокировки, поскольку
    //запрос requestAnimationFrame будет остановлен.
    this.viewport.renderScreen(this.screen);
    this.beeper.play();

    window.clearTimeout(this.timers.interrupt);
    window.cancelAnimationFrame(this.timers.animation);
    window.clearTimeout(this.timers.restart);
  }

  reset() {
    this.beeper.restart();
    this.keyboard.restart();
    this.io.restart();
    this.memory.restart();
    this.cpu.restart();
    this.screen.restart();
    this.rom.restart();

    this.detach_file();
  }

  shoot() {
    if (!this.hasTape()) return;

    this.suspend();

    const srctype = this.config.screen.screenshot_type ?? 'image/png';

    this.viewport.takeScreenshoot(async (blob) => {
      try {
        if (blob) {
          const extension = getFileExtension(srctype);
          const filename = generateScreenshotFilename(extension);
          await this.tape.save(blob, filename);
        } else {
          console.error('COMPUTER_PROFILE: Failed to create blob from canvas.');
        }
      } finally {
        this.resume();
      }
    }, srctype);
  }

  terminate() {
    this.suspend();
    this.viewport.terminate();

    if (this.hasTape()) {
      this.tape.terminate();

      if (typeof this.local_load_button_handler === 'function') {
        this.settings.controls.local_load_button.node.removeEventListener(
          'click',
          this.local_load_button_handler
        );
        this.local_load_button_handler = null;
      }
    }

    if (this.dnd instanceof DnD) {
      this.dnd.close();
    }

    'settings,config,beeper,keyboard,io,memory,rom,cpu,viewport,screen,tape,dnd'
      .split(',')
      .forEach(function (prop) {
        this[prop] = null;
      }, this);

    this.detach_file();
  }

  get_description() {
    const computer = this.config.computer;

    return {
      model: computer.model,
      description: computer.description,
      profile: computer.profile,
    };
  }

  hasTape() {
    return this.tape instanceof Tape;
  }

  async load(data) {
    if (!(data instanceof DataView)) {
      throw new Error('PROFILE: Param DATA is not DataView');
    }

    switch (data.getUint8(0x09)) {
      case 0x2f:
        if (validateFileHeader(data.buffer, 'LVOV/DUMP/2.0/H+')) {
          this.set_snapshot(data);
        } else {
          Notify.show('Invalid file structure.');
          console.log('PROFILE: Invalid file structure');
        }
        break;

      case 0x33:
        if (validateFileHeader(data.buffer, 'Emulator 3000')) {
          this.set_e3_snapshot(data);
        } else {
          Notify.show('Invalid file structure.');
          console.log('PROFILE: Invalid file structure');
        }
        break;

      case 0xd0:
        this.attach_file(data);
        await this.load_dump(await Dump.get('bload'));
        break;

      case 0xd3:
        this.attach_file(data);
        await this.load_dump(await Dump.get('cload'));
        break;

      default:
        throw new Error('PROFILE: Unknownn file type');
    }
  }

  get_snapshot() {
    return Storage.get_snapshot.call(this);
  }

  set_snapshot(data) {
    return Storage.set_snapshot.call(this, data);
  }

  set_e3_snapshot(data) {
    return Storage.set_e3_snapshot.call(this, data);
  }

  async load_dump(dump) {
    if (!(dump instanceof Dump)) {
      throw new Error('PROFILE: Received invalid DUMP object');
    }

    switch (dump.type) {
      case 'lvt':
        switch (dump.data.getUint8(0x09)) {
          case 0xd0:
            this.set_snapshot((await Dump.get('bload')).data);
            break;

          case 0xd3:
            this.set_snapshot((await Dump.get('cload')).data);
            break;

          default:
            throw new Error('PROFILE: Unknownn FILE type');
        }
        this.attach_file(dump.data);
        break;

      case 'sav':
        this.set_snapshot(dump.data);
        break;

      case 'e3':
        this.set_e3_snapshot(dump.data);
        break;

      default:
        throw new Error('PROFILE: Unknownn DUMP type');
    }
  }

  bload(data) {
    return Storage.bload.call(this, data);
  }

  cload(data) {
    return Storage.cload.call(this, data);
  }

  get_file() {
    if (!this.exists_attached_file()) {
      throw new Error('PROFILE: Param ATTACHED_FILE is not DataView');
    }

    return this.attached_file;
  }

  attach_file(file) {
    if (!(file instanceof DataView)) {
      throw new Error('PROFILE: Param FILE is not DataView');
    }

    this.attached_file = file;
  }

  detach_file() {
    this.attached_file = null;
  }

  exists_attached_file() {
    return this.attached_file instanceof DataView;
  }
}

const validateFileHeader = (data, magicString) => {
  return (
    new TextDecoder('utf-8').decode(new Uint8Array(data, 0, magicString.length - 1)) === magicString
  );
};

const generateScreenshotFilename = (extension, prefix = 'screenshot') => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;

  const filename = `${prefix}_${timestamp}.${extension}`;
  return filename;
};

const getFileExtension = (mimeType) => {
  // Определяем расширение файла на основе srctype
  let extension = 'bin'; // Расширение по умолчанию
  switch (mimeType) {
    case 'image/png':
      extension = 'png';
      break;
    case 'image/jpeg':
      extension = 'jpg';
      break;
    case 'image/webp':
      extension = 'webp';
      break;
    default: {
      // Пытаемся извлечь расширение из MIME-типа, если оно не является одним из известных
      const parts = mimeType.split('/');
      if (parts.length > 1) {
        extension = parts[1].split(';')[0]; // Извлекаем подтип и убираем параметры (например, ';base64')
      }
      if (!extension) {
        extension = 'bin'; // Если не удалось извлечь, возвращаемся к 'bin'
        console.warn(
          `COMPUTER_PROFILE: Unknown screenshot type '${mimeType}', defaulting to '.bin' extension.`
        );
      }
      break;
    }
  }

  return extension;
};
