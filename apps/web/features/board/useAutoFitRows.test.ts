import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { splitRows, useAutoFitRows } from './useAutoFitRows';

type Cb = (entries: { contentRect: { height: number }; target: Element }[]) => void;

let observers: { cb: Cb; targets: Element[] }[] = [];

class MockResizeObserver {
  private entry: { cb: Cb; targets: Element[] };
  constructor(cb: Cb) {
    this.entry = { cb, targets: [] };
    observers.push(this.entry);
  }
  observe(el: Element) {
    this.entry.targets.push(el);
  }
  unobserve() {}
  disconnect() {
    observers = observers.filter((o) => o !== this.entry);
  }
}

function resizeTo(height: number) {
  for (const o of observers) {
    for (const target of o.targets) {
      o.cb([{ contentRect: { height }, target }]);
    }
  }
}

function elementOfHeight(height: number): HTMLElement {
  const el = document.createElement('div');
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ height } as DOMRect);
  return el;
}

describe('useAutoFitRows', () => {
  beforeEach(() => {
    observers = [];
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('measures on mount and divides by the row height', () => {
    const ref = { current: elementOfHeight(620) };
    const { result } = renderHook(() => useAutoFitRows(ref, 60));
    expect(result.current).toBe(10);
  });

  it('subtracts the section chrome before dividing', () => {
    const ref = { current: elementOfHeight(620) };
    const { result } = renderHook(() => useAutoFitRows(ref, 60, 2, 140));
    expect(result.current).toBe(8);
  });

  it('recomputes when the ResizeObserver fires', () => {
    const ref = { current: elementOfHeight(620) };
    const { result } = renderHook(() => useAutoFitRows(ref, 60));
    act(() => resizeTo(300));
    expect(result.current).toBe(5);
    act(() => resizeTo(1200));
    expect(result.current).toBe(20);
  });

  it('never returns fewer rows than the minimum', () => {
    const ref = { current: elementOfHeight(10) };
    const { result } = renderHook(() => useAutoFitRows(ref, 60, 2));
    expect(result.current).toBe(2);
  });

  it('disconnects the observer on unmount', () => {
    const ref = { current: elementOfHeight(620) };
    const { unmount } = renderHook(() => useAutoFitRows(ref, 60));
    expect(observers.length).toBe(1);
    unmount();
    expect(observers.length).toBe(0);
  });
});

describe('splitRows', () => {
  it('uses the design 7:5 split when both sections overflow', () => {
    expect(splitRows(12, 28, 14)).toEqual([7, 5]);
  });

  it('gives everything away when both sections fit', () => {
    expect(splitRows(12, 3, 4)).toEqual([3, 9]);
  });

  it('hands the surplus of a short section to the other', () => {
    expect(splitRows(12, 2, 40)).toEqual([2, 10]);
    expect(splitRows(12, 40, 1)).toEqual([11, 1]);
  });

  it('is safe at zero height', () => {
    expect(splitRows(0, 5, 5)).toEqual([0, 0]);
  });
});
