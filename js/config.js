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


function Config(emu_settings, profile) {
    if (!(emu_settings instanceof Setting)) {
        throw new Error('CONFIG: Invalid emulator settings');
    }

    switch (profile || emu_settings.computer.profile) {
        case 'default': case 'standart': case 'pc01_lvov': case 'pc01_lvov_80':
            var settings = {
                computer : {
                    model : 'ПК-01 "Львов"',
                    description : 'Серийная модель',
                    profile : 'pc01_lvov_80'
                },
                beeper : {
                    fix_control : false,
                    allow_sound : emu_settings.beeper.allow_sound,
                    allow_highpass_filter : emu_settings.beeper.allow_highpass_filter
                },
                cpu : {
                    model : 'i8080',
                    allow_interrupts : false
                },
                io : {
                    allow_extended_features : false
                },
                memory : {
                    map : 80,
                    fix_vram : false
                },
                rom : {
                    image : 1990
                },
                screen : {
                    resolution : 'default',
                    allow_color_mode : true,
                    screenshot_type : emu_settings.screen.screenshot_type
                },
                watcher : {
                    profile : 'default'
                }
            };
            break;

        case 'pc01_lvov_fixed': case 'pc01_lvov_80_fixed':
            var settings = {
                computer : {
                    model : 'ПК-01 "Львов"',
                    description : 'Серийная модель с некоторыми доработками',
                    profile : 'pc01_lvov_80_fixed'
                },
                beeper : {
                    fix_control : true,
                    allow_sound : emu_settings.beeper.allow_sound,
                    allow_highpass_filter : emu_settings.beeper.allow_highpass_filter
                },
                cpu : {
                    model : 'i8080',
                    allow_interrupts : false
                },
                io : {
                    allow_extended_features : false
                },
                memory : {
                    map : 80,
                    fix_vram : true
                },
                rom : {
                    image : 1990
                },
                screen : {
                    resolution : 'default',
                    allow_color_mode : true,
                    screenshot_type : emu_settings.screen.screenshot_type
                },
                watcher : {
                    profile : 'default'
                }
            };
            break;

        default:
            throw new Error('Unknow model');
    }

    if (!settings.cpu.clock_speed) {
        settings.cpu.clock_speed = emu_settings.cpu[settings.cpu.model].clock_speed;
    }

    if (!settings.cpu.frame_cycles) {
        settings.cpu.frame_cycles = emu_settings.cpu[settings.cpu.model].frame_cycles;
    }

    settings.cpu.frame_runtime = Math.round(settings.cpu.frame_cycles * 1000 / settings.cpu.clock_speed);
    if (emu_settings.computer.allow_turbo_mode) {
        settings.cpu.frame_runtime >>= 2;
    }

    if (!settings.memory.strict_mode) {
        settings.memory.strict_mode = emu_settings.memory.strict_mode;
    }

    if (!settings.tape) {
        settings.tape = emu_settings.tape;
    }

    if (!settings.dnd) {
        settings.dnd = emu_settings.dnd;
    }

    if ('allow_color_mode' in emu_settings.screen) {
        settings.screen.allow_color_mode = emu_settings.screen.allow_color_mode;
    }

    if ('fix_control' in emu_settings.beeper) {
        settings.beeper.fix_control = emu_settings.beeper.fix_control;
    }

    if ('image' in emu_settings.rom) {
        settings.rom.image = emu_settings.rom.image;
    }

    for (var prop in settings) {
        Object.defineProperty(this, prop, {
            enumerable : true,
            value : settings[prop]
        });
    }
}
