import { describe, expect, test } from 'vitest';

import {
  clipFileName,
  clipRange,
  countByType,
  formatClock,
  newTag,
  parseStoredTags,
  sortTags,
  tagTypeForKey,
} from '../tagging';

describe('match tagging', () => {
  test('keyboard shortcuts map to tag types', () => {
    expect(tagTypeForKey('S')?.label).toBe('Skott');
    expect(tagTypeForKey('r')?.label).toBe('Retur');
    expect(tagTypeForKey('c')?.label).toBe('Scanning');
    expect(tagTypeForKey('x')).toBeNull();
  });

  test('clip range uses the margins and stays inside the match', () => {
    expect(clipRange(newTag('skott', 100, 6, 3), 3600)).toEqual({ startSec: 94, endSec: 103 });
    expect(clipRange(newTag('skott', 2, 6, 3), 3600)).toEqual({ startSec: 0, endSec: 5 });
    expect(clipRange(newTag('skott', 3599, 6, 3), 3600)).toEqual({ startSec: 3593, endSec: 3600 });
  });

  test('match clock and Windows-safe file names', () => {
    expect(formatClock(245.9)).toBe('4:05');
    expect(formatClock(5053)).toBe('1:24:13');
    expect(clipFileName(newTag('retur', 5053))).toBe('Retur_1-24-13.mp4');
  });

  test('tags sort by time and are counted per type', () => {
    const tags = [newTag('skott', 50), newTag('retur', 10), newTag('skott', 20)];
    expect(sortTags(tags).map((t) => t.atSec)).toEqual([10, 20, 50]);
    expect(countByType(tags).map((c) => `${c.type.label}:${c.count}`)).toEqual(['Skott:2', 'Retur:1']);
  });

  test('stored tags survive a reload; corrupt storage is ignored', () => {
    const tags = [newTag('skott', 12.5)];
    expect(parseStoredTags(JSON.stringify(tags))).toEqual(tags);
    expect(parseStoredTags('not json')).toEqual([]);
    expect(parseStoredTags(JSON.stringify([{ id: 1 }]))).toEqual([]);
    expect(parseStoredTags(null)).toEqual([]);
  });
});
