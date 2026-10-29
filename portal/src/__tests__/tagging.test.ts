import { describe, expect, test } from 'vitest';

import {
  clipFileName,
  chosenTags,
  clipRange,
  countByType,
  formatClock,
  goaliesInTeam,
  insertByTime,
  moveTag,
  NO_TEAM,
  newTag,
  parseStoredTags,
  sortTags,
  tagTypeForKey,
  DEFAULT_TAG_TYPES,
  tagTypeById,
  tagTypeId,
  tagTypesProblem,
  type TagType,
} from '../tagging';

describe('match tagging', () => {
  test('keyboard shortcuts map to tag types', () => {
    expect(tagTypeForKey(DEFAULT_TAG_TYPES, 'S')?.label).toBe('Skott');
    expect(tagTypeForKey(DEFAULT_TAG_TYPES, 'r')?.label).toBe('Retur');
    expect(tagTypeForKey(DEFAULT_TAG_TYPES, 'c')?.label).toBe('Scanning');
    expect(tagTypeForKey(DEFAULT_TAG_TYPES, 'x')).toBeNull();
  });

  test('clip range uses the margins and stays inside the match', () => {
    expect(clipRange(newTag('skott', 100, 6, 3), 3600)).toEqual({ startSec: 94, endSec: 103 });
    expect(clipRange(newTag('skott', 2, 6, 3), 3600)).toEqual({ startSec: 0, endSec: 5 });
    expect(clipRange(newTag('skott', 3599, 6, 3), 3600)).toEqual({ startSec: 3593, endSec: 3600 });
  });

  test('match clock and Windows-safe file names', () => {
    expect(formatClock(245.9)).toBe('4:05');
    expect(formatClock(5053)).toBe('1:24:13');
    expect(clipFileName(DEFAULT_TAG_TYPES, newTag('retur', 5053))).toBe('Retur_1-24-13.mp4');
  });

  test('tags sort by time and are counted per type', () => {
    const tags = [newTag('skott', 50), newTag('retur', 10), newTag('skott', 20)];
    expect(sortTags(tags).map((t) => t.atSec)).toEqual([10, 20, 50]);
    expect(countByType(DEFAULT_TAG_TYPES, tags).map((c) => `${c.type.label}:${c.count}`)).toEqual(['Skott:2', 'Retur:1']);
  });

  test('stored tags survive a reload; corrupt storage is ignored', () => {
    const tags = [newTag('skott', 12.5)];
    expect(parseStoredTags(JSON.stringify(tags))).toEqual(tags);
    expect(parseStoredTags('not json')).toEqual([]);
    expect(parseStoredTags(JSON.stringify([{ id: 1 }]))).toEqual([]);
    expect(parseStoredTags(null)).toEqual([]);
  });
});

describe('choosing goaltenders by team', () => {
  const g = (id: string, team_id: string | null) => ({ id, team_id });
  const goalies = [g('erik', 't1'), g('william', 't1'), g('oliver', 't2'), g('hugo', null), g('stale', 'deleted-team')];
  test('lists the team\'s goaltenders, and those without a valid team under NO_TEAM', () => {
    expect(goaliesInTeam(goalies, ['t1', 't2'], 't1').map((x) => x.id)).toEqual(['erik', 'william']);
    expect(goaliesInTeam(goalies, ['t1', 't2'], NO_TEAM).map((x) => x.id)).toEqual(['hugo', 'stale']);
  });
});

describe('marking clips', () => {
  test('acts on marked clips, or on all when none are marked, in the coach\'s list order', () => {
    const a = newTag('skott', 50);
    const b = newTag('retur', 10);
    const c = newTag('skott', 30);
    expect(chosenTags([a, b, c], new Set([a.id, c.id])).map((t) => t.atSec)).toEqual([50, 30]);
    expect(chosenTags([a, b, c], new Set()).map((t) => t.atSec)).toEqual([50, 10, 30]);
  });
});

describe('presentation order', () => {
  const a = newTag('skott', 10);
  const b = newTag('retur', 20);
  const c = newTag('skott', 30);

  test('a new tag goes in at its place in time', () => {
    expect(insertByTime([], b).map((t) => t.atSec)).toEqual([20]);
    expect(insertByTime([a, c], b).map((t) => t.atSec)).toEqual([10, 20, 30]);
    expect(insertByTime([c, a], newTag('mal', 40)).map((t) => t.atSec)).toEqual([c.atSec, a.atSec, 40]);
    expect(insertByTime([b, c], newTag('mal', 5)).map((t) => t.atSec)).toEqual([5, 20, 30]);
  });

  test('moves a tag one step and stops at the ends', () => {
    expect(moveTag([a, b, c], c.id, -1).map((t) => t.id)).toEqual([a.id, c.id, b.id]);
    expect(moveTag([a, b, c], a.id, 1).map((t) => t.id)).toEqual([b.id, a.id, c.id]);
    expect(moveTag([a, b, c], a.id, -1)).toEqual([a, b, c]);
    expect(moveTag([a, b, c], c.id, 1)).toEqual([a, b, c]);
    expect(moveTag([a, b, c], 'missing', 1)).toEqual([a, b, c]);
  });

  test('the comment survives a reload', () => {
    const tags = [{ ...newTag('skott', 12.5), note: 'Titta på klubban' }];
    expect(parseStoredTags(JSON.stringify(tags))).toEqual(tags);
  });
});

describe('coach tag types (control panel)', () => {
  const t = (label: string, key: string): TagType => ({ id: tagTypeId(label, []), label, key, color: '#2f7bff', beforeSec: 6, afterSec: 3 });

  test('validates names, shortcuts and reserved keys like the database', () => {
    expect(tagTypesProblem([t('Skott', 's'), t('Pass bakom mål', 'p')])).toBeNull();
    expect(tagTypesProblem([t('Skott', 'f')])).toContain('snabbspolning');
    expect(tagTypesProblem([t('Skott', 's'), t('Retur', 'S')])).toContain('flera taggar');
    expect(tagTypesProblem([t('Skott', 's'), t('skott', 'r')])).toContain('finns redan');
    expect(tagTypesProblem([t('', 's')])).toContain('namn');
    expect(tagTypesProblem([t('Skott', 'ss')])).toContain('bokstav');
    expect(tagTypesProblem([{ ...t('Skott', 's'), beforeSec: 90 }])).toContain('0–60');
    expect(tagTypesProblem([])).toContain('minst en');
  });

  test('ids are readable, unique and valid for the database', () => {
    expect(tagTypeId('Pass bakom mål', [])).toBe('pass-bakom-mal');
    expect(tagTypeId('Skott', ['skott'])).toBe('skott-2');
    expect(tagTypeId('!!!', [])).toBe('tagg');
  });

  test('tags of a removed type are kept and labelled, file names stay safe', () => {
    const types = [t('Pass bakom mål', 'p')];
    expect(tagTypeById(types, 'gammal').label).toBe('Borttagen tagg');
    expect(countByType(types, [newTag('gammal', 1)]).map((c) => c.type.label)).toEqual(['Borttagen tagg']);
    expect(clipFileName(types, newTag('pass-bakom-mal', 65))).toBe('Pass-bakom-mål_1-05.mp4');
  });
});
