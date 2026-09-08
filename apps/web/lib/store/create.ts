'use client';

import { useSyncExternalStore } from 'react';
import { createStore, type StateCreator, type StoreApi } from 'zustand';

export type BoundStore<T> = (<U>(selector: (state: T) => U) => U) & StoreApi<T>;

/**
 * `create()` from zustand v5 resolves the *server* snapshot through
 * `getInitialState()`, so a store seeded during the render pass (which is exactly
 * how the RSC snapshot reaches the client tree) renders empty on the server and
 * full on the client. This factory reads `getState()` on both sides, so the
 * server-rendered board is the live one and hydration matches byte for byte.
 *
 * Selectors must return primitives or references the store already holds —
 * never a freshly built object — as `useSyncExternalStore` requires.
 */
export function createBoundStore<T>(initializer: StateCreator<T>): BoundStore<T> {
  const store = createStore<T>()(initializer);
  const useBoundStore = <U,>(selector: (state: T) => U): U =>
    useSyncExternalStore(
      store.subscribe,
      () => selector(store.getState()),
      () => selector(store.getState()),
    );
  return Object.assign(useBoundStore, store) as BoundStore<T>;
}
