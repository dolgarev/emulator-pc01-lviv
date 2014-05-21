/*
 Copyright 2012 Google Inc.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.

 Author: Eric Bidelman (ericbidelman@chromium.org)
 */

function DnD(config, success_callback) {
    if (!(config instanceof Config)) {
        throw new Error('DnD: Invalid CONFIG object');
    }
    this.config = config;

    if (!(success_callback instanceof Function)) {
        throw new Error('DnD: Callback must be function');
    }
    this.success_callback = success_callback;

    this.node = this.config.dnd.container.node;

    this.handlers = {
        'dragenter' : this.dragenter.bind(this),
        'dragover' : this.dragover.bind(this),
        'dragleave' : this.dragleave.bind(this),
        'drop' : this.drop.bind(this)
    };

    this.node.addEventListener('dragenter', this.handlers.dragenter, false);
    this.node.addEventListener('dragover', this.handlers.dragover, false);
    this.node.addEventListener('dragleave', this.handlers.dragleave, false);
    this.node.addEventListener('drop', this.handlers.drop, false);

    this.files = void 0;

    this.init();
}

DnD.prototype.init = function() {
    this.reset();
};

DnD.prototype.reset = function() {
    this.files = void 0;
};

DnD.prototype.close = function() {
    this.node.removeEventListener('dragenter', this.handlers.dragenter);
    this.node.removeEventListener('dragover', this.handlers.dragover);
    this.node.removeEventListener('dragleave', this.handlers.dragleave);
    this.node.removeEventListener('drop', this.handlers.drop);

    this.node = this.files = this.success_callback = this.handlers = null;
};

DnD.prototype.dragenter = function(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    this.node.classList.add('dropping');
};

DnD.prototype.dragover = function(evt) {
    evt.stopPropagation();
    evt.preventDefault();
};

DnD.prototype.dragleave = function(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    this.node.classList.remove('dropping');
};

DnD.prototype.drop = function(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    this.node.classList.remove('dropping');

    //DnD не всегда срабатывает корректно. Причина неизвестна.
    if (evt.dataTransfer.files.length) {
        this.files = evt.dataTransfer.files;
        window.setTimeout(this.success_callback, 0);
    }
    else {
        console.log('DnD: File not loaded');
        Notify().show('File not loaded. Try again.');
    }
};

DnD.prototype.read = function() {
    return new Promise((function(resolve, reject) {
        var file = this.files[0];

        function error_handler() {
            console.log('DnD: Read failed.');
            Notify().show('File "' + file.name + '" not loaded.');
            reject();
        }

        if (this.is_file(file)) {
            var reader = new FileReader();

            reader.onerror = error_handler;
            reader.onload = function(evt) {
                resolve(new DataView(evt.target.result));
            };

            reader.readAsArrayBuffer(file);
        }
        else {
            error_handler();
        }
    }).bind(this));
};

DnD.prototype.is_file = function(file) {
    return file instanceof File &&
           file.name.match(this.config.dnd.file_extensions) &&
           file.size > 0;
};