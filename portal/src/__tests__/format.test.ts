import { describe, expect, test } from 'vitest';

import { buildVideoTree, groupByMatch, bytesToGb, filterByFocus, focusAreaCounts, formatBytes, formatPosition, gbToBytes, groupByDay, sortComments, stepFrame } from '../format';
import type { PublishedVideo, VideoComment } from '../types';

function v(id: string, focus: string | null, recorded: string): PublishedVideo {
  return {
    id, coach_id: 'c', goaltender_id: 'g', storage_path: `c/g/${id}.mov`, focus_area: focus, exercise: null,
    session_title: null, team_name: null, recorded_at: recorded, duration_ms: 1000, frame_rate: 30,
    coach_note: null, published_at: recorded,
  };
}

const videos = [
  v('1', 'Förflyttningar', '2026-10-13T16:00:00Z'),
  v('2', 'Förflyttningar', '2026-10-13T16:05:00Z'),
  v('3', 'Stolpspel', '2026-10-10T16:00:00Z'),
  v('4', null, '2026-10-10T17:00:00Z'),
];

describe('portal format helpers', () => {
  test('focus area counts, most first', () => {
    expect(focusAreaCounts(videos)).toEqual([
      { name: 'Förflyttningar', count: 2 },
      { name: 'Stolpspel', count: 1 },
      { name: 'Utan fokusområde', count: 1 },
    ]);
  });

  test('filter by focus area incl. videos without one', () => {
    expect(filterByFocus(videos, 'Förflyttningar').map((x) => x.id)).toEqual(['1', '2']);
    expect(filterByFocus(videos, 'Utan fokusområde').map((x) => x.id)).toEqual(['4']);
    expect(filterByFocus(videos, null)).toHaveLength(4);
  });

  test('groups by day, newest first', () => {
    const g = groupByDay(videos);
    expect(g).toHaveLength(2);
    expect(g[0]?.videos.map((x) => x.id)).toEqual(['2', '1']);
  });

  test('timestamped comments first, in video order', () => {
    const c = (id: string, ts: number | null, at: string): VideoComment => ({
      id, video_id: 'v', author_id: 'a', author_role: 'goaltender', timestamp_ms: ts, content: 'x', created_at: at,
    });
    const sorted = sortComments([c('a', null, '1'), c('b', 24000, '2'), c('c', 18000, '3')]);
    expect(sorted.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });

  test('position formatting is exact (no floating point drift)', () => {
    expect(formatPosition(4.3)).toBe('00:04.3');
    expect(formatPosition(1.8)).toBe('00:01.8');
    expect(formatPosition(62.05)).toBe('01:02.0');
  });

  test('frame stepping lands inside the neighbouring frame', () => {
    const t = stepFrame((100 + 0.5) / 30, 1, 30, 120);
    expect(Math.floor(t * 30)).toBe(101);
    expect(stepFrame(0, -1, 30, 10)).toBeCloseTo(0.5 / 30);
  });
});

describe('storage sizes', () => {
  test('formats bytes in Swedish', () => {
    expect(formatBytes(1024 ** 3 * 1.5)).toBe('1,5 GB');
    expect(formatBytes(320 * 1024 ** 2)).toBe('320 MB');
    expect(formatBytes(2048)).toBe('2 kB');
  });
  test('GB round-trips for the level editor', () => {
    expect(gbToBytes(1)).toBe(1073741824);
    expect(bytesToGb(gbToBytes(2.5))).toBe(2.5);
  });
});

describe('grouping per match', () => {
  test('clips from the same day and match stay together; other sessions get their own group', () => {
    const a = { ...v('a', 'Skott', '2026-10-18T19:10:00'), session_title: 'Hemma mot AIK' };
    const b = { ...v('b', 'Retur', '2026-10-18T19:40:00'), session_title: 'Hemma mot AIK' };
    const c = { ...v('c', 'Skott', '2026-10-18T10:00:00'), session_title: 'Morgonpass' };
    const d = { ...v('d', 'Skott', '2026-10-11T19:00:00'), session_title: null };
    const groups = groupByMatch([a, c, d, b]);
    expect(groups.map((g) => g.videos.map((x) => x.id))).toEqual([['b', 'a'], ['c'], ['d']]);
    expect(groups[0]?.title).toContain('Hemma mot AIK');
    expect(groups[2]?.title).not.toContain('·');
  });
});

describe('coach library tree', () => {
  const clip = (id: string, goalie: string, at: string, title: string | null, kind: 'match' | 'traning' | null) => ({
    ...v(id, 'Skott', at), goaltender_id: goalie, session_title: title, session_kind: kind,
  });
  const goalies = [
    { id: 'erik', first_name: 'Erik', last_name: 'A', jersey_number: 30, team_id: 'j18' },
    { id: 'oliver', first_name: 'Oliver', last_name: 'E', jersey_number: 1, team_id: 'u16' },
    { id: 'hugo', first_name: 'Hugo', last_name: 'L', jersey_number: null, team_id: null },
  ];
  const teams = [{ id: 'j18', club_id: 'dif', name: 'J18', season: '2026/27' }, { id: 'u16', club_id: 'dif', name: 'U16' }];
  const clubs = [{ id: 'dif', name: 'Djurgården' }];

  test('club → team → goaltender → match/training → date + title → clips', () => {
    const tree = buildVideoTree(
      [
        clip('a', 'erik', '2026-10-18T19:10:00', 'Hemma mot AIK', 'match'),
        clip('b', 'erik', '2026-10-18T19:40:00', 'Hemma mot AIK', 'match'),
        clip('c', 'erik', '2026-10-16T17:00:00', 'Förflyttningar', 'traning'),
        clip('d', 'erik', '2026-10-11T19:00:00', 'Borta mot HV71', 'match'),
        clip('e', 'oliver', '2026-10-17T10:00:00', null, null),
        clip('f', 'hugo', '2026-10-17T10:00:00', 'Pass', 'traning'),
      ],
      goalies, teams, clubs,
    );
    expect(tree.map((c) => c.name)).toEqual(['Djurgården', 'Utan klubb/lag']);
    const dif = tree[0]!;
    expect(dif.teams.map((t) => t.name)).toEqual(['J18 (2026/27)', 'U16']);
    const erik = dif.teams[0]!.goalies[0]!;
    expect(erik.label).toBe('Erik A #30');
    expect(erik.count).toBe(4);
    expect(erik.kinds.map((k) => k.kind)).toEqual(['match', 'traning']);
    const matches = erik.kinds[0]!.sessions;
    expect(matches.map((s) => s.title)).toEqual(['Hemma mot AIK', 'Borta mot HV71']); // newest first
    expect(matches[0]!.videos.map((x) => x.id)).toEqual(['a', 'b']); // match order
    expect(dif.teams[1]!.goalies[0]!.kinds[0]).toMatchObject({ kind: 'none' });
    expect(dif.teams[1]!.goalies[0]!.kinds[0]!.sessions[0]!.title).toBe('Utan rubrik');
    expect(tree[1]!.teams[0]!.goalies.map((g) => g.label)).toEqual(['Hugo L']);
  });

  test('empty teams and clubs are left out', () => {
    expect(buildVideoTree([], goalies, teams, clubs)).toEqual([]);
  });
});
