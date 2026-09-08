/**
 * Cosmetics only. The Go engine owns every phase decision; the client derives
 * nothing but progress percentages and countdown strings from absolute instants.
 */

export type Progress = {
  /** 0…1, clamped. */
  pct: number;
  elapsedMs: number;
  leftMs: number;
  totalMs: number;
  elapsedMin: number;
  leftMin: number;
};

const ms = (v: string | number | Date): number =>
  typeof v === 'number' ? v : new Date(v).getTime();

/** Progress of a session between `startAt` and `endAt` at `now`. */
export function deriveProgress(
  startAt: string | number | Date,
  endAt: string | number | Date,
  now: string | number | Date,
): Progress {
  const s = ms(startAt);
  const e = ms(endAt);
  const n = ms(now);
  const totalMs = Math.max(0, e - s);
  const elapsedMs = Math.min(Math.max(0, n - s), totalMs);
  const leftMs = Math.max(0, e - n);
  const pct = totalMs === 0 ? (n >= e ? 1 : 0) : elapsedMs / totalMs;
  return {
    pct: Math.min(1, Math.max(0, pct)),
    elapsedMs,
    leftMs,
    totalMs,
    elapsedMin: Math.floor(elapsedMs / 60000),
    leftMin: Math.ceil(leftMs / 60000),
  };
}

/**
 * `1_500_000` → `"25 min"`, `4_500_000` → `"1 h 15"`, anything ≤ 0 → `"0 min"`.
 * Minutes round up, so "1 min" stays on screen until the boundary is actually crossed.
 */
export function formatCountdown(msLeft: number): string {
  if (!Number.isFinite(msLeft) || msLeft <= 0) return '0 min';
  const minutes = Math.ceil(msLeft / 60000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

/** Whole minutes remaining, rounded up — what the status pills count down. */
export function minutesLeft(endAt: string | number | Date, now: string | number | Date): number {
  return Math.max(0, Math.ceil((ms(endAt) - ms(now)) / 60000));
}

/** Whole minutes until a start, rounded up. */
export function minutesUntil(startAt: string | number | Date, now: string | number | Date): number {
  return Math.max(0, Math.ceil((ms(startAt) - ms(now)) / 60000));
}

/* ------------------------------------------------------------- formatting -- */

const clockCache = new Map<string, Intl.DateTimeFormat>();

function fmt(
  tz: string,
  opts: Intl.DateTimeFormatOptions,
  key: string,
  locale = 'en-GB',
): Intl.DateTimeFormat {
  const k = `${locale}|${tz}|${key}`;
  let f = clockCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts });
    clockCache.set(k, f);
  }
  return f;
}

/** `10:47:32` in the building's timezone. */
export function formatClock(at: string | number | Date, tz: string, seconds = true): string {
  return fmt(
    tz,
    { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hour12: false },
    seconds ? 'hms' : 'hm',
  ).format(ms(at));
}

/** `10:47` in the building's timezone — the board's time column. */
export function formatHm(at: string | number | Date, tz: string): string {
  return formatClock(at, tz, false);
}

/** `TUE 8 SEP 2026`, upper-cased, in the building's timezone. */
export function formatDateLine(at: string | number | Date, tz: string): string {
  // en-US, not en-GB: the design's header reads `TUE 8 SEP 2026`, not `SEPT`.
  const parts = fmt(
    tz,
    { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
    'date',
    'en-US',
  ).formatToParts(ms(at));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')} ${get('year')}`.toUpperCase();
}

/** `2026-09-08` — the local building date, the format every `?date=` expects. */
export function localDate(at: string | number | Date, tz: string): string {
  const parts = fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }, 'ymd').formatToParts(
    ms(at),
  );
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Minutes since local midnight in the building's timezone. */
export function minutesOfDay(at: string | number | Date, tz: string): number {
  const [h, m] = formatClock(at, tz, false).split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * The instant of local `minutes`-of-day on the same local day as `at`, in epoch ms.
 * Derived by shifting `at`, so no timezone-offset table is needed on the client.
 */
export function atLocalMinutes(at: string | number | Date, tz: string, minutes: number): number {
  const base = ms(at);
  const current = minutesOfDay(base, tz);
  const d = new Date(base);
  const subMinute = d.getUTCSeconds() * 1000 + d.getUTCMilliseconds();
  return base + (minutes - current) * 60000 - subMinute;
}

/** Initials for the teacher avatar: `Akhmetov D.` → `AD`. */
export function initialsOf(name: string): string {
  const parts = name.replace(/\./g, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  return (first + second).toUpperCase();
}
