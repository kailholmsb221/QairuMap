/**
 * The `M1080` / `M720` metric tables from `docs/design/src/ui.mjs`, ported verbatim,
 * plus the rule that maps a viewport onto them:
 *
 *   r = min(w / 1920, h / 1080)
 *   r ≥ 1        → M1080 × r          (2560×1440 = ×1.33, 3840×2160 kiosk = ×2)
 *   2/3 ≤ r < 1  → lerp(M720, M1080)  (1280×720 lands exactly on M720)
 *   r < 2/3      → M720 × (r ÷ 2/3)   (small windows shrink proportionally)
 *
 * The result is written to `:root` as CSS variables — once before first paint by
 * `metricsBootScript()`, then on every resize by `useViewportMetrics()`.
 */

export type MetricKey =
  | 'pad'
  | 'gap'
  | 'headerH'
  | 'tickerH'
  | 'boardW'
  | 'radius'
  | 'clock'
  | 'clockSub'
  | 'brand'
  | 'brandSub'
  | 'tabH'
  | 'tabFont'
  | 'btnH'
  | 'rowH'
  | 'rowTitle'
  | 'rowSub'
  | 'flap'
  | 'flapCell'
  | 'flapH'
  | 'pillFont'
  | 'pillW'
  | 'sectionHead'
  | 'dots'
  | 'boardPad'
  | 'tickerFont'
  | 'legendFont'
  | 'chipFont';

export type MetricTable = Record<MetricKey, number>;

export const M1080: MetricTable = {
  pad: 16,
  gap: 16,
  headerH: 64,
  tickerH: 40,
  boardW: 560,
  radius: 12,
  clock: 44,
  clockSub: 12,
  brand: 17,
  brandSub: 12,
  tabH: 32,
  tabFont: 13,
  btnH: 40,
  rowH: 60,
  rowTitle: 18,
  rowSub: 13,
  flap: 20,
  flapCell: 13,
  flapH: 30,
  pillFont: 12,
  pillW: 96,
  sectionHead: 40,
  dots: 22,
  boardPad: 16,
  tickerFont: 15,
  legendFont: 12,
  chipFont: 13,
};

export const M720: MetricTable = {
  pad: 12,
  gap: 12,
  headerH: 52,
  tickerH: 34,
  boardW: 430,
  radius: 10,
  clock: 30,
  clockSub: 10,
  brand: 14,
  brandSub: 10,
  tabH: 26,
  tabFont: 11,
  btnH: 32,
  rowH: 46,
  rowTitle: 14,
  rowSub: 11,
  flap: 15,
  flapCell: 10,
  flapH: 23,
  pillFont: 10,
  pillW: 80,
  sectionHead: 32,
  dots: 18,
  boardPad: 12,
  tickerFont: 12,
  legendFont: 10,
  chipFont: 11,
};

/** Metric key → CSS custom property, plus three values derived in `ui.mjs`. */
export const METRIC_VARS: Record<string, string> = {
  pad: '--gutter',
  gap: '--gap',
  headerH: '--header-h',
  tickerH: '--ticker-h',
  boardW: '--board-w',
  radius: '--radius',
  clock: '--clock-size',
  clockSub: '--clock-sub',
  brand: '--brand',
  brandSub: '--brand-sub',
  tabH: '--tab-h',
  tabFont: '--tab-font',
  btnH: '--btn-h',
  rowH: '--row-h',
  rowTitle: '--row-title',
  rowSub: '--row-sub',
  flap: '--flap',
  flapCell: '--flap-cell',
  flapH: '--flap-h',
  pillFont: '--pill-font',
  pillW: '--pill-w',
  sectionHead: '--section-head',
  dots: '--dots',
  boardPad: '--board-pad',
  tickerFont: '--ticker-font',
  legendFont: '--legend-font',
  chipFont: '--chip-font',
  // derived, exactly as ui.mjs computes them
  flapW: '--flap-w',
  pillH: '--pill-h',
  rowGap: '--row-gap',
};

/**
 * Self-contained on purpose: `metricsBootScript()` serialises this very function
 * into the pre-paint inline script, so there is a single implementation.
 */
export function computeMetrics(
  w: number,
  h: number,
  big: MetricTable,
  small: MetricTable,
): Record<string, number> {
  const r = Math.min(w / 1920, h / 1080);
  const out: Record<string, number> = {};
  let k: string;
  for (k in big) {
    const a = (big as unknown as Record<string, number>)[k];
    const b = (small as unknown as Record<string, number>)[k];
    let v;
    if (r >= 1) v = a * r;
    else if (r >= 2 / 3) v = b + (a - b) * ((r - 2 / 3) * 3);
    else v = b * (r * 1.5);
    out[k] = Math.round(v * 100) / 100;
  }
  out.flapW = Math.round(out.flap * 0.6) + 2;
  out.pillH = Math.round(out.flapH * 0.93);
  out.rowGap = Math.round(out.rowH * 0.2);
  return out;
}

/** `metricsFor(1920, 1080)` → the M1080 table plus the derived values. */
export function metricsFor(w: number, h: number): Record<string, number> {
  return computeMetrics(w, h, M1080, M720);
}

/** The `<script>` body that sets the metric variables before the first paint. */
export function metricsBootScript(): string {
  return (
    '(function(){var A=' +
    JSON.stringify(M1080) +
    ',B=' +
    JSON.stringify(M720) +
    ',V=' +
    JSON.stringify(METRIC_VARS) +
    ',f=' +
    computeMetrics.toString() +
    ';function apply(){var m=f(window.innerWidth,window.innerHeight,A,B),s=document.documentElement.style,k;' +
    "for(k in V){s.setProperty(V[k],m[k]+'px')}}apply();window.__clMetrics=apply;})()"
  );
}

/** The `<script>` body that restores the persisted theme before the first paint. */
export function themeBootScript(): string {
  return (
    "(function(){try{var t=localStorage.getItem('cl-theme');if(t==='light'||t==='dark')" +
    "document.documentElement.setAttribute('data-theme',t);}catch(e){}" +
    "try{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)" +
    "document.documentElement.setAttribute('data-motion','reduced');}catch(e){}})()"
  );
}
