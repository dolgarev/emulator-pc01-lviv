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


function Setting(profile) {
    var default_settings = {
            viewport : {
                container : {
                    id : 'canvas_container'
                }
            },
            controls : {
                local_load_button : {
                    id : 'load_button',
                    node : void 0
                },
                help_button : {
                    id : 'help_button',
                    node : void 0
                }
            },
            notify : {
                id : 'notify',
                node : void 0,
                delay : 3000
            },
            beeper : {
                allow_sound : true,
                allow_highpass_filter : true
            },
            cpu : {
                i8080 : {
                    clock_speed : 2.2 * 1000000,
                    frame_cycles : 44800
                }
            },
            memory : {
                strict_mode : false
            },
            rom : {
                image : 1990
            },
            screen : {
                allow_color_mode : true,
                screenshot_type : 'image/png'
            },
            dump : {
                is_connected : true,
                default_dump : 'aerco1'
            },
            tape : {
                is_connected : true,
                file_extensions : /\.(lv(t|r|[0-9]{1,2})|sav)$/i
            },
            dnd : {
                is_connected : true,
                container : {
                    id : 'body_container',
                    node : void 0
                },
                file_extensions : /\.(lv(t|r|[0-9]{1,2})|sav)$/i
            }
        },
        settings = {};

    switch (profile || 'default') {
        case 'default': case 'standart':
            settings.computer = {
                profile : 'pc01_lvov_80',
                allow_turbo_mode : true
            };

            break;
    }

    for (var key in default_settings) {
        if (!(key in settings)) {
            settings[key] = default_settings[key];
        }
    }

    for (var prop in settings) {
        Object.defineProperty(this, prop, {
            enumerable : true,
            value : settings[prop]
        });
    }

    this.init();

    Object.freeze(this);
}

Setting.prototype.init = function() {
    this.viewport.container.node = document.getElementById(this.viewport.container.id);

    if (!(this.viewport.container.node instanceof HTMLDivElement)) {
        throw new Error('SETTING: Element VIEWPORT not found');
    }

    this.dnd.container.node = document.getElementById(this.dnd.container.id);

    if (!(this.dnd.container.node instanceof HTMLElement)) {
        throw new Error('SETTING: Element DND not found');
    }

    if (this.controls.local_load_button) {
        this.controls.local_load_button.node = document.getElementById(this.controls.local_load_button.id);

        if (!(this.controls.local_load_button.node instanceof HTMLButtonElement)) {
            throw new Error('SETTING: Element LOCAL_LOAD_BUTTON not found');
        }
    }

    if (this.controls.help_button) {
        this.controls.help_button.node = document.getElementById(this.controls.help_button.id);

        if (!(this.controls.help_button.node instanceof HTMLButtonElement)) {
            throw new Error('SETTING: Element HELP_BUTTON not found');
        }
    }

    this.notify.node = document.getElementById(this.notify.id);

    if (!(this.notify.node instanceof HTMLElement)) {
        throw new Error('SETTING: Element NOTIFY not found');
    }
};