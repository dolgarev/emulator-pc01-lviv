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


function Profile(emu_settings, profile) {
    if (!(emu_settings instanceof Setting)) {
        throw new Error('PROFILE: Invalid emulator settings');
    }
    this.settings = emu_settings;

    this.config = new Config(this.settings, profile);
    this.beeper = new Beeper(this.config);
    this.keyboard = new Keyboard();
    this.io = new IO(this.config, this.beeper, this.keyboard);
    this.memory = new Memory(this.config, this.io);
    this.rom = new Rom(this.config, this.memory);
    this.cpu = new I8080(this.config, this.memory, this.io);
    this.viewport = new Viewport(this.settings);
    this.screen = new Screen(this.config, this.io, this.memory, this.viewport);

    this.attached_file = void 0;

    this.timers = {
        interrupt : void 0,
        animation : void 0,
        restart : void 0
    };

    this.is_paused = false;
    this.is_suspended = false;

    this.init();
}

Profile.prototype.init = function() {
    if ('watcher' in this.config) {
        this.cpu.set_traps(Watcher.get(this.config.watcher.profile, this));
    }

    if (this.settings.tape.is_connected) {
        this.tape = new Tape(this.config);

        if ('local_load_button' in this.settings.controls) {
            this.local_load_button_handler = (function() {
                if (!this.is_suspended) {
                    this.suspend();

                    this.tape.load().then((function(file) {
                        this.load(file);
                        this.resume();
                    }).bind(this), this.resume.bind(this));
                }
            }).bind(this);

            this.settings.controls.local_load_button.node.addEventListener('click', this.local_load_button_handler);
        }
    }

    if (this.settings.dnd.is_connected) {
        this.dnd = new DnD(this.config, (function() {
            if (!this.is_suspended) {
                this.suspend();

                this.dnd.read().then((function(file) {
                    this.load(file);
                    this.resume();
                }).bind(this), this.resume.bind(this));
            }
        }).bind(this));
    }
};

Profile.prototype.run = function() {
    var self = this,
        beeper = this.beeper,
        cpu = this.cpu,
        f_duration = this.config.cpu.frame_duration,
        f_cycles = this.config.cpu.frame_cycles,
        keyboard = this.keyboard,
        screen = this.screen,
        timers = this.timers;

    if (this.is_suspended) {
        throw new Error('PROFILE: MAIN LOOP suspended!');
    }
    else {
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

        var t_start = window.performance.now();

        if (!self.is_paused) {
            cpu.run(f_cycles);
        }

        var t_end = window.performance.now();

        if (!self.is_suspended) {
            var delay = f_duration - ~~(t_end - t_start);

            timers.interrupt = window.setTimeout(interrupt_handler, delay > 0 ? delay : 0);
        }
    }

    function interrupt_handler() {
        beeper.play();
        timers.animation = window.requestAnimationFrame(animation_handler, screen.canvas);
    }

    function animation_handler() {
        screen.draw();
        timers.restart = window.setTimeout(main_loop, 0);
    }
};

Profile.prototype.pause = function(state) {
    if (state === void 0) {
        this.is_paused = !this.is_paused;
    }
    else {
        this.is_paused = state;
    }

    this.viewport.pause(this.is_paused);
};

Profile.prototype.resume = function() {
    this.is_suspended = false;

    this.cpu.idle(this.is_suspended);
    //Уходим от залипания клавиш
    this.keyboard.reset();

    window.setTimeout(this.run.bind(this), 0);
};

Profile.prototype.suspend = function() {
    this.is_suspended = true;

    this.cpu.idle(this.is_suspended);

    //Экран необходимо перерисовать, чтобы отобразить изменения,
    //которые произошли до блокировки, поскольку
    //запрос requestAnimationFrame будет остановлен.
    this.screen.draw();
    this.beeper.play();

    window.clearTimeout(this.timers.interrupt);
    window.cancelAnimationFrame(this.timers.animation);
    window.clearTimeout(this.timers.restart);
};

Profile.prototype.reset = function() {
    this.beeper.restart();
    this.keyboard.restart();
    this.io.restart();
    this.memory.restart();
    this.cpu.restart();
    this.screen.restart();
    this.rom.restart();

    this.detach_file();
};

Profile.prototype.shoot = function() {
    if (this.tape instanceof Tape) {
        //canvas.toBlob() до сих пор нет в Chrome/Chromium,
        //поэтому воспользуемся костылем из оф.багтрекера
        //[https://code.google.com/p/chromium/issues/detail?id=67587#c49]

        var blob = (function(data) {
            var parts = data.match(/data:([^;]*)(;base64)?,([0-9A-Za-z+/]+)/),
                bin_str = atob(parts[3]),
                view = new Uint8ClampedArray(new ArrayBuffer(bin_str.length));

            for(var i = 0, l = view.length; i < l; i++) {
                view[i] = bin_str.charCodeAt(i);
            }

            return new Blob([view], {'type': parts[1]});
        })(this.screen.shoot());

        var F = this.resume.bind(this);

        this.suspend();
        this.tape.save(blob, [{mimeTypes: ['image/*']}]).then(F, F);
    }
};

Profile.prototype.terminate = function() {
    this.suspend();
    this.viewport.terminate();

    if (this.tape && this.tape instanceof Tape) {
        this.tape.terminate();

        if (this.local_load_button_handler && this.local_load_button_handler instanceof Function) {
            this.settings.controls.local_load_button.node.removeEventListener('click', this.local_load_button_handler);
            this.local_load_button_handler = null;
        }
    }

    if (this.dnd && this.dnd instanceof DnD) {
        this.dnd.close();
    }

    'settings,config,beeper,keyboard,io,memory,rom,cpu,viewport,screen,tape,dnd'.split(',').forEach(function(prop) {
        this[prop] = null;
    }, this);

    this.detach_file();
};

Profile.prototype.get_description = function() {
    var computer = this.config.computer;

    return {
        model: computer.model,
        description: computer.description,
        profile: computer.profile
    };
};

Profile.prototype.load = function(data) {
    if (!(data instanceof DataView)) {
        throw new Error('PROFILE: Param DATA is not DataView');
    }

    switch (data.getUint8(0x09)) {
        case 0x2F:
            //[http://updates.html5rocks.com/2012/06/How-to-convert-ArrayBuffer-to-and-from-String]
            if (String.fromCharCode.apply(null, new Uint8Array(data.buffer, 0, 16)) === 'LVOV/DUMP/2.0/H+') {
                this.set_snapshot(data);
            }
            else {
                Notify().show('Invalid file structure.');
                console.log('PROFILE: Invalid file structure');
            }
            break;

        case 0x33:
            //[http://updates.html5rocks.com/2012/06/How-to-convert-ArrayBuffer-to-and-from-String]
            if (String.fromCharCode.apply(null, new Uint8Array(data.buffer, 0, 13)) === 'Emulator 3000') {
                this.set_e3_snapshot(data);
            }
            else {
                Notify().show('Invalid file structure.');
                console.log('PROFILE: Invalid file structure');
            }
            break;

        case 0xD0:
            this.attach_file(data);
            this.load_dump(Dump.get('bload'));
            break;

        case 0xD3:
            this.attach_file(data);
            this.load_dump(Dump.get('cload'));
            break;

        default:
            throw new Error('PROFILE: Unknown file type');
    }
};

Profile.prototype.get_snapshot = function() {
    //Заголовок вида: LVOV/DUMP/2.0/H+\0
    var data = [
            0x4C, 0x56, 0x4F, 0x56, 0x2F, 0x44, 0x55, 0x4D,
            0x50, 0x2F, 0x32, 0x2E, 0x30, 0x2F, 0x48, 0x2B,
            0x00
        ].concat(this.memory.get_state(), this.io.get_state()),
        cpu_state = this.cpu.get_state();

    data.push((cpu_state.BC & 0xFF00) >> 8);    //B
    data.push(cpu_state.BC & 0x00FF);           //C
    data.push((cpu_state.DE & 0xFF00) >> 8);    //D
    data.push(cpu_state.DE & 0x00FF);           //E
    data.push((cpu_state.HL & 0xFF00) >> 8);    //H
    data.push(cpu_state.HL & 0x00FF);           //L
    data.push((cpu_state.AF & 0xFF00) >> 8);    //A
    data.push(cpu_state.AF & 0x00FF);           //F
    data.push(cpu_state.SP & 0x00FF);           //SP
    data.push((cpu_state.SP & 0xFF00) >> 8);
    data.push(cpu_state.PC & 0x00FF);           //PC
    data.push((cpu_state.PC & 0xFF00) >> 8);

    return data;
};

Profile.prototype.set_snapshot = function(data) {
    if (!(data instanceof DataView)) {
        throw new Error('PROFILE: Param DATA is not DataView');
    }

    var offset = 0x11;

    this.io.restart();
    offset = this.memory.transfer(0x0000, 0xBFFF, data, offset);
    offset = this.memory.transfer(0xC000, 0xFFFF, data, offset, this.memory.get_rom_page(), 'burn');
    offset = this.memory.transfer(0x4000, 0x7FFF, data, offset, this.memory.get_vram_page());

    for (var port = 0x00; port <= 0xFF; port++) {
        this.io.output(port, data.getUint8(offset++));
    }

    //Фикс проблемы с палитрами. Из-за того, что по умолчанию порт 0xC1
    //доступен только на запись, вместо реального значения палитры
    //сохраняется 0xFF. Чтобы это обойти, выставляем дефолтную палитру.
    if (this.io.input(this.io.PALETTE_PORT) === 0xFF) {
        this.io.output(this.io.PALETTE_PORT, 0x8F);
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
        PC: data.getUint16(offset + 0x0A, true)
    });
};

Profile.prototype.set_e3_snapshot = function(data) {
    if (!(data instanceof DataView)) {
        throw new Error('PROFILE: Param DATA is not DataView');
    }

    var offset = 0x240;

    this.io.restart();
    offset = this.memory.transfer(0x0000, 0xBFFF, data, offset);
    offset = this.memory.transfer(0xC000, 0xFFFF, data, offset, this.memory.get_rom_page(), 'burn');
    offset = this.memory.transfer(0x4000, 0x7FFF, data, offset += 0x29, this.memory.get_vram_page());

    //PPI1
    this.io.ports[0xC0] = data.getUint8(offset + 0x22);
    this.io.ports[0xC1] = data.getUint8(offset + 0x26);
    this.io.ports[0xC2] = data.getUint8(offset + 0x2A);
    //В i8255A CWR доступен только для записи.
    //this.io.ports[0xC3] = data.getUint8(offset + 0x34);

    //PPI2
    this.io.ports[0xD0] = data.getUint8(offset + 0x44);
    this.io.ports[0xD1] = data.getUint8(offset + 0x48);
    this.io.ports[0xD2] = data.getUint8(offset + 0x4C);
    //В i8255A CWR доступен только для записи.
    //this.io.ports[0xD3] = data.getUint8(offset + 0x56);

    this.cpu.restart();
    this.cpu.set_state({
        A: data.getUint8(0x1BA),
        F: data.getUint8(0x1BE),
        B: data.getUint8(0x1C2),
        C: data.getUint8(0x1C6),
        D: data.getUint8(0x1CA),
        E: data.getUint8(0x1CE),
        H: data.getUint8(0x1D2),
        L: data.getUint8(0x1D6),
        SP: data.getUint16(0x1DB, true),
        PC: data.getUint16(0x1E1, true)
    });
};

Profile.prototype.load_dump = function(dump) {
    if (!(dump instanceof Dump)) {
        throw new Error('PROFILE: Received invalid DUMP object');
    }

    switch (dump.type) {
        case 'lvt':
            switch (dump.data.getUint8(0x09)) {
                case 0xD0:
                    this.set_snapshot(Dump.get('bload').data);
                    break;

                case 0xD3:
                    this.set_snapshot(Dump.get('cload').data);
                    break;

                default:
                    throw new Error('PROFILE: Unknown FILE type');
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
            throw new Error('PROFILE: Unknown DUMP type');
    }
};

Profile.prototype.bload = function(data) {
    if (!(data instanceof DataView)) {
        throw new Error('PROFILE: Param DATA is not DataView');
    }

    var type = data.getUint8(0x09),
        offset = this.cpu.memory_read_word(0xBEAB),
        begin = data.getUint16(0x10, true) + offset,
        end = data.getUint16(0x12, true) + offset,
        start = data.getUint16(0x14, true);

    if (type === 0xD0) {
        try {
            this.memory.transfer(0xBE92, 0xBE97, data, 0x0A);
            this.cpu.memory_write_word(0xBEA4, begin);
            this.cpu.memory_write_word(0xBEA6, end);
            this.cpu.memory_write_word(0xBEA9, start);
            this.memory.transfer(begin, end, data, 0x16);
        }
        catch (e) {
            return false;
        }

        return true;
    }
    else {
        return false;
    }
};

Profile.prototype.cload = function(data) {
    if (!(data instanceof DataView)) {
        throw new Error('PROFILE: Param DATA is not DataView');
    }

    var type = data.getUint8(0x09),
        begin = this.cpu.memory_read_word(0x0243),
        end = begin + data.byteLength - 0x11;

    if (type === 0xD3) {
        try {
            this.memory.transfer(0xBE92, 0xBE97, data, 0x0A);
            this.cpu.memory_write_word(0x0245, end);
            this.memory.transfer(begin, end, data, 0x10);
        }
        catch (e) {
            return false;
        }

        return true;
    }
    else {
        return false;
    }
};

Profile.prototype.get_file = function() {
    if (!this.exists_attached_file()) {
        throw new Error('PROFILE: Param ATTACHED_FILE is not DataView');
    }

    return this.attached_file;
};

Profile.prototype.attach_file = function(file) {
    if (!(file instanceof DataView)) {
        throw new Error('PROFILE: Param FILE is not DataView');
    }

    this.attached_file = file;
};

Profile.prototype.detach_file = function() {
    this.attached_file = null;
};

Profile.prototype.exists_attached_file = function() {
    return this.attached_file instanceof DataView;
};
