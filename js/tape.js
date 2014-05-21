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


//[https://developer.chrome.com/apps/app_storage]
function Tape(config) {
    if (!(config instanceof Config)) {
        throw new Error('TAPE: Invalid CONFIG object');
    }
    this.config = config;
}

Tape.prototype.terminate = function() {
    this.config = null;
};

Tape.prototype.choose = function(mode, accepts) {
    return new Promise((function(resolve, reject) {
        var params = {};

        function error_handler(e) {
            console.log('TAPE: Choose failed.');
            Tape.display_error(e);
            reject();
        };

        switch (mode || 'default') {
            case 'read': case 'default':
                params.type = 'openFile';
                break;

            case 'write':
                params.type = 'saveFile';
                break;

            default:
                throw new Error('TAPE: Invalid MODE param');
        }

        if (accepts && Array.isArray(accepts)) {
            params.accepts = accepts;
        }

        //Выбор файлов по расширению скорее всего не работает в Линукс,
        //поэтому пока такая возможность заблокирована.
        //Комментарий от Oleg Eterevsky:
        //"Это должно работать как вы написали,
        //но по факту работает правильно на некоторых операционных системах
        //и не работает на других."
        //Дополнительная информация в таске:
        //[https://github.com/GoogleChrome/text-app/pull/180]
        //accepts: [{mimeTypes: ['application/octet-binary'], extensions: ['lvt', 'sav']}]
        chrome.fileSystem.chooseEntry(params, function(file_entry) {
            if (file_entry && file_entry.isFile) {
                resolve(file_entry);
            }
            else {
                error_handler(new Error('No file selected.'));
            }
        });
    }).bind(this));
};

Tape.prototype.load = function(accepts) {
    return new Promise((function(resolve, reject) {
        function error_handler(e) {
            console.log('TAPE: Load failed.');
            Tape.display_error(e);
            reject();
        };

        this.choose('read', accepts).then((function(file_entry) {
            file_entry.file((function(file) {
                if (this.is_file(file)) {
                    this.read(file).then(function(data_view) {
                        resolve(data_view);
                    }, error_handler);
                }
                else {
                    Notify().show('Unknown file type');
                    error_handler(new Error('Unknown file type'));
                }
            }).bind(this), error_handler);
        }).bind(this), error_handler);
    }).bind(this));
};

Tape.prototype.read = function(file) {
    return new Promise((function(resolve, reject) {
        function error_handler(e) {
            console.log('TAPE: Read failed.');
            Tape.display_error(e);
            Notify().show('File "' + file.name + '" not loaded.');
            reject();
        };

        var reader = new FileReader();

        reader.onerror = error_handler;
        reader.onload = function(evt) {
            resolve(new DataView(evt.target.result));
        };

        reader.readAsArrayBuffer(file);
    }).bind(this));
};

Tape.prototype.save = function(data, accepts) {
    return new Promise((function(resolve, reject) {
        function error_handler(e) {
            console.log('TAPE: Save failed.');
            Tape.display_error(e);
            reject();
        };

        this.choose('write', accepts).then((function(file_entry) {
            this.write(file_entry, data).then(resolve, error_handler);
        }).bind(this), error_handler);
    }).bind(this));
};

Tape.prototype.write = function(file_entry, blob) {
    return new Promise((function(resolve, reject) {
        function error_handler(e) {
            console.log('TAPE: Write failed.');
            Tape.display_error(e);
            reject();
        };

        file_entry.createWriter(function(writer) {
            writer.onerror = error_handler;
            writer.onwriteend = resolve;

            writer.write(blob);
        }, error_handler);
    }).bind(this));
};

Tape.prototype.store = function(filename, data) {
    //Для записи данных в локальную файловую систему с типом хранения PERSISTENT
    //нужно в manifest.json добавить permission значение unlimitedStorage.
    //[http://stackoverflow.com/questions/5429513/writing-to-local-file-system-in-chrome-extension]
    //[http://www.html5rocks.com/tutorials/file/filesystem/#toc-support]
    //О получении объекта Blob ниже:
    //[http://stackoverflow.com/questions/7760700/html5-binary-file-writing-w-base64]
    //[https://developer.mozilla.org/en-US/docs/Web/API/Blob]

    return new Promise((function(resolve, reject) {
        function error_handler(e) {
            console.log('TAPE: Store failed.');
            Tape.display_error(e);
            reject();
        };

        (window.requestFileSystem || window.webkitRequestFileSystem)(window.PERSISTENT, 1024*1024, function(fs) {
            fs.root.getFile(filename, {create: true}, function(file_entry) {
                file_entry.createWriter(function(file_writer) {
                    file_writer.onwriteend = resolve;
                    file_writer.onerror = error_handler;

                    file_writer.write(new Blob([new Uint8ClampedArray(data)], {
                        type: 'application/octet-binary'
                    }));
                }, error_handler);
            }, error_handler);
        }, error_handler);
    }).bind(this));
};

Tape.prototype.is_file = function(file) {
    //Необъяснимо, но факт: файлы, которые мы получаем посредством DnD,
    //проходят проверку выражением file instanceof File, тогда как файлы,
    //полученные через FS API, таковую не проходят, хотя в обоих случаях
    //мы получаем объекты типа File.
    return Object.prototype.toString.call(file) === '[object File]' &&
           file.name.match(this.config.tape.file_extensions) &&
           file.size > 0;
};

Tape.display_error = function(e) {
    if (!e) {
        return;
    }

    var msg = 'Unknown Error';

    if (e.code) {
        //Обработка ошибок из статьи:
        //[http://www.html5rocks.com/en/tutorials/file/filesystem/]
        switch (e.code) {
            case FileError.QUOTA_EXCEEDED_ERR:
                msg = 'QUOTA_EXCEEDED_ERR';
                break;

            case FileError.NOT_FOUND_ERR:
                msg = 'NOT_FOUND_ERR';
                break;

            case FileError.SECURITY_ERR:
                msg = 'SECURITY_ERR';
                break;

            case FileError.INVALID_MODIFICATION_ERR:
                msg = 'INVALID_MODIFICATION_ERR';
                break;

            case FileError.INVALID_STATE_ERR:
                msg = 'INVALID_STATE_ERR';
                break;

            default:
                msg = e.message || msg;
                break;
        }
    }
    else {
        msg = e.toString() || msg;
    }

    console.log(msg);
};
