/**
 * Thin adapter over `requestAnimationFrame` and the performance clock.
 *
 * Injecting it keeps `ComputerProfile` free of direct `window` access and lets
 * the main loop be driven by a fake ticker in tests.
 */
export class Ticker {
  constructor(target = window) {
    this.target = target;
  }

  now() {
    return this.target.performance.now();
  }

  requestAnimationFrame(handler) {
    return this.target.requestAnimationFrame(handler);
  }

  cancelAnimationFrame(frame_id) {
    this.target.cancelAnimationFrame(frame_id);
  }
}
