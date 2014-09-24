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


function Beeper(config) {
    //[http://middleearmedia.com/web-audio-api-basics/]
    //[https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode]
    //http://www.html5rocks.com/en/tutorials/webaudio/games/
    //TODO
    //[https://github.com/jeromeetienne/webaudiox]
    //[http://blog.jetienne.com/blog/2014/02/18/webaudiox-a-dry-library-for-webaudio-api/]


    if (!(config instanceof Config)) {
        throw new Error('BEEPER: Invalid CONFIG object');
    }
    this.config = config;

    this.SAMPLE_RATE = 44100;
    this.SAMPLE_CPU_CYCLES = Math.round(config.cpu.clock_speed / this.SAMPLE_RATE);
    this.SAMPLE_BUFFER_SIZE = Math.ceil(config.cpu.frame_cycles / this.SAMPLE_CPU_CYCLES) + 1;
    this.VOLUME = 0.15;

    this.sound_buffer = [];

    this.init();
}

Beeper.audio_context = (function() {
    if ('AudioContext' in window || 'webkitAudioContext' in window) {
        return new (window.AudioContext || window.webkitAudioContext)();
    }
    else {
        console.warn('BEEPER: AudioContext not supported');
        return null;
    }
})();

Beeper.prototype.init = function() {
    this.restart();

    if (this.allow_sound) {
        if (this.config.beeper.allow_highpass_filter) {
            this.filter = Beeper.audio_context.createBiquadFilter();
            this.filter.type = this.filter.HIGHPASS;
            this.filter.frequency.value = 440;
            this.filter.Q.value = 0;
            this.filter.gain.value = 0;
        }
    }
};

Beeper.prototype.restart = function() {
    this.allow_sound = this.config.beeper.allow_sound && Beeper.audio_context;
    this.sound_buffer.length = 0;
    this.prev_frame_offset = 0;
    this.prev_beeper_state = 0;
};

Beeper.prototype.play = function() {
    var sound_buffer = this.sound_buffer;

    if (this.allow_sound) {
        var context = Beeper.audio_context,
            source = context.createBufferSource(),
            buffer = context.createBuffer(1, this.SAMPLE_BUFFER_SIZE, this.SAMPLE_RATE),
            data = buffer.getChannelData(0),
            sample_cpu_cycles = this.SAMPLE_CPU_CYCLES,
            state = 0,
            volume = this.VOLUME;

        for (var i = 0, n = 0, l = sound_buffer.length, v; i < l; i++) {
            v = state && volume;
            for (var sample_counter = Math.round(sound_buffer[i] / sample_cpu_cycles); sample_counter > 0; sample_counter--) {
                data[n++] = v;
            }
            state = 1 - state;
        }

        if (this.filter) {
            source.connect(this.filter);
            this.filter.connect(context.destination);
        }
        else {
            source.connect(context.destination);
        }

        source.buffer = buffer;
        source.start(0);
    }

    this.prev_frame_offset = 0;
    sound_buffer.length = 0;
};

Beeper.prototype.process = function(state) {
    var frame_offset = I8080.total_cpu_cycles - I8080.start_frame,
        inc_offset = frame_offset - this.prev_frame_offset,
        sound_buffer = this.sound_buffer,
        len = sound_buffer.length;

    if (state === this.prev_beeper_state) {
        if (len) {
            sound_buffer[len - 1] += inc_offset;
        }
        else {
            sound_buffer[len] = inc_offset;
        }
    }
    else {
        sound_buffer[len] = inc_offset;
        this.prev_beeper_state = state;
    }

    this.prev_frame_offset = frame_offset;
};
