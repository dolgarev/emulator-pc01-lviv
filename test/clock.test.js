import { describe, it, expect } from 'vitest';
import { Clock } from '../src/clock.js';

describe('Clock', () => {
  it('tracks the elapsed frame offset', () => {
    const clock = new Clock();
    expect(clock.frameOffset).toBe(0);

    clock.addCycles(10);
    expect(clock.frameOffset).toBe(10);
    expect(clock.totalCycles).toBe(10);

    clock.startFrame();
    expect(clock.frameOffset).toBe(0);

    clock.addCycles(5);
    expect(clock.frameOffset).toBe(5);
    expect(clock.totalCycles).toBe(15);
  });

  it('restart() resets everything', () => {
    const clock = new Clock();
    clock.addCycles(100);
    clock.startFrame();

    clock.restart();

    expect(clock.totalCycles).toBe(0);
    expect(clock.frameStart).toBe(0);
    expect(clock.frameOffset).toBe(0);
  });
});
