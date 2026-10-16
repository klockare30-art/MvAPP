import { initialRange, loopPosition, setEnd, setStart } from '../range';

describe('clip range markers', () => {
  const d = 135_000;
  test('starts as the whole video', () => {
    expect(initialRange(d)).toEqual({ startMs: 0, endMs: d });
  });
  test('start/end are clamped and keep a 1 s minimum', () => {
    let r = initialRange(d);
    r = setStart(r, 42_000, d);
    r = setEnd(r, 63_000, d);
    expect(r).toEqual({ startMs: 42_000, endMs: 63_000 });
    expect(setStart(r, 70_000, d).startMs).toBe(62_000);
    expect(setEnd(r, 10_000, d).endMs).toBe(43_000);
    expect(setStart(r, -5, d).startMs).toBe(0);
    expect(setEnd(r, 999_999, d).endMs).toBe(d);
  });
  test('selection preview loops', () => {
    const r = { startMs: 42_000, endMs: 63_000 };
    expect(loopPosition(r, 50_000)).toBeNull();
    expect(loopPosition(r, 63_000)).toBe(42_000);
    expect(loopPosition(r, 10_000)).toBe(42_000);
  });
});
