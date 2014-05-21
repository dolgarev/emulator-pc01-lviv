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

    this.cache = [];
    this.cache_palette = void 0;

    this.allow_color_mode = config.screen.allow_color_mode;
    this.screenshot_type = config.screen.screenshot_type;
}

Screen.prototype.LUT = {
    R : [0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x000000C0, 0x000000C0, 0x000000C0, 0x000000FF],
    G : [0x00000000, 0x00000000, 0x0000C000, 0x0000C000, 0x00000000, 0x00000000, 0x0000C000, 0x0000FF00],
    B : [0x00000000, 0x00C00000, 0x00000000, 0x00C00000, 0x00000000, 0x00C00000, 0x00000000, 0x00FF0000]
};

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

    for (var p = this.ps32, i = p.length - 1; i > 0; i--) {
        p[i] = 0xFF000000;
    }

    for (var byte = 0; byte < 0x100; byte++) {
        this.cache_color[byte] = this.parse_color(byte);
    }

    for (var palette = 0; palette < 0x80; palette++) {
        this.cache_color_index[palette] = [
            this.compute_color_index(0, palette),
            this.compute_color_index(1, palette),
            this.compute_color_index(2, palette),
            this.compute_color_index(3, palette)
        ];
    }
};

Screen.prototype.restart = function() {
    this.cache.length = 0;
    this.cache_palette = void 0;
};

Screen.prototype.cache_color = [];
Screen.prototype.cache_color_index = [];

Screen.prototype.parse_color = function(byte) {
    //Каждый байт из видеоОЗУ описывает цвета сразу для 4-х пикселов
    return [
        (byte & 0x80 ? 2 : 0) + (byte & 0x08 ? 1 : 0),
        (byte & 0x40 ? 2 : 0) + (byte & 0x04 ? 1 : 0),
        (byte & 0x20 ? 2 : 0) + (byte & 0x02 ? 1 : 0),
        (byte & 0x10 ? 2 : 0) + (byte & 0x01 ? 1 : 0)
    ];
};

Screen.prototype.compute_color_index = function(color, palette) {
    var BLACK = 0,
        BLUE = 1,
        GREEN = 2,
        RED = 4,
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
        cache_palette = this.cache_palette,
        vram = this.vram_page,
        palette = this.io.input(this.io.COLOR_PALETTE_PORT) & 0x7F,
        cci = this.cache_color_index[palette],
        ps32 = this.ps32,
        is_color = this.allow_color_mode,
        LUT = this.LUT;

    for (var i = 0, pos = 0; i < 0x4000; i++) {
        var byte = vram.mem[i];

        if (cache_palette === palette && byte === cache[i]) {
            pos += 4;
        }
        else {
            var pixels = cache_color[byte],
                c0 = cci[pixels[0]],
                c1 = cci[pixels[1]],
                c2 = cci[pixels[2]],
                c3 = cci[pixels[3]],
                sum;

            if (is_color) {
                ps32[pos++] = 0xFF000000 | LUT.B[c0] | LUT.G[c0] | LUT.R[c0];
                ps32[pos++] = 0xFF000000 | LUT.B[c1] | LUT.G[c1] | LUT.R[c1];
                ps32[pos++] = 0xFF000000 | LUT.B[c2] | LUT.G[c2] | LUT.R[c2];
                ps32[pos++] = 0xFF000000 | LUT.B[c3] | LUT.G[c3] | LUT.R[c3];
            }
            else {
                sum = (LUT.B[c0] ? 0x1D : 0) + (LUT.G[c0] ? 0x96 : 0) + (LUT.R[c0] ? 0x4C : 0);
                ps32[pos++] = 0xFF000000 | (sum << 16) | (sum << 8) | sum;

                sum = (LUT.B[c1] ? 0x1D : 0) + (LUT.G[c1] ? 0x96 : 0) + (LUT.R[c1] ? 0x4C : 0);
                ps32[pos++] = 0xFF000000 | (sum << 16) | (sum << 8) | sum;

                sum = (LUT.B[c2] ? 0x1D : 0) + (LUT.G[c2] ? 0x96 : 0) + (LUT.R[c2] ? 0x4C : 0);
                ps32[pos++] = 0xFF000000 | (sum << 16) | (sum << 8) | sum;

                sum = (LUT.B[c3] ? 0x1D : 0) + (LUT.G[c3] ? 0x96 : 0) + (LUT.R[c3] ? 0x4C : 0);
                ps32[pos++] = 0xFF000000 | (sum << 16) | (sum << 8) | sum;
            }

            cache[i] = byte;
        }
    }
    
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
        this.cache.length = 0;
    }
};

Screen.prototype.shoot = function() {
    return this.canvas.toDataURL(this.screenshot_type);
};
