import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_KEY_STORAGE,
  readStoredKey,
  resolveKey,
  useApiKey,
  writeStoredKey,
} from './useApiKey';

describe('resolveKey', () => {
  it('prefers a pasted key over the build-time one', () => {
    expect(resolveKey('pasted', 'from-env')).toEqual({ key: 'pasted', source: 'stored' });
  });

  it('falls back to the build-time key, then to nothing at all', () => {
    expect(resolveKey('', 'from-env')).toEqual({ key: 'from-env', source: 'env' });
    expect(resolveKey('', '')).toEqual({ key: '', source: 'none' });
  });
});

describe('storage access', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips through localStorage and clears on an empty write', () => {
    writeStoredKey('abc');
    expect(window.localStorage.getItem(ADMIN_KEY_STORAGE)).toBe('abc');
    expect(readStoredKey()).toBe('abc');
    writeStoredKey('');
    expect(readStoredKey()).toBe('');
  });

  it('survives storage that throws — a private window must not break the panel', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readStoredKey()).toBe('');
    expect(() => writeStoredKey('abc')).not.toThrow();
  });
});

describe('useApiKey', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts on the build-time key', () => {
    const { result } = renderHook(() => useApiKey());
    // `NEXT_PUBLIC_ADMIN_API_KEY` is unset under vitest, so there is no key at all
    expect(result.current.source).toBe('none');
    expect(result.current.key).toBe('');
    expect(result.current.rejected).toBe(false);
  });

  it('adopts a pasted key, persists it and clears it again', () => {
    const { result } = renderHook(() => useApiKey());
    act(() => result.current.setKey('  dev-admin-key  '));
    expect(result.current.key).toBe('dev-admin-key');
    expect(result.current.source).toBe('stored');
    expect(window.localStorage.getItem(ADMIN_KEY_STORAGE)).toBe('dev-admin-key');

    act(() => result.current.clear());
    expect(result.current.key).toBe('');
    expect(result.current.source).toBe('none');
    expect(window.localStorage.getItem(ADMIN_KEY_STORAGE)).toBeNull();
  });

  it('reads a key stored by an earlier visit on mount', () => {
    window.localStorage.setItem(ADMIN_KEY_STORAGE, 'stored-key');
    const { result } = renderHook(() => useApiKey());
    expect(result.current.key).toBe('stored-key');
    expect(result.current.source).toBe('stored');
  });

  it('remembers a 401 until a new key is pasted', () => {
    const { result } = renderHook(() => useApiKey());
    act(() => result.current.markRejected());
    expect(result.current.rejected).toBe(true);
    act(() => result.current.markAccepted());
    expect(result.current.rejected).toBe(false);

    act(() => result.current.markRejected());
    act(() => result.current.setKey('another'));
    expect(result.current.rejected).toBe(false);
  });
});
