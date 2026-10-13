import { currentSeason, formatBytes, formatDuration, formatMinutes, formatPosition, parseLocalDateTime, toDateInput, toTimeInput } from '../time';

describe('time utils', () => {
  test('formatDuration', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(83_000)).toBe('01:23');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
    expect(formatDuration(-5)).toBe('00:00');
  });

  test('formatPosition shows tenths', () => {
    expect(formatPosition(42_350)).toBe('00:42.3');
  });

  test('formatMinutes', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(320)).toBe('5 h 20 min');
    expect(formatMinutes(120)).toBe('2 h');
  });

  test('formatBytes uses Swedish decimal comma', () => {
    expect(formatBytes(1536 * 1024)).toBe('1,5 MB');
  });

  test('parseLocalDateTime', () => {
    const d = parseLocalDateTime('2026-10-13', '17:30');
    expect(d && toDateInput(d)).toBe('2026-10-13');
    expect(d && toTimeInput(d)).toBe('17:30');
    expect(parseLocalDateTime('2026-02-31', '10:00')).toBeNull();
    expect(parseLocalDateTime('2026-10-13', '25:00')).toBeNull();
    expect(parseLocalDateTime('13/10/2026', '10:00')).toBeNull();
    expect(parseLocalDateTime('2026-10-13', '9.05')?.getMinutes()).toBe(5);
  });

  test('currentSeason switches in August', () => {
    expect(currentSeason(new Date(2026, 6, 31))).toBe('2025/2026');
    expect(currentSeason(new Date(2026, 7, 1))).toBe('2026/2027');
  });
});
