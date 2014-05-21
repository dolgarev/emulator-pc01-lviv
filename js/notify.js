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


function Notify(node, delay) {
    if (Notify.instance instanceof Notify) {
        return Notify.instance;
    }

    if (!(node instanceof HTMLElement)) {
        throw new Error('NOTIFY: Invalid element');
    }
    this.node = node;

    this.handlers = {
        close : this.close.bind(this)
    };

    this.node.lastChild.addEventListener('click', this.handlers.close, false);

    this.delay = delay || 5000;
    this.timer = void 0;

    Object.defineProperty(Notify, 'instance', {
        value : this
    });
}

Notify.create = function(node, delay) {
    return new Notify(node, delay);
};

Notify.show = function(message) {
    if (Notify.instance instanceof Notify) {
        Notify().show(message);
    }
    else {
        throw new Error('NOTIFY: Object is not initialized');
    }
};

Notify.prototype.close = function() {
    window.clearTimeout(this.timer);
    this.hide();
};

Notify.prototype.show = function(message) {
    if (this.node.classList.contains('notify_show')) {
        window.clearTimeout(this.timer);
    }
    else {
        this.node.classList.add('notify_show');
    }

    this.node.firstChild.innerHTML = message;

    this.timer = window.setTimeout(this.handlers.close, this.delay);
};

Notify.prototype.hide = function() {
    this.node.firstChild.innerHTML = '';
    this.node.classList.remove('notify_show');
};

Notify.prototype.terminate = function() {
    this.close();
    this.node.lastChild.removeEventListener('click', this.handlers.close);
    Notify.instance = null;
};
