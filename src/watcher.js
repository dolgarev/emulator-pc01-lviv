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
import { I8080 } from './i8080.js';

export function Watcher() {}

Watcher.get = function (profile, context) {
  if (!(profile in Watcher.profiles)) {
    throw new Error('WATCHER: Invalid PROFILE param');
  }

  var watcher = new Watcher(),
    entry = Watcher.profiles[profile];

  for (var key in entry) {
    if (entry[key] instanceof Function) {
      Object.defineProperty(watcher, key, {
        enumerable: true,
        value: entry[key].bind(context),
      });
    }
  }

  return watcher;
};

Watcher.profiles = {
  default: {
    //Подмена для BLOAD
    0xdd94: function () {
      var io_error = function () {
          this.cpu.execute(0xe5);
          this.cpu.execute(0xd5);
          this.cpu.execute(0xc5);
          this.cpu.jump(0xe4c7);
          this.resume();
        }.bind(this),
        install = function () {
          if (this.bload(this.get_file())) {
            this.cpu.gosub(0xe48a);
            this.cpu.jump(0xdd61);
            this.resume();
          } else {
            io_error();
          }
          this.detach_file();
        }.bind(this);

      this.suspend();

      if (this.exists_attached_file()) {
        install();
      } else if (this.tape instanceof Tape) {
        this.tape.load().then(
          function (file) {
            this.attach_file(file);
            install();
          }.bind(this),
          io_error
        );

        return I8080.NOPE_OPTCODE;
      } else {
        io_error();
      }

      return I8080.UNDEF_OPTCODE;
    },
    //Подмена для CLOAD (1)
    0xe50b: function () {
      var io_error = function () {
          this.cpu.execute(0xe5);
          this.cpu.execute(0xd5);
          this.cpu.execute(0xc5);
          this.cpu.jump(0xe4c7);
          this.resume();
        }.bind(this),
        install = function () {
          if (this.cload(this.get_file())) {
            this.cpu.gosub(0xe48a);
            this.cpu.jump(0xe26d);
            this.resume();
          } else {
            io_error();
          }
          this.detach_file();
        }.bind(this);

      this.suspend();

      if (this.exists_attached_file()) {
        install();
      } else if (this.tape instanceof Tape) {
        this.tape.load().then(
          function (file) {
            this.attach_file(file);
            install();
          }.bind(this),
          io_error
        );

        return I8080.NOPE_OPTCODE;
      } else {
        io_error();
      }

      return I8080.UNDEF_OPTCODE;
    },
    //Подмена для CLOAD (2)
    0xe55e: function () {
      return (this.cpu.jump(0xe561), I8080.UNDEF_OPTCODE);
    },
  },
};
