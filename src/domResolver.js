import { Settings } from './settings.js';
import { assertInstance } from './utils/assert.js';

/**
 * Resolves the DOM elements referenced by `Settings` and exposes them to the
 * components. This is the only place that touches the DOM on behalf of the
 * configuration, keeping `Settings` itself pure and testable.
 */
export class DomResolver {
  constructor(settings) {
    assertInstance(settings, Settings, 'DOM_RESOLVER: Invalid Settings object');

    this.viewport_container = DomResolver.resolve(
      settings.viewport.container.id,
      HTMLDivElement,
      'VIEWPORT'
    );

    this.dnd_container = DomResolver.resolve(settings.dnd.container.id, HTMLElement, 'DND');

    this.notify = DomResolver.resolve(settings.notify.id, HTMLElement, 'NOTIFY');

    this.local_load_button = settings.controls.local_load_button
      ? DomResolver.resolve(
          settings.controls.local_load_button.id,
          HTMLButtonElement,
          'LOCAL_LOAD_BUTTON'
        )
      : undefined;

    this.help_button = settings.controls.help_button
      ? DomResolver.resolve(settings.controls.help_button.id, HTMLButtonElement, 'HELP_BUTTON')
      : undefined;

    this.aspect_ratio_select = settings.controls.aspect_ratio_select
      ? DomResolver.resolve(
          settings.controls.aspect_ratio_select.id,
          HTMLSelectElement,
          'ASPECT_RATIO_SELECT'
        )
      : undefined;

    this.auto_scale_checkbox = settings.controls.auto_scale_checkbox
      ? DomResolver.resolve(
          settings.controls.auto_scale_checkbox.id,
          HTMLInputElement,
          'AUTO_SCALE_CHECKBOX'
        )
      : undefined;
  }

  static resolve(id, Type, label) {
    const node = document.getElementById(id);

    assertInstance(node, Type, `DOM_RESOLVER: Element ${label} not found`);

    return node;
  }
}
