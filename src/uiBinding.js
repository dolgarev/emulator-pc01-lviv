/**
 * Binds shell UI controls to callbacks. Keeping the DOM wiring here leaves
 * `ComputerProfile` free of `document` access.
 */
export class UiBinding {
  constructor({ load_button } = {}) {
    this.load_handler = undefined;
    this.listener_controller = new AbortController();

    if (load_button) {
      load_button.addEventListener(
        'click',
        (evt) => {
          evt.preventDefault();

          if (typeof this.load_handler === 'function') {
            this.load_handler(evt);
          }
        },
        { signal: this.listener_controller.signal }
      );
    }
  }

  onLoad(handler) {
    if (typeof handler !== 'function') {
      throw new Error('UI_BINDING: Handler must be a function');
    }
    this.load_handler = handler;
  }

  terminate() {
    this.listener_controller.abort();
  }
}
