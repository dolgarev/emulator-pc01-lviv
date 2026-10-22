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
    expect(button.getAttribute('title')).toBe('Switch to the 1:1 aspect ratio');

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

  it('toggles auto-scale on click and names the next mode on the button', () => {
    const button = new FakeButton();
    const binding = new UiBinding({ auto_scale_button: button, auto_scale: false });

    const seen = [];
    binding.onAutoScale((value) => seen.push(value));

    expect(button.textContent).toBe('FIT');
    expect(button.getAttribute('aria-pressed')).toBe('false');

    button.click();

    expect(seen).toEqual([true]);
    expect(button.textContent).toBe('2×');
    expect(button.getAttribute('aria-pressed')).toBe('true');

    button.click();

    expect(seen).toEqual([true, false]);
    expect(button.textContent).toBe('FIT');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    binding.terminate();
  });

  it('forwards machine changes to the handler (P2.16)', () => {
    const machine_select = new FakeControl({ value: 'pc01_lvov_80' });
    const binding = new UiBinding({ machine_select });

    const seen = [];
    binding.onMachine((machine) => seen.push(machine));

    machine_select.value = 'pc01_lvov_80_fixed';
    machine_select.dispatchEvent(new Event('change'));

    expect(seen).toEqual(['pc01_lvov_80_fixed']);
    binding.terminate();
  });

  it('syncs the controls to the configured initial values', () => {
    const machine_select = new FakeControl({ value: 'pc01_lvov_80_fixed' });
    const aspect_ratio_button = new FakeButton();
    const auto_scale_button = new FakeButton();

    new UiBinding({
      machine_select,
      aspect_ratio_button,
      auto_scale_button,
      machine: 'pc01_lvov_80',
      aspect_ratio: '1:1',
      auto_scale: true,
    });

    expect(machine_select.value).toBe('pc01_lvov_80');
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
