import { describe, it, expect } from 'vitest';
import { fitScale, Viewport } from '../src/viewport.js';

describe('fitScale', () => {
  it('returns the scale that exactly fits the container', () => {
    // 256px at 2× with 4:3 → 682.66…×512
    expect(fitScale(682.67, 512, 256, 256, 4 / 3)).toBe(2);
  });

  it('rounds down to the nearest integer scale', () => {
    // 3× at 4:3 needs 1024×768.
    expect(fitScale(1023, 767, 256, 256, 4 / 3)).toBe(2);
    expect(fitScale(1024, 768, 256, 256, 4 / 3)).toBe(3);
  });

  it('respects the height as the limiting dimension', () => {
    // Very wide but short container: height limits the scale.
    expect(fitScale(10000, 255, 256, 256, 4 / 3)).toBe(1);
    expect(fitScale(10000, 512, 256, 256, 4 / 3)).toBe(2);
  });

  it('respects the width as the limiting dimension', () => {
    // 1× at 4:3 needs 341.33px of width.
    expect(fitScale(341, 10000, 256, 256, 4 / 3)).toBe(1);
    expect(fitScale(683, 10000, 256, 256, 4 / 3)).toBe(2);
  });

  it('applies the aspect ratio to the width only', () => {
    // At 1:1 the width equals the height.
    expect(fitScale(512, 512, 256, 256, 1)).toBe(2);
    // At 16:9 the width is much wider, so the height limits the scale.
    expect(fitScale(2000, 512, 256, 256, 16 / 9)).toBe(2);
  });

  it('never returns less than 1', () => {
    expect(fitScale(10, 10, 256, 256, 4 / 3)).toBe(1);
  });

  it('falls back to 1 for a non-positive container or image size', () => {
    expect(fitScale(0, 512, 256, 256, 4 / 3)).toBe(1);
    expect(fitScale(-5, 512, 256, 256, 4 / 3)).toBe(1);
    expect(fitScale(512, 0, 256, 256, 4 / 3)).toBe(1);
    expect(fitScale(512, 512, 0, 256, 4 / 3)).toBe(1);
    expect(fitScale(512, 512, 256, 0, 4 / 3)).toBe(1);
  });
});

describe('Viewport high-resolution geometry (P2.13)', () => {
  const fake_viewport = (width) =>
    Object.assign(Object.create(Viewport.prototype), {
      ASPECT_RATIO: 4 / 3,
      CANVAS_WIDTH: width,
      CANVAS_HEIGHT: 256,
      SCALE: 2,
      auto_scale: false,
      canvas: { style: {} },
      redraw() {},
    });

  it('halves the horizontal stretch of a dot in 512×256', () => {
    expect(fake_viewport(256).dot_aspect_ratio()).toBeCloseTo(4 / 3);
    expect(fake_viewport(512).dot_aspect_ratio()).toBeCloseTo(2 / 3);
  });

  it('keeps the displayed size of the picture', () => {
    const normal = fake_viewport(256);
    const high_res = fake_viewport(512);

    normal.apply_resolution();
    high_res.apply_resolution();

    // Twice as many, half as wide dots: the same 4:3 picture on screen.
    expect(high_res.canvas.style.width).toBe(normal.canvas.style.width);
    expect(high_res.canvas.style.height).toBe(normal.canvas.style.height);
  });
});

describe('Viewport.takeScreenshoot (P3.19)', () => {
  const fake_viewport = () => {
    const calls = [];
    const viewport = Object.assign(Object.create(Viewport.prototype), {
      canvas: {
        toBlob(callback, type) {
          calls.push(type);
          callback({ type });
        },
      },
    });

    return { viewport, calls };
  };

  it('passes the requested MIME type to canvas.toBlob', () => {
    const { viewport, calls } = fake_viewport();
    const blobs = [];

    viewport.takeScreenshoot((blob) => blobs.push(blob), 'image/jpeg');

    expect(calls).toEqual(['image/jpeg']);
    expect(blobs[0].type).toBe('image/jpeg');
  });

  it('defaults to PNG', () => {
    const { viewport, calls } = fake_viewport();

    viewport.takeScreenshoot(() => {});

    expect(calls).toEqual(['image/png']);
  });
});

describe('Viewport.normalizeAspectRatio', () => {
  it('keeps a positive finite number', () => {
    expect(Viewport.normalizeAspectRatio(16 / 9)).toBeCloseTo(16 / 9);
  });

  it('resolves preset names', () => {
    expect(Viewport.normalizeAspectRatio('1:1')).toBe(1);
    expect(Viewport.normalizeAspectRatio('4:3')).toBeCloseTo(4 / 3);
    expect(Viewport.normalizeAspectRatio('16:9')).toBeCloseTo(16 / 9);
  });

  it('falls back to 4:3 for unknown input', () => {
    expect(Viewport.normalizeAspectRatio('21:9')).toBeCloseTo(4 / 3);
    expect(Viewport.normalizeAspectRatio(undefined)).toBeCloseTo(4 / 3);
    expect(Viewport.normalizeAspectRatio(0)).toBeCloseTo(4 / 3);
    expect(Viewport.normalizeAspectRatio(-1)).toBeCloseTo(4 / 3);
  });
});
