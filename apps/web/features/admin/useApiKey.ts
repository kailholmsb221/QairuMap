'use client';

import { useCallback, useEffect, useState } from 'react';

/** Where a pasted key is kept between visits. */
export const ADMIN_KEY_STORAGE = 'campuslive.adminKey';

/** Where the key in use came from — the panel says so out loud. */
export type KeySource = 'stored' | 'env' | 'none';

export type ApiKeyState = {
  /** The key to send, or `''` when there is none. */
  key: string;
  source: KeySource;
  /** True once the API answered `401` with this key. */
  rejected: boolean;
  /** Persist a pasted key (empty string clears it and falls back to the build-time one). */
  setKey: (next: string) => void;
  clear: () => void;
  /** Called by the panel when a request came back `401` / succeeded. */
  markRejected: () => void;
  markAccepted: () => void;
};

/** The key baked in at build time, if any. */
export function envKey(): string {
  return process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? '';
}

/** `localStorage` is not available in a private window or a prerender. */
export function readStoredKey(): string {
  try {
    return window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function writeStoredKey(value: string): void {
  try {
    if (value) window.localStorage.setItem(ADMIN_KEY_STORAGE, value);
    else window.localStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    /* storage disabled — the key still works for this page's lifetime */
  }
}

/** The key that is actually sent: a pasted one wins over the build-time default. */
export function resolveKey(stored: string, fromEnv: string): { key: string; source: KeySource } {
  if (stored) return { key: stored, source: 'stored' };
  if (fromEnv) return { key: fromEnv, source: 'env' };
  return { key: '', source: 'none' };
}

/**
 * `X-Api-Key` for the admin panel: `NEXT_PUBLIC_ADMIN_API_KEY` by default, with a
 * pasted key persisted in `localStorage` so the page also works against a
 * deployed API. Reading storage on mount (not during render) keeps the server and
 * the first client frame identical.
 */
export function useApiKey(): ApiKeyState {
  const [stored, setStored] = useState('');
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    setStored(readStoredKey());
  }, []);

  const setKey = useCallback((next: string) => {
    const value = next.trim();
    writeStoredKey(value);
    setStored(value);
    setRejected(false);
  }, []);

  const clear = useCallback(() => setKey(''), [setKey]);

  const { key, source } = resolveKey(stored, envKey());

  return {
    key,
    source,
    rejected,
    setKey,
    clear,
    markRejected: useCallback(() => setRejected(true), []),
    markAccepted: useCallback(() => setRejected(false), []),
  };
}
