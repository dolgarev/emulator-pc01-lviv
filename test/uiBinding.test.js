import { describe, it, expect } from 'vitest';
import { UiBinding } from '../src/uiBinding.js';

class FakeControl extends EventTarget {
  constructor({ value = '', checked = false } = {}) {
    super();
    this.value = value;
    this.checked = checked;
  }
}

describe('UiBinding', () => {
  it('forwards aspect-ratio changes to the handler', () => {
    const select = new FakeControl({ value: '4:3' });
    const binding = new UiBinding({ aspect_ratio_select: select });

    const seen = [];
    binding.onAspectRatio((value) => seen.push(value));

    select.value = '16:9';
    select.dispatchEvent(new Event('change'));

    expect(seen).toEqual(['16:9']);
    binding.terminate();
  });

  it('forwards auto-scale changes to the handler', () => {
    const checkbox = new FakeControl({ checked: false });
    const binding = new UiBinding({ auto_scale_checkbox: checkbox });

    const seen = [];
    binding.onAutoScale((value) => seen.push(value));

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    expect(seen).toEqual([true]);
    binding.terminate();
  });

  it('syncs the controls to the configured initial values', () => {
    const select = new FakeControl({ value: '1:1' });
    const checkbox = new FakeControl({ checked: true });

    new UiBinding({
      aspect_ratio_select: select,
      auto_scale_checkbox: checkbox,
      aspect_ratio: '4:3',
      auto_scale: false,
    });

    expect(select.value).toBe('4:3');
    expect(checkbox.checked).toBe(false);
  });

  it('stops listening after terminate()', () => {
    const select = new FakeControl({ value: '4:3' });
    const binding = new UiBinding({ aspect_ratio_select: select });

    const seen = [];
    binding.onAspectRatio((value) => seen.push(value));
    binding.terminate();

    select.value = '1:1';
    select.dispatchEvent(new Event('change'));

    expect(seen).toEqual([]);
  });
});
