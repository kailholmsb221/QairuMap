/** `20s`, `8000ms`, `2m`, `12` (seconds) → milliseconds. Shared by the kiosk route and hook. */
export function parseDuration(value: string | null | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(value.trim());
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unit = m[2] ?? 's';
  const ms = unit === 'ms' ? n : unit === 'm' ? n * 60_000 : n * 1000;
  return ms > 0 ? ms : fallbackMs;
}
