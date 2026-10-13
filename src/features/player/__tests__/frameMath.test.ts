import { clampTime, frameIndexAt, stepFrameTime, timeForFrame } from '../frameMath';

describe('frame stepping', () => {
  test('frame index and centre time round-trip', () => {
    for (const fps of [25, 29.97, 30, 60]) {
      for (const k of [0, 1, 29, 30, 1234]) {
        expect(frameIndexAt(timeForFrame(k, fps), fps)).toBe(k);
      }
    }
  });

  test('steps exactly one frame forward/backward', () => {
    const fps = 30;
    const t0 = timeForFrame(100, fps);
    expect(frameIndexAt(stepFrameTime(t0, 1, fps, 120), fps)).toBe(101);
    expect(frameIndexAt(stepFrameTime(t0, -1, fps, 120), fps)).toBe(99);
  });

  test('stepping from an arbitrary (unaligned) position', () => {
    // 3.3 s at 30 fps is frame 99 (3.3*30 = 99.0000...). Next is 100.
    expect(frameIndexAt(stepFrameTime(3.3, 1, 30, 120), 30)).toBe(100);
  });

  test('clamps at start and end', () => {
    expect(stepFrameTime(0, -1, 30, 10)).toBeCloseTo(timeForFrame(0, 30));
    const last = Math.ceil(10 * 30) - 1;
    expect(frameIndexAt(stepFrameTime(9.999, 5, 30, 10), 30)).toBe(last);
  });

  test('falls back to 30 fps when unknown', () => {
    expect(frameIndexAt(stepFrameTime(timeForFrame(10, 30), 1, 0, 100), 30)).toBe(11);
  });

  test('clampTime', () => {
    expect(clampTime(-1, 10)).toBe(0);
    expect(clampTime(11, 10)).toBe(10);
    expect(clampTime(5, 0)).toBe(5);
  });
});
