import { describe, expect, it } from 'vitest';
import {
  atLocalMinutes,
  deriveProgress,
  formatClock,
  formatCountdown,
  formatDateLine,
  formatHm,
  initialsOf,
  localDate,
  minutesLeft,
  minutesOfDay,
  minutesUntil,
} from './derive';

const TZ = 'Asia/Almaty';
const START = '2026-09-08T05:00:00Z'; // 10:00 local
const END = '2026-09-08T06:50:00Z'; // 11:50 local

describe('deriveProgress', () => {
  it('is 0 before the session starts', () => {
    const p = deriveProgress(START, END, '2026-09-08T04:30:00Z');
    expect(p.pct).toBe(0);
    expect(p.elapsedMin).toBe(0);
    expect(p.leftMin).toBe(140);
  });

  it('is the elapsed fraction in the middle', () => {
    // 10:47 local = 47 of 110 minutes
    const p = deriveProgress(START, END, '2026-09-08T05:47:00Z');
    expect(p.pct).toBeCloseTo(47 / 110, 5);
    expect(p.elapsedMin).toBe(47);
    expect(p.leftMin).toBe(63);
  });

  it('clamps to 1 after the end and never reports negative time left', () => {
    const p = deriveProgress(START, END, '2026-09-08T08:00:00Z');
    expect(p.pct).toBe(1);
    expect(p.leftMs).toBe(0);
    expect(p.leftMin).toBe(0);
  });

  it('handles a zero-length session without dividing by zero', () => {
    const before = deriveProgress(START, START, '2026-09-08T04:00:00Z');
    const after = deriveProgress(START, START, '2026-09-08T06:00:00Z');
    expect(before.pct).toBe(0);
    expect(after.pct).toBe(1);
  });
});

describe('formatCountdown', () => {
  it('rounds minutes up so a boundary is never announced early', () => {
    expect(formatCountdown(61_000)).toBe('2 min');
    expect(formatCountdown(60_000)).toBe('1 min');
  });

  it('formats minutes below an hour', () => {
    expect(formatCountdown(42 * 60_000)).toBe('42 min');
    expect(formatCountdown(59 * 60_000)).toBe('59 min');
  });

  it('switches to hours with zero-padded minutes', () => {
    expect(formatCountdown(60 * 60_000)).toBe('1 h 00');
    expect(formatCountdown(63 * 60_000)).toBe('1 h 03');
    expect(formatCountdown(125 * 60_000)).toBe('2 h 05');
  });

  it('never goes below zero', () => {
    expect(formatCountdown(0)).toBe('0 min');
    expect(formatCountdown(-5000)).toBe('0 min');
    expect(formatCountdown(Number.NaN)).toBe('0 min');
  });
});

describe('countdown helpers', () => {
  it('counts whole minutes to the end and to the start', () => {
    expect(minutesLeft(END, '2026-09-08T05:47:00Z')).toBe(63);
    expect(minutesUntil(START, '2026-09-08T04:56:00Z')).toBe(4);
    expect(minutesUntil(START, '2026-09-08T06:00:00Z')).toBe(0);
  });
});

describe('formatting in the building timezone', () => {
  it('renders the 24-hour clock', () => {
    expect(formatClock('2026-09-08T05:47:32Z', TZ)).toBe('10:47:32');
    expect(formatHm('2026-09-08T05:47:32Z', TZ)).toBe('10:47');
  });

  it('renders the header date line the way the design does', () => {
    expect(formatDateLine('2026-09-08T05:47:00Z', TZ)).toBe('TUE 8 SEP 2026');
  });

  it('resolves the local building date across the UTC day boundary', () => {
    // 20:30 UTC is already the next local day in Almaty (+05:00)
    expect(localDate('2026-09-07T20:30:00Z', TZ)).toBe('2026-09-08');
  });

  it('maps instants to local minutes and back', () => {
    expect(minutesOfDay('2026-09-08T05:47:00Z', TZ)).toBe(647);
    const at14 = atLocalMinutes('2026-09-08T05:47:32Z', TZ, 14 * 60 + 5);
    expect(formatClock(at14, TZ)).toBe('14:05:00');
  });
});

describe('initialsOf', () => {
  it('takes the first letter of each of the first two parts', () => {
    expect(initialsOf('Akhmetov D.')).toBe('AD');
    expect(initialsOf('Nurgaliyeva Aigerim Serikovna')).toBe('NA');
    expect(initialsOf('')).toBe('—');
  });
});
