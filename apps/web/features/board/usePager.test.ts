import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePager } from './usePager';

const items = Array.from({ length: 11 }, (_, i) => `item-${i}`);

describe('usePager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('slices the current page', () => {
    const { result } = renderHook(() => usePager(items, 4, 8000, true));
    expect(result.current.pages).toBe(3);
    expect(result.current.page).toBe(0);
    expect(result.current.items).toEqual(['item-0', 'item-1', 'item-2', 'item-3']);
  });

  it('rotates every interval and wraps around', () => {
    const { result } = renderHook(() => usePager(items, 4, 8000, false));
    act(() => void vi.advanceTimersByTime(8000));
    expect(result.current.page).toBe(1);
    expect(result.current.items).toEqual(['item-4', 'item-5', 'item-6', 'item-7']);

    act(() => void vi.advanceTimersByTime(8000));
    expect(result.current.page).toBe(2);
    expect(result.current.items).toEqual(['item-8', 'item-9', 'item-10']);

    act(() => void vi.advanceTimersByTime(8000));
    expect(result.current.page).toBe(0);
  });

  it('does not rotate while paused', () => {
    const { result } = renderHook(() => usePager(items, 4, 8000, true));
    act(() => void vi.advanceTimersByTime(40_000));
    expect(result.current.page).toBe(0);
  });

  it('does not rotate when everything fits on one page', () => {
    const { result } = renderHook(() => usePager(items.slice(0, 3), 4, 8000, false));
    expect(result.current.pages).toBe(1);
    act(() => void vi.advanceTimersByTime(40_000));
    expect(result.current.page).toBe(0);
  });

  it('falls back to the first page when the list shrinks', () => {
    const { result, rerender } = renderHook(
      ({ list }: { list: string[] }) => usePager(list, 4, 8000, false),
      { initialProps: { list: items } },
    );
    act(() => void vi.advanceTimersByTime(16_000));
    expect(result.current.page).toBe(2);

    rerender({ list: items.slice(0, 3) });
    expect(result.current.page).toBe(0);
    expect(result.current.items).toEqual(['item-0', 'item-1', 'item-2']);
  });
});
