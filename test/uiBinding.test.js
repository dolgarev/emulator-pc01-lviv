import { describe, it, expect } from 'vitest';
import { UiBinding } from '../src/uiBinding.js';

class FakeControl extends EventTarget {
  constructor({ value = '', checked = false } = {}) {
    super();
    this.value = value;
    this.checked = checked;
  }
}

class FakeButton extends EventTarget {
  constructor() {
    super();
    this.textContent = '';
    this.attributes = {};
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  click() {
    this.dispatchEvent(new Event('click'));
  }
}

describe('UiBinding', () => {
  it('cycles aspect ratios on click and names the next preset on the button', () => {
    const button = new FakeButton();
    const binding = new UiBinding({ aspect_ratio_button: button, aspect_ratio: '4:3' });

    const seen = [];
    binding.onAspectRatio((value) => seen.push(value));

    expect(button.textContent).toBe('1:1');
    expect(button.getAttribute('title')).toBe('Switch to the 1:1 aspect ratio (Ctrl+A)');

    button.click();

    expect(seen).toEqual(['1:1']);
    expect(button.textContent).toBe('16:9');

    button.click();

    expect(seen).toEqual(['1:1', '16:9']);
    expect(button.textContent).toBe('4:3');

    button.click();

    expect(seen).toEqual(['1:1', '16:9', '4:3']);
    expect(button.textContent).toBe('1:1');
    binding.terminate();
  });

  it('forwards screenshot clicks to the handler (P3.28)', () => {
    const button = new FakeButton();
    const binding = new UiBinding({ screenshot_button: button });

    const seen = [];
    binding.onScreenshot(() => seen.push('shot'));

    button.click();

    expect(seen).toEqual(['shot']);
    binding.terminate();
  });

  it('shares the LOAD and HELP button paths with the keyboard shortcuts (P3.30)', () => {
    const load_button = new FakeButton();
    const help_button = new FakeButton();
    const binding = new UiBinding({ load_button, help_button });

    const seen = [];
    binding.onLoad(() => seen.push('load'));
    help_button.addEventListener('click', () => seen.push('help'));

    load_button.click();
    binding.openHelp();

    expect(seen).toEqual(['load', 'help']);
    binding.terminate();
  });

  it('toggles auto-scale on click and names the next mode on the button', () => {
    const button = new FakeButton();
    const binding = new UiBinding({ auto_scale_button: button, auto_scale: false });

    const seen = [];
    binding.onAutoScale((value) => seen.push(value));

    expect(button.textContent).toBe('FIT');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('title')).toBe('Fit to window (Ctrl+F)');

    button.click();

    expect(seen).toEqual([true]);
    expect(button.textContent).toBe('2×');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('title')).toBe('Switch to the fixed 2× view (Ctrl+F)');

    button.click();

    expect(seen).toEqual([true, false]);
    expect(button.textContent).toBe('FIT');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    binding.terminate();
  });

  it('forwards machine changes to the handler (P2.16)', () => {
    const machine_select = new FakeControl({ value: 'standard' });
    const binding = new UiBinding({ machine_select });

    const seen = [];
    binding.onMachine((machine) => seen.push(machine));

    machine_select.value = 'standard_extended';
    machine_select.dispatchEvent(new Event('change'));

    expect(seen).toEqual(['standard_extended']);
    binding.terminate();
  });

  it('syncs the controls to the configured initial values', () => {
    const machine_select = new FakeControl({ value: 'standard_extended' });
    const aspect_ratio_button = new FakeButton();
    const auto_scale_button = new FakeButton();

    new UiBinding({
      machine_select,
      aspect_ratio_button,
      auto_scale_button,
      machine: 'standard',
      aspect_ratio: '1:1',
      auto_scale: true,
    });

    expect(machine_select.value).toBe('standard');
    expect(aspect_ratio_button.textContent).toBe('16:9');
    expect(auto_scale_button.textContent).toBe('2×');
    expect(auto_scale_button.getAttribute('aria-pressed')).toBe('true');
  });

  it('stops listening after terminate()', () => {
    const button = new FakeButton();
    const binding = new UiBinding({ aspect_ratio_button: button, aspect_ratio: '4:3' });

    const seen = [];
    binding.onAspectRatio((value) => seen.push(value));
    binding.terminate();

    button.click();

    expect(seen).toEqual([]);
  });
});
