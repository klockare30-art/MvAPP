export function nowIso(): string {
  return new Date().toISOString();
}

/** 83_000 -> "01:23", 3_723_000 -> "1:02:03" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Position with tenths of a second, for slow-motion review: "00:42.3" */
export function formatPosition(ms: number): string {
  const safe = Math.max(0, ms);
  const tenths = Math.floor((safe % 1000) / 100);
  return `${formatDuration(safe)}.${tenths}`;
}

const DATE_FMT = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' });
const TIME_FMT = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' });
const WEEKDAY_FMT = new Intl.DateTimeFormat('sv-SE', { weekday: 'long' });

export function formatDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return TIME_FMT.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

export function formatWeekday(iso: string): string {
  const s = WEEKDAY_FMT.format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1).replace('.', ',')} ${units[i]}`;
}

/** Default suggestion for the current hockey season, e.g. "2026/2027" (season starts in August). */
export function currentSeason(date = new Date()): string {
  const y = date.getFullYear();
  const start = date.getMonth() >= 7 ? y : y - 1;
  return `${start}/${start + 1}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date as "YYYY-MM-DD". */
export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local time as "HH:MM". */
export function toTimeInput(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses "YYYY-MM-DD" + "HH:MM" (local time). Returns null when invalid. */
export function parseLocalDateTime(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const tm = /^(\d{1,2})[:.](\d{2})$/.exec(time.trim());
  if (!dm || !tm) return null;
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const result = new Date(y, mo - 1, d, h, mi, 0, 0);
  // Reject overflow such as 2026-02-31.
  if (result.getMonth() !== mo - 1 || result.getDate() !== d) return null;
  return result;
}

/** 320 -> "5 h 20 min", 45 -> "45 min" */
export function formatMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.floor(totalMinutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
