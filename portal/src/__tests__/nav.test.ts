import { describe, expect, test } from 'vitest';

import { neighbours } from '../nav';

describe('previous/next clip', () => {
  const ids = ['a', 'b', 'c'];
  test('middle, first and last clip', () => {
    expect(neighbours(ids, 'b')).toEqual({ index: 1, total: 3, prev: 'a', next: 'c' });
    expect(neighbours(ids, 'a')).toMatchObject({ prev: null, next: 'b' });
    expect(neighbours(ids, 'c')).toMatchObject({ prev: 'b', next: null });
  });
  test('a clip outside the filtered list gets no navigation', () => {
    expect(neighbours(ids, 'x')).toBeNull();
  });
});
