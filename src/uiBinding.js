/**
 * Binds shell UI controls to callbacks. Keeping the DOM wiring here leaves
 * `ComputerProfile` free of `document` access.
 */
export class UiBinding {
  constructor({
    load_button,
    aspect_ratio_select,
    auto_scale_checkbox,
    aspect_ratio,
    auto_scale,
  } = {}) {
    this.load_handler = undefined;
    this.aspect_ratio_handler = undefined;
    this.auto_scale_handler = undefined;
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

    if (aspect_ratio_select) {
      if (typeof aspect_ratio === 'string' && aspect_ratio !== '') {
        aspect_ratio_select.value = aspect_ratio;
      }

      aspect_ratio_select.addEventListener(
        'change',
        (evt) => {
          if (typeof this.aspect_ratio_handler === 'function') {
            this.aspect_ratio_handler(evt.target.value);
          }
        },
        { signal: this.listener_controller.signal }
      );
    }

    if (auto_scale_checkbox) {
      if (typeof auto_scale === 'boolean') {
        auto_scale_checkbox.checked = auto_scale;
      }

      auto_scale_checkbox.addEventListener(
        'change',
        (evt) => {
          if (typeof this.auto_scale_handler === 'function') {
            this.auto_scale_handler(evt.target.checked);
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

  onAspectRatio(handler) {
    if (typeof handler !== 'function') {
      throw new Error('UI_BINDING: Handler must be a function');
    }
    this.aspect_ratio_handler = handler;
  }

  onAutoScale(handler) {
    if (typeof handler !== 'function') {
      throw new Error('UI_BINDING: Handler must be a function');
    }
    this.auto_scale_handler = handler;
  }

  terminate() {
    this.listener_controller.abort();
  }
}
