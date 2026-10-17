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

  it('forwards frame changes to the handler (P2.20)', () => {
    const frame_select = new FakeControl({ value: 'pc01' });
    const binding = new UiBinding({ frame_select });

    const seen = [];
    binding.onFrame((frame) => seen.push(frame));

    frame_select.value = 'legacy';
    frame_select.dispatchEvent(new Event('change'));

    expect(seen).toEqual(['legacy']);
    binding.terminate();
  });

  it('syncs the controls to the configured initial values', () => {
    const machine_select = new FakeControl({ value: 'pc01_lvov_80_fixed' });
    const frame_select = new FakeControl({ value: 'legacy' });
    const select = new FakeControl({ value: '1:1' });
    const checkbox = new FakeControl({ checked: true });

    new UiBinding({
      machine_select,
      frame_select,
      aspect_ratio_select: select,
      auto_scale_checkbox: checkbox,
      machine: 'pc01_lvov_80',
      frame: 'pc01',
      aspect_ratio: '4:3',
      auto_scale: false,
    });

    expect(machine_select.value).toBe('pc01_lvov_80');
    expect(frame_select.value).toBe('pc01');
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
