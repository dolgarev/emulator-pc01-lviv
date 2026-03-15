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

    // Сохраняем информацию о том, какие компоненты были внедрены
    this._injectedComponents = {
      config: !!config,
      beeper: !!beeper,
      keyboard: !!keyboard,
      io: !!io,
      memory: !!memory,
      rom: !!rom,
      cpu: !!cpu,
      viewport: !!viewport,
      screen: !!screen,
    };
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
    if (this.hasTape()) {
      const F = this.resume.bind(this);
      this.suspend();

      const srctype = this.config.screen.screenshot_type ?? 'image/png';

      // Определяем расширение файла на основе srctype
      let extension = 'bin'; // Расширение по умолчанию
      switch (srctype) {
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
          const parts = srctype.split('/');
          if (parts.length > 1) {
            extension = parts[1].split(';')[0]; // Извлекаем подтип и убираем параметры (например, ';base64')
          }
          if (!extension) {
            extension = 'bin'; // Если не удалось извлечь, возвращаемся к 'bin'
            console.warn(
              `COMPUTER_PROFILE: Unknown screenshot type '${srctype}', defaulting to '.bin' extension.`
            );
          }
          break;
        }
      }

      // Генерируем метку времени для имени файла
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;

      const filename = `screenshot_${timestamp}.${extension}`;

      this.viewport.takeScreenshoot((blob) => {
        if (blob) {
          this.tape.save(blob, filename).then(F, F);
        } else {
          console.error('COMPUTER_PROFILE: Failed to create blob from canvas.');
          F();
        }
      }, srctype);
    }
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
        //[http://updates.html5rocks.com/2012/06/How-to-convert-ArrayBuffer-to-and-from-String]
        if (
          String.fromCharCode.apply(null, new Uint8Array(data.buffer, 0, 16)) === 'LVOV/DUMP/2.0/H+'
        ) {
          this.set_snapshot(data);
        } else {
          Notify.show('Invalid file structure.');
          console.log('PROFILE: Invalid file structure');
        }
        break;

      case 0x33:
        //[http://updates.html5rocks.com/2012/06/How-to-convert-ArrayBuffer-to-and-from-String]
        if (
          String.fromCharCode.apply(null, new Uint8Array(data.buffer, 0, 13)) === 'Emulator 3000'
        ) {
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
    //Заголовок вида: LVOV/DUMP/2.0/H+\0
    const data = [
        0x4c, 0x56, 0x4f, 0x56, 0x2f, 0x44, 0x55, 0x4d, 0x50, 0x2f, 0x32, 0x2e, 0x30, 0x2f, 0x48,
        0x2b, 0x00,
      ].concat(this.memory.get_state(), this.io.get_state()),
      cpu_state = this.cpu.get_state();

    data.push((cpu_state.BC & 0xff00) >> 8); //B
    data.push(cpu_state.BC & 0x00ff); //C
    data.push((cpu_state.DE & 0xff00) >> 8); //D
    data.push(cpu_state.DE & 0x00ff); //E
    data.push((cpu_state.HL & 0xff00) >> 8); //H
    data.push(cpu_state.HL & 0x00ff); //L
    data.push((cpu_state.AF & 0xff00) >> 8); //A
    data.push(cpu_state.AF & 0x00ff); //F
    data.push(cpu_state.SP & 0x00ff); //SP
    data.push((cpu_state.SP & 0xff00) >> 8);
    data.push(cpu_state.PC & 0x00ff); //PC
    data.push((cpu_state.PC & 0xff00) >> 8);

    return data;
  }

  set_snapshot(data) {
    if (!(data instanceof DataView)) {
      throw new Error('PROFILE: Param DATA is not DataView');
    }

    let offset = 0x11;

    this.io.restart();
    offset = this.memory.transfer(0x0000, 0xbfff, data, offset);
    offset = this.memory.transfer(0xc000, 0xffff, data, offset, this.memory.get_rom_page(), 'burn');
    offset = this.memory.transfer(0x4000, 0x7fff, data, offset, this.memory.get_vram_page());

    for (let port = 0x00; port <= 0xff; port++) {
      this.io.output(port, data.getUint8(offset++));
    }

    //Фикс проблемы с палитрами. Из-за того, что по умолчанию порт 0xC1
    //доступен только на запись, вместо реального значения палитры
    //сохраняется 0xFF. Чтобы это обойти, выставляем дефолтную палитру.
    if (this.io.input(this.io.PALETTE_PORT) === 0xff) {
      this.io.output(this.io.PALETTE_PORT, 0x8f);
    }

    this.cpu.restart();
    this.cpu.set_state({
      B: data.getUint8(offset + 0x00),
      C: data.getUint8(offset + 0x01),
      D: data.getUint8(offset + 0x02),
      E: data.getUint8(offset + 0x03),
      H: data.getUint8(offset + 0x04),
      L: data.getUint8(offset + 0x05),
      A: data.getUint8(offset + 0x06),
      F: data.getUint8(offset + 0x07),
      SP: data.getUint16(offset + 0x08, true),
      PC: data.getUint16(offset + 0x0a, true),
    });
  }

  set_e3_snapshot(data) {
    if (!(data instanceof DataView)) {
      throw new Error('PROFILE: Param DATA is not DataView');
    }

    let offset = 0x240;

    this.io.restart();
    offset = this.memory.transfer(0x0000, 0xbfff, data, offset);
    offset = this.memory.transfer(0xc000, 0xffff, data, offset, this.memory.get_rom_page(), 'burn');
    offset = this.memory.transfer(0x4000, 0x7fff, data, offset + 0x29, this.memory.get_vram_page());

    //PPI1
    this.io.ports[0xc0] = data.getUint8(offset + 0x22);
    this.io.ports[0xc1] = data.getUint8(offset + 0x26);
    this.io.ports[0xc2] = data.getUint8(offset + 0x2a);
    //В i8255A CWR доступен только для записи.
    //this.io.ports[0xC3] = data.getUint8(offset + 0x34);

    //PPI2
    this.io.ports[0xd0] = data.getUint8(offset + 0x44);
    this.io.ports[0xd1] = data.getUint8(offset + 0x48);
    this.io.ports[0xd2] = data.getUint8(offset + 0x4c);
    //В i8255A CWR доступен только для записи.
    //this.io.ports[0xD3] = data.getUint8(offset + 0x56);

    this.cpu.restart();
    this.cpu.set_state({
      A: data.getUint8(0x1ba),
      F: data.getUint8(0x1be),
      B: data.getUint8(0x1c2),
      C: data.getUint8(0x1c6),
      D: data.getUint8(0x1ca),
      E: data.getUint8(0x1ce),
      H: data.getUint8(0x1d2),
      L: data.getUint8(0x1d6),
      SP: data.getUint16(0x1db, true),
      PC: data.getUint16(0x1e1, true),
    });
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
    if (!(data instanceof DataView)) {
      throw new Error('PROFILE: Param DATA is not DataView');
    }

    const type = data.getUint8(0x09),
      offset = this.cpu.memory_read_word(0xbeab),
      begin = data.getUint16(0x10, true) + offset,
      end = data.getUint16(0x12, true) + offset,
      start = data.getUint16(0x14, true);

    if (type === 0xd0) {
      try {
        this.memory.transfer(0xbe92, 0xbe97, data, 0x0a);
        this.cpu.memory_write_word(0xbea4, begin);
        this.cpu.memory_write_word(0xbea6, end);
        this.cpu.memory_write_word(0xbea9, start);
        this.memory.transfer(begin, end, data, 0x16);
      } catch (_e) {
        return false;
      }

      return true;
    } else {
      return false;
    }
  }

  cload(data) {
    if (!(data instanceof DataView)) {
      throw new Error('PROFILE: Param DATA is not DataView');
    }

    const type = data.getUint8(0x09),
      begin = this.cpu.memory_read_word(0x0243),
      end = begin + data.byteLength - 0x11;

    if (type === 0xd3) {
      try {
        this.memory.transfer(0xbe92, 0xbe97, data, 0x0a);
        this.cpu.memory_write_word(0x0245, end);
        this.memory.transfer(begin, end, data, 0x10);
      } catch (_e) {
        return false;
      }

      return true;
    } else {
      return false;
    }
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
