import { ASPECT_RATIO_PRESETS, aspectRatioName } from './viewport.js';

// The auto-scale button names the mode a click switches to (P3.8.7): "FIT"
// while the fixed view is active, "2×" while the window-fitted view is active.
const AUTO_SCALE_LABELS = {
  fitted: '2×',
  fixed: 'FIT',
};

const AUTO_SCALE_TITLES = {
  fitted: 'Switch to the fixed 2× view (Ctrl+F)',
  fixed: 'Fit to window (Ctrl+F)',
};

/**
 * Binds shell UI controls to callbacks. Keeping the DOM wiring here leaves
 * `ComputerProfile` free of `document` access.
 */
export class UiBinding {
  constructor({
    load_button,
    help_button,
    screenshot_button,
    machine_select,
    aspect_ratio_button,
    auto_scale_button,
    machine,
    aspect_ratio,
    auto_scale,
  } = {}) {
    this.load_handler = undefined;
    this.screenshot_handler = undefined;
    this.machine_handler = undefined;
    this.aspect_ratio_handler = undefined;
    this.auto_scale_handler = undefined;
    this.aspect_ratio = aspectRatioName(aspect_ratio) ?? ASPECT_RATIO_PRESETS[0];
    this.auto_scale = typeof auto_scale === 'boolean' ? auto_scale : false;
    this.help_button = help_button;
    this.aspect_ratio_button = aspect_ratio_button;
    this.auto_scale_button = auto_scale_button;
    this.listener_controller = new AbortController();

    if (load_button) {
      load_button.addEventListener(
        'click',
        (evt) => {
          evt.preventDefault();
          this.openLoad();
        },
        { signal: this.listener_controller.signal }
      );
    }

    if (screenshot_button) {
      screenshot_button.addEventListener(
        'click',
        (evt) => {
          evt.preventDefault();

          if (typeof this.screenshot_handler === 'function') {
            this.screenshot_handler(evt);
          }
        },
        { signal: this.listener_controller.signal }
      );
    }

    if (machine_select) {
      if (typeof machine === 'string' && machine !== '') {
        machine_select.value = machine;
      }

      machine_select.addEventListener(
        'change',
        (evt) => {
          if (typeof this.machine_handler === 'function') {
            this.machine_handler(evt.target.value);
          }
        },
        { signal: this.listener_controller.signal }
      );
    }

    if (aspect_ratio_button) {
      this.syncAspectRatioButton();

      aspect_ratio_button.addEventListener(
        'click',
        (evt) => {
          evt.preventDefault();
          this.toggleAspectRatio();
        },
        { signal: this.listener_controller.signal }
      );
    }

    if (auto_scale_button) {
      this.syncAutoScaleButton();

      auto_scale_button.addEventListener(
        'click',
        (evt) => {
          evt.preventDefault();
          this.toggleAutoScale();
        },
        { signal: this.listener_controller.signal }
      );
    }
  }

  /**
   * Opens the tape/dump file picker (P3.30). Shared by the LOAD button and the
   * Ctrl+L shortcut.
   */
  openLoad() {
    if (typeof this.load_handler === 'function') {
      this.load_handler();
    }
  }

  /**
   * Opens the help dialog through its button (P3.30), so Ctrl+H runs the same
   * handler as a click without moving the dialog code out of the shell.
   */
  openHelp() {
    if (this.help_button) {
      this.help_button.click();
    }
  }

  /**
   * Advances to the next aspect-ratio preset (P3.8.3). Shared by the toolbar
   * button and the Ctrl+A shortcut (P3.29).
   */
  toggleAspectRatio() {
    const index = ASPECT_RATIO_PRESETS.indexOf(this.aspect_ratio);
    this.aspect_ratio = ASPECT_RATIO_PRESETS[(index + 1) % ASPECT_RATIO_PRESETS.length];
    this.syncAspectRatioButton();

    if (typeof this.aspect_ratio_handler === 'function') {
      this.aspect_ratio_handler(this.aspect_ratio);
    }
  }

  /**
   * Toggles the window-fitted view (P3.8.7). Shared by the toolbar button and
   * the Ctrl+F shortcut (P3.29).
   */
  toggleAutoScale() {
    this.auto_scale = !this.auto_scale;
    this.syncAutoScaleButton();

    if (typeof this.auto_scale_handler === 'function') {
      this.auto_scale_handler(this.auto_scale);
    }
  }

  /**
   * Updates the aspect-ratio button so that it always names the next preset
   * (P3.8.3).
   */
  syncAspectRatioButton(button = this.aspect_ratio_button) {
    if (!button) return;

    const index = ASPECT_RATIO_PRESETS.indexOf(this.aspect_ratio);
    const next = ASPECT_RATIO_PRESETS[(index + 1) % ASPECT_RATIO_PRESETS.length];

    button.textContent = next;
    button.setAttribute('title', `Switch to the ${next} aspect ratio (Ctrl+A)`);
  }

  /**
   * Updates the auto-scale button so that it always names the next mode and
   * exposes the current one through `aria-pressed` (P3.8.7).
   */
  syncAutoScaleButton(button = this.auto_scale_button) {
    if (!button) return;

    const state = this.auto_scale ? 'fitted' : 'fixed';

    button.textContent = AUTO_SCALE_LABELS[state];
    button.setAttribute('aria-pressed', String(this.auto_scale));
    button.setAttribute('title', AUTO_SCALE_TITLES[state]);
  }

  onLoad(handler) {
    if (typeof handler !== 'function') {
      throw new Error('UI_BINDING: Handler must be a function');
    }
    this.load_handler = handler;
  }

  onScreenshot(handler) {
    if (typeof handler !== 'function') {
      throw new Error('UI_BINDING: Handler must be a function');
    }
    this.screenshot_handler = handler;
  }

  onAspectRatio(handler) {
    if (typeof handler !== 'function') {
      throw new Error('UI_BINDING: Handler must be a function');
    }
    this.aspect_ratio_handler = handler;
  }

  onMachine(handler) {
    if (typeof handler !== 'function') {
      throw new Error('UI_BINDING: Handler must be a function');
    }
    this.machine_handler = handler;
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
