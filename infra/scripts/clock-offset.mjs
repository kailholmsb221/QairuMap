#!/usr/bin/env node
// Prints a Go duration string (e.g. "-3h20m15s") such that
//   time.Now() + CLOCK_OFFSET == the next <weekday> at <HH:MM> local time.
//
// Usage: node clock-offset.mjs [weekday 1..7, 1=Mon] [HH:MM]

const weekday = Number(process.argv[2] ?? 2); // 2 = Tuesday
const [hh, mm] = String(process.argv[3] ?? '10:47')
  .split(':')
  .map(Number);

if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
  console.error('weekday must be an integer 1..7 (1 = Monday)');
  process.exit(1);
}
if (!Number.isInteger(hh) || !Number.isInteger(mm)) {
  console.error('time must be HH:MM');
  process.exit(1);
}

const now = new Date();
const target = new Date(now);
target.setHours(hh, mm, 0, 0);

// JS getDay(): 0 = Sunday. Convert to ISO 1..7 (1 = Monday).
const isoDay = (d) => (d.getDay() === 0 ? 7 : d.getDay());
let delta = (weekday - isoDay(target) + 7) % 7;
if (delta === 0 && target.getTime() <= now.getTime()) delta = 7;
target.setDate(target.getDate() + delta);

let seconds = Math.round((target.getTime() - now.getTime()) / 1000);
const sign = seconds < 0 ? '-' : '';
seconds = Math.abs(seconds);

const h = Math.floor(seconds / 3600);
const m = Math.floor((seconds % 3600) / 60);
const s = seconds % 60;

process.stdout.write(`${sign}${h}h${m}m${s}s`);
