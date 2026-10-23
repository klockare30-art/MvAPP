import { describe, expect, it } from 'vitest';

import { candidateTimes, frameStats, pickFrame } from '../thumbs';

function image(w: number, h: number, px: (x: number, y: number) => number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = px(x, y);
      d.set([v, v, v, 255], (y * w + x) * 4);
    }
  return d;
}

describe('candidateTimes', () => {
  it('stays in the first half of the clip', () => {
    expect(candidateTimes(8)).toEqual([0.3, 0.8, 1.5, 2.5, 4]);
    expect(candidateTimes(2)).toEqual([0.3, 0.8]);
  });
  it('handles very short and unknown durations', () => {
    expect(candidateTimes(0.3)[0]).toBeCloseTo(0.1);
    expect(candidateTimes(NaN)).toEqual([0.5]);
  });
});

describe('frameStats', () => {
  it('scores hard edges sharper than a smooth gradient', () => {
    const edges = frameStats(image(32, 18, (x) => (x % 4 < 2 ? 0 : 255)), 32, 18);
    const smooth = frameStats(image(32, 18, (x) => x * 8), 32, 18);
    expect(edges.sharpness).toBeGreaterThan(smooth.sharpness);
    expect(smooth.sharpness).toBeCloseTo(0, 5);
  });
  it('reports mean luma', () => {
    expect(frameStats(image(4, 4, () => 0), 4, 4).luma).toBe(0);
    expect(frameStats(image(4, 4, () => 255), 4, 4).luma).toBeCloseTo(255, 3);
  });
});

describe('pickFrame', () => {
  it('skips dark frames and takes the first one close to the sharpest', () => {
    expect(
      pickFrame([
        { time: 0.3, luma: 5, sharpness: 900 },
        { time: 0.8, luma: 120, sharpness: 100 },
        { time: 1.5, luma: 120, sharpness: 700 },
        { time: 2.5, luma: 120, sharpness: 1000 },
      ]),
    ).toBe(1.5);
  });
  it('falls back to all frames when every frame is dark', () => {
    expect(pickFrame([{ time: 0.3, luma: 2, sharpness: 1 }])).toBe(0.3);
  });
  it('returns null without frames', () => {
    expect(pickFrame([])).toBeNull();
  });
});
