import { assertInstance } from './utils/assert.js';

// The original PC-01 had non-square pixels; modern displays need the CRT 4:3
// aspect ratio. Other ratios (1:1, 16:9) are listed as future work in
// CODE_REVIEW.md (P3.8).
const ASPECT_RATIO = 4 / 3;

const IMAGE_RENDERING = 'crisp-edges'; // -webkit-optimize-contrast | pixelated | crisp-edges
const IMAGE_SMOOTHING_ENABLED = false;

export class Viewport {
  constructor(container) {
    assertInstance(container, HTMLDivElement, 'VIEWPORT: Invalid container element');

    this.canvas = document.createElement('canvas');
    this.container = container;

    this.CANVAS_HEIGHT = 256;
    this.CANVAS_WIDTH = 256;
    this.SCALE = 2;
    this.ASPECT_RATIO = ASPECT_RATIO;
    this.image_data = void 0;

    this.init();
  }

  init() {
    this.canvas.style.imageRendering = IMAGE_RENDERING;
    this.set_resolution();
    this.container.appendChild(this.canvas);
  }

  terminate() {
    if (this.canvas instanceof HTMLCanvasElement) {
      this.canvas.remove();
      this.container = this.canvas = this.image_data = null;
    }
  }

  pause(state) {
    this.canvas.classList[state ? 'add' : 'remove']('pause');
  }

  set_resolution(
    width = this.CANVAS_WIDTH,
    height = this.CANVAS_HEIGHT,
    aspectRatio = this.ASPECT_RATIO,
    scale = this.SCALE
  ) {
    this.canvas.width = width;
    this.canvas.height = height;

    // Apply aspect ratio scaling to width
    const scaledWidth = width * scale * aspectRatio;
    const scaledHeight = height * scale;

    this.canvas.style.width = `${scaledWidth}px`;
    this.canvas.style.height = `${scaledHeight}px`;
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

    // Enable image smoothing for better visual quality
    context.imageSmoothingEnabled = IMAGE_SMOOTHING_ENABLED;

    context.putImageData(this.image_data, 0, 0);
  }

  renderScreen(screen) {
    this.render(screen.draw());
  }

  takeScreenshoot(cb) {
    this.canvas.toBlob(cb);
  }
}
