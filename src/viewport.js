import { assertInstance } from './utils/assert.js';

// The original PC-01 had non-square pixels; modern displays need the CRT 4:3
// aspect ratio. Other ratios (1:1, 16:9) are selectable at runtime via
// setAspectRatio() (CODE_REVIEW.md P3.8.3).
const ASPECT_RATIO = 4 / 3;

// The aspect ratio above belongs to the reference framebuffer of the PC-01
// (256×256). The PK-02 high-resolution mode (P2.13) packs twice as many dots
// into the same line time, so its dots are half as wide — see dot_aspect_ratio().
const REFERENCE_WIDTH = 256;

const ASPECT_RATIOS = {
  '1:1': 1,
  '4:3': 4 / 3,
  '16:9': 16 / 9,
};

const IMAGE_RENDERING = 'crisp-edges'; // -webkit-optimize-contrast | pixelated | crisp-edges
const IMAGE_SMOOTHING_ENABLED = false;

// The display never goes below one device pixel per emulated pixel, so a very
// small window cannot collapse the image to nothing.
const MIN_SCALE = 1;

/**
 * Largest integer scale that fits a `width × height` image, displayed with the
 * given aspect ratio, into a `containerWidth × containerHeight` box.
 *
 * Only integer scales are considered: with `image-rendering: crisp-edges` a
 * fractional scale would blur the pixel grid (CODE_REVIEW.md P3.8.7).
 *
 * @param {number} containerWidth - Available width (CSS pixels).
 * @param {number} containerHeight - Available height (CSS pixels).
 * @param {number} width - Emulated image width (256 for the PC-01).
 * @param {number} height - Emulated image height (256 for the PC-01).
 * @param {number} aspectRatio - Display aspect ratio (e.g. 4 / 3).
 * @returns {number} Largest fitting integer scale, never below 1.
 */
export const fitScale = (containerWidth, containerHeight, width, height, aspectRatio) => {
  if (!(containerWidth > 0) || !(containerHeight > 0) || !(width > 0) || !(height > 0)) {
    return MIN_SCALE;
  }

  const scale = Math.floor(
    Math.min(containerWidth / (width * aspectRatio), containerHeight / height)
  );

  return Math.max(MIN_SCALE, scale);
};

/**
 * Returns the preset name ('1:1', '4:3', '16:9') whose ratio matches `value`,
 * or null when the value is not one of the presets. A preset name passed in is
 * returned unchanged.
 */
export const aspectRatioName = (value) => {
  if (typeof value === 'string' && value in ASPECT_RATIOS) {
    return value;
  }

  for (const [name, ratio] of Object.entries(ASPECT_RATIOS)) {
    if (typeof value === 'number' && Math.abs(ratio - value) < 1e-6) {
      return name;
    }
  }

  return null;
};

export class Viewport {
  constructor(container, { aspect_ratio = ASPECT_RATIO, auto_scale = false } = {}) {
    assertInstance(container, HTMLDivElement, 'VIEWPORT: Invalid container element');

    this.canvas = document.createElement('canvas');
    this.container = container;

    this.CANVAS_HEIGHT = 256;
    this.CANVAS_WIDTH = 256;
    this.SCALE = 2;
    this.ASPECT_RATIO = Viewport.normalizeAspectRatio(aspect_ratio);
    this.auto_scale = auto_scale;
    this.resize_observer = void 0;
    this.image_data = void 0;

    this.init();
  }

  /**
   * Accepts a preset name ('1:1', '4:3', '16:9') or a number; falls back to the
   * default 4:3 CRT ratio.
   */
  static normalizeAspectRatio(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }

    return ASPECT_RATIOS[value] ?? ASPECT_RATIO;
  }

  init() {
    this.canvas.style.imageRendering = IMAGE_RENDERING;

    if (this.auto_scale) {
      // Give the container (and its row) a size that is independent of the
      // canvas, so the fit can be computed from the available space.
      this.container.classList.add('auto-scale');
      this.container.parentElement?.classList.add('auto-scale');
    }

    this.container.appendChild(this.canvas);

    if (this.auto_scale) {
      this.attach_resize_observer();
      this.fit_to_container();
    } else {
      this.set_resolution();
    }
  }

  terminate() {
    this.detach_resize_observer();

    if (this.canvas instanceof HTMLCanvasElement) {
      this.canvas.remove();
      this.container = this.canvas = this.image_data = null;
    }
  }

  pause(state) {
    this.canvas.classList[state ? 'add' : 'remove']('pause');
  }

  /**
   * Changes the display aspect ratio (P3.8.3). Accepts a number (e.g. 4 / 3)
   * or a preset name: '1:1', '4:3', '16:9'. Re-applies the current sizing.
   */
  setAspectRatio(value) {
    this.ASPECT_RATIO = Viewport.normalizeAspectRatio(value);
    this.apply_resolution();
  }

  /**
   * Toggles the adaptive "fit to window" mode (P3.8.7). Attaches or detaches
   * the resize observer and the container sizing classes accordingly.
   */
  setAutoScale(value) {
    const enabled = Boolean(value);

    if (enabled === this.auto_scale) {
      return;
    }

    this.auto_scale = enabled;

    if (enabled) {
      this.container.classList.add('auto-scale');
      this.container.parentElement?.classList.add('auto-scale');
      this.attach_resize_observer();
    } else {
      this.detach_resize_observer();
      this.container.classList.remove('auto-scale');
      this.container.parentElement?.classList.remove('auto-scale');
    }

    this.apply_resolution();
  }

  /**
   * Horizontal stretch applied to a single emulated dot so that the picture fits
   * the configured display aspect ratio (P3.8.3).
   *
   * The configured ratio describes the reference 256×256 framebuffer. In the
   * high-resolution mode (P2.13) a line holds 512 dots instead of 256 within the
   * same line time, so the dots are half as wide and the stretch is halved: the
   * picture keeps both its aspect ratio and its size on screen.
   */
  dot_aspect_ratio() {
    return (this.ASPECT_RATIO * REFERENCE_WIDTH) / this.CANVAS_WIDTH;
  }

  set_resolution(
    width = this.CANVAS_WIDTH,
    height = this.CANVAS_HEIGHT,
    aspectRatio = this.ASPECT_RATIO,
    scale = this.SCALE
  ) {
    this.CANVAS_WIDTH = width;
    this.CANVAS_HEIGHT = height;
    this.ASPECT_RATIO = aspectRatio;
    this.SCALE = scale;

    this.apply_resolution();
  }

  /**
   * Recomputes the CSS size of the canvas. In auto-scale mode the scale comes
   * from the container size; otherwise the fixed SCALE is used.
   */
  apply_resolution() {
    const dot_aspect = this.dot_aspect_ratio();
    let scale = this.SCALE;

    if (this.auto_scale) {
      scale = fitScale(
        this.container.clientWidth,
        this.container.clientHeight,
        this.CANVAS_WIDTH,
        this.CANVAS_HEIGHT,
        dot_aspect
      );
    }

    this.canvas.width = this.CANVAS_WIDTH;
    this.canvas.height = this.CANVAS_HEIGHT;

    // The aspect ratio stretches the width only: the framebuffer is displayed
    // with non-square pixels, the way the CRT showed it.
    const scaledWidth = this.CANVAS_WIDTH * scale * dot_aspect;
    const scaledHeight = this.CANVAS_HEIGHT * scale;

    this.canvas.style.width = `${scaledWidth}px`;
    this.canvas.style.height = `${scaledHeight}px`;

    // Assigning canvas.width/height resets the bitmap, so repaint the last
    // rendered frame: the screen is not marked dirty by a resolution change,
    // and without this the picture stays blank until the next dirty redraw.
    this.redraw();
  }

  fit_to_container() {
    this.apply_resolution();
  }

  attach_resize_observer() {
    if (typeof ResizeObserver !== 'function') {
      console.warn('VIEWPORT: ResizeObserver is not available; auto-scale stays off.');
      return;
    }

    this.resize_observer = new ResizeObserver(() => this.fit_to_container());
    this.resize_observer.observe(this.container);
  }

  detach_resize_observer() {
    this.resize_observer?.disconnect();
    this.resize_observer = void 0;
  }

  render(pixels) {
    if (!pixels) return;

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('VIEWPORT: 2D context not available');
    }

    // ImageData shares the Screen's pixel buffer (no copy).
    this.image_data ??= new ImageData(
      new Uint8ClampedArray(pixels.buffer),
      this.CANVAS_WIDTH,
      this.CANVAS_HEIGHT
    );

    this.redraw();
  }

  /**
   * Paints the last rendered frame onto the canvas. Used after a resolution
   * change, whose canvas.width/height assignment resets the bitmap while the
   * emulated screen itself stays clean (draw() keeps returning null).
   */
  redraw() {
    if (!this.image_data) return;

    const context = this.canvas.getContext('2d');
    if (!context) return;

    // Enable image smoothing for better visual quality
    context.imageSmoothingEnabled = IMAGE_SMOOTHING_ENABLED;

    context.putImageData(this.image_data, 0, 0);
  }

  renderScreen(screen) {
    const pixels = screen.draw();

    // A program can switch the PC-01 between 256×256 and 512×256 (P2.13) at any
    // time; the canvas and its ImageData view have to follow the framebuffer.
    if (screen.width !== this.CANVAS_WIDTH || screen.height !== this.CANVAS_HEIGHT) {
      this.set_framebuffer_resolution(screen.width, screen.height);
    }

    this.render(pixels);
  }

  /**
   * Adopts the resolution of the emulated screen. The ImageData buffer is
   * dropped so that render() rebuilds it for the new size; the frame that comes
   * with the switch is painted right after this call.
   */
  set_framebuffer_resolution(width, height) {
    this.image_data = void 0;

    this.set_resolution(width, height);
  }

  takeScreenshoot(cb) {
    this.canvas.toBlob(cb);
  }
}
