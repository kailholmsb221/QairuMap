'use client';

import { useEffect } from 'react';
import { createBoundStore } from '@/lib/store/create';
import { METRIC_VARS, metricsFor } from '@/lib/metrics';

export type Metrics = Record<string, number>;

type MetricsState = {
  m: Metrics;
  width: number;
  height: number;
  set: (width: number, height: number) => void;
};

const initial = metricsFor(1920, 1080);

export const useMetricsStore = createBoundStore<MetricsState>((set) => ({
  m: initial,
  width: 1920,
  height: 1080,
  set: (width, height) => set({ m: metricsFor(width, height), width, height }),
}));

/**
 * Applies the `M1080` / `M720` tables to `:root` as CSS variables, and keeps the
 * numeric copy in a store for the few components that need to compute with them.
 * Called once, by `CampusLiveApp`.
 */
export function useViewportMetrics(): void {
  useEffect(() => {
    const apply = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const m = metricsFor(w, h);
      const style = document.documentElement.style;
      for (const [key, cssVar] of Object.entries(METRIC_VARS)) {
        style.setProperty(cssVar, `${m[key]}px`);
      }
      useMetricsStore.getState().set(w, h);
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);
}

/** The current numeric metric table. */
export function useMetrics(): Metrics {
  return useMetricsStore((s) => s.m);
}

/** Viewport size, for the < 1024 px tab layout. */
export function useViewportSize(): { width: number; height: number } {
  const width = useMetricsStore((s) => s.width);
  const height = useMetricsStore((s) => s.height);
  return { width, height };
}
