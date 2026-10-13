import { describe, expect, test } from 'vitest';

import { filterByFocus, focusAreaCounts, formatPosition, groupByDay, sortComments, stepFrame } from '../format';
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
