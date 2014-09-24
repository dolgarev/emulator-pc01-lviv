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


function Screen(config, io, memory, viewport) {
    if (!(config instanceof Config)) {
        throw new Error('SCREEN: Invalid CONFIG object');
    }
    this.config = config;

    if (!(io instanceof IO)) {
        throw new Error('SCREEN: Invalid IO object');
    }
    this.io = io;

    if (!(memory instanceof Memory)) {
        throw new Error('SCREEN: Invalid MEMORY object');
    }
    this.vram_page = memory.get_vram_page();

    if (!(viewport instanceof Viewport)) {
        throw new Error('SCREEN: Invalid VIEWPORT object');
    }
    this.init(viewport);

    this.cache_palette = void 0;
    this.cache = new Uint8Array(0x4000);
    this.reset_cache();

    this.allow_color_mode = config.screen.allow_color_mode;
    this.screenshot_type = config.screen.screenshot_type;
}

Screen.prototype.LUT = {
    R : new Uint32Array([0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x000000C0, 0x000000C0, 0x000000C0, 0x000000FF]),
    G : new Uint32Array([0x00000000, 0x00000000, 0x0000C000, 0x0000C000, 0x00000000, 0x00000000, 0x0000C000, 0x0000FF00]),
    B : new Uint32Array([0x00000000, 0x00C00000, 0x00000000, 0x00C00000, 0x00000000, 0x00C00000, 0x00000000, 0x00FF0000])
};

Screen.prototype.cache_color = new Uint32Array(0x100);
Screen.prototype.cache_rgb = [];

Screen.prototype.init = function(viewport) {
    this.canvas = viewport.canvas;

    this.context = this.canvas.getContext('2d');
    if (!this.context) {
        throw new Error('SCREEN: 2D context not supported');
    }

    //this.context.mozImageSmoothingEnabled = true;
    this.context.webkitImageSmoothingEnabled = true;

    this.image_data = this.context.createImageData(viewport.CANVAS_WIDTH, viewport.CANVAS_HEIGHT);

    //Переход на Uint32Array по результатам теста "Canvas Pixel Manipulation"
    //[http://jsperf.com/canvas-pixel-manipulation/98]
    this.ps32 = new Uint32Array(this.image_data.data.buffer, 0, this.image_data.data.length >> 2);

    for (var p = this.ps32, i = 0, L = p.length; i < L; i++) {
        p[i] = 0xFF000000;
    }

    for (var byte = 0; byte < 0x100; byte++) {
        this.cache_color[byte] = this.parse_color(byte);
    }

    for (var c0, c1, c2, c3, LUT = this.LUT, palette = 0; palette < 0x80; palette++) {
        c0 = this.compute_color_index(0, palette);
        c1 = this.compute_color_index(1, palette);
        c2 = this.compute_color_index(2, palette);
        c3 = this.compute_color_index(3, palette);

        this.cache_rgb[palette] = new Uint32Array([
            0xFF000000 | LUT.B[c0] | LUT.G[c0] | LUT.R[c0],
            0xFF000000 | LUT.B[c1] | LUT.G[c1] | LUT.R[c1],
            0xFF000000 | LUT.B[c2] | LUT.G[c2] | LUT.R[c2],
            0xFF000000 | LUT.B[c3] | LUT.G[c3] | LUT.R[c3]
        ]);
    }
};

Screen.prototype.restart = function() {
    this.cache_palette = void 0;
    this.reset_cache();
};

Screen.prototype.reset_cache = function() {
    for (var i = 0, L = this.cache.length; i < L; i++) {
        this.cache[i] = 0;
    }
    this.cache.is_valid = false;
};

Screen.prototype.parse_color = function(byte) {
    //Каждый байт из видеоОЗУ описывает цвета сразу для 4-х пикселов
    result = 0;

    if (byte & 0x80) {
        result |= 0x02;
    }
    if (byte & 0x08) {
        result |= 0x01;
    }
    if (byte & 0x40) {
        result |= 0x08;
    }
    if (byte & 0x04) {
        result |= 0x04;
    }
    if (byte & 0x20) {
        result |= 0x20;
    }
    if (byte & 0x02) {
        result |= 0x10;
    }
    if (byte & 0x10) {
        result |= 0x80;
    }
    if (byte & 0x01) {
        result |= 0x40;
    }

    return result;
};

Screen.prototype.compute_color_index = function(color, palette) {
    var BLACK = 0, BLUE = 1, GREEN = 2, RED = 4,
        result = BLACK;

    if (palette & 0x40) {
        result ^= BLUE;
    }
    if (palette & 0x20) {
        result ^= GREEN;
    }
    if (palette & 0x10) {
        result ^= RED;
    }

    switch (color) {
        case 0:
            if ((palette & 0x08) === 0) {
                result ^= RED;
            }
            if ((palette & 0x04) === 0) {
                result ^= BLUE;
            }
            break;

        case 1:
            result ^= BLUE;

            if ((palette & 0x01) === 0) {
                result ^= RED;
            }
            break;

        case 2:
            result ^= GREEN;
            break;

        case 3:
            result ^= RED;

            if ((palette & 0x02) === 0) {
                result ^= GREEN;
            }
            break;
    }

    return result;
};

//Краеугольная статья по оптимизации кода для V8
//[http://coding.smashingmagazine.com/2012/11/05/writing-fast-memory-efficient-javascript/]
//Для вывода картинки в оттенках серого пришлось отказаться от css filters, поскольку
//фильтр -webkit-grayscale выдает слишком темную картинку и ощутимо притормаживает.
Screen.prototype.draw = function() {
    var cache = this.cache,
        cache_color = this.cache_color,
        palette = this.io.input(this.io.PALETTE_PORT) & 0x7F,
        is_valid = cache.is_valid && this.cache_palette === palette,
        is_color = this.allow_color_mode,
        rgb = this.cache_rgb[palette],
        ps32 = this.ps32,
        vram = this.vram_page,
        byte, cc, p, sum;

    for (var i = 0, pos = 0; i < 0x4000; i++) {
        byte = vram.mem[i];

        if (is_valid && byte === cache[i]) {
            pos += 4;
        }
        else {
            cc = cache_color[byte];

            if (is_color) {
                ps32[pos++] = rgb[cc & 0x03];
                ps32[pos++] = rgb[cc >> 2 & 0x03];
                ps32[pos++] = rgb[cc >> 4 & 0x03];
                ps32[pos++] = rgb[cc >> 6 & 0x03];
            }
            else {
                p = rgb[cc & 0x03];
                sum = ((p & 0x00FF0000) && 0x1D) + ((p & 0x0000FF00) && 0x96) + ((p & 0x0000FF) && 0x4C);
                ps32[pos++] = 0xFF000000 | (sum << 16) | (sum << 8) | sum;

                p = rgb[cc >> 2 & 0x03];
                sum = ((p & 0x00FF0000) && 0x1D) + ((p & 0x0000FF00) && 0x96) + ((p & 0x0000FF) && 0x4C);
                ps32[pos++] = 0xFF000000 | (sum << 16) | (sum << 8) | sum;

                p = rgb[cc >> 4 & 0x03];
                sum = ((p & 0x00FF0000) && 0x1D) + ((p & 0x0000FF00) && 0x96) + ((p & 0x0000FF) && 0x4C);
                ps32[pos++] = 0xFF000000 | (sum << 16) | (sum << 8) | sum;

                p = rgb[cc >> 6 & 0x03];
                sum = ((p & 0x00FF0000) && 0x1D) + ((p & 0x0000FF00) && 0x96) + ((p & 0x0000FF) && 0x4C);
                ps32[pos++] = 0xFF000000 | (sum << 16) | (sum << 8) | sum;
            }

            cache[i] = byte;
        }
    }

    cache.is_valid = true;
    this.cache_palette = palette;
    this.context.putImageData(this.image_data, 0, 0);
};

Screen.prototype.change_color_mode = function(state) {
    var prev_state = this.allow_color_mode;

    if (state === void 0) {
        this.allow_color_mode = !this.allow_color_mode;
    }
    else {
        this.allow_color_mode = state;
    }

    if (prev_state !== this.allow_color_mode) {
        this.reset_cache();
    }
};

Screen.prototype.change_palette = function(step) {
    var io = this.io,
        v = io.ports[io.PALETTE_PORT];

    io.ports[io.PALETTE_PORT] = (v & 0x80) | (v + step & 0x7F);
};

Screen.prototype.shoot = function() {
    return this.canvas.toDataURL(this.screenshot_type);
};
