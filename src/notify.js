import { assertInstance } from './utils/assert.js';

export class Notify {
  static instance = null;

  static create(node, delay) {
    Notify.instance ??= new Notify(node, delay);
    return Notify.instance;
  }

  static show(message) {
    if (Notify.instance instanceof Notify) {
      Notify.instance.show(message);
    } else {
      throw new Error('NOTIFY: Object is not initialized');
    }
  }

  constructor(node, delay = 5000) {
    assertInstance(node, HTMLElement, 'NOTIFY: Invalid element');

    this.node = node;
    this.delay = delay;
    this.timer = undefined;

    this.handlers = {
      close: this.close.bind(this),
    };

    this.node.lastChild.addEventListener('click', this.handlers.close, false);

    Notify.instance = this;
  }

  close() {
    window.clearTimeout(this.timer);
    this.hide();
  }

  show(message) {
    if (this.node.classList.contains('notify_show')) {
      window.clearTimeout(this.timer);
    } else {
      this.node.classList.add('notify_show');
    }

    this.node.firstChild.textContent = message;
    this.timer = window.setTimeout(this.handlers.close, this.delay);
  }

  hide() {
    this.node.firstChild.textContent = '';
    this.node.classList.remove('notify_show');
  }
}
