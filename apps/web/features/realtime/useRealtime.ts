'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api/client';
import { useBoardStore } from '@/lib/store/boardStore';
import { useTimeStore } from '@/features/time/useNow';
import { SseClient } from './client';

/** No heartbeat for this long and the connection is treated as degraded. */
export const HEARTBEAT_TIMEOUT_MS = 30_000;

/**
 * Wires the SSE stream to `boardStore`:
 *   snapshot → setSnapshot(s, 'sse') · announcement → ticker · heartbeat → touch
 * After a reconnect the board is refetched once so nothing is missed, and more
 * than 30 s without a heartbeat flips the connection dot to amber.
 */
export function useRealtime(building = 'A'): void {
  const lastBeat = useRef<number>(Date.now());
  const probing = useRef(false);

  useEffect(() => {
    const board = useBoardStore.getState();
    const time = useTimeStore.getState();

    const refetchBoard = async () => {
      try {
        const s = await api.board(building);
        if (useBoardStore.getState().mode === 'live') {
          useBoardStore.getState().setSnapshot(s, 'rest');
        } else {
          // keep the live snapshot warm for the LIVE button
          useBoardStore.setState({ lastSse: s });
        }
        useBoardStore.getState().setConnection('online');
        useTimeStore.getState().setServerNow(s.at);
      } catch {
        useBoardStore.getState().setConnection('offline');
      }
    };

    const client = new SseClient(building, {
      onSnapshot: (s) => {
        lastBeat.current = Date.now();
        board.setSnapshot(s, 'sse');
        time.setServerNow(s.at);
        useBoardStore.getState().setConnection('online');
      },
      onAnnouncement: (a) => {
        lastBeat.current = Date.now();
        board.pushAnnouncement(a);
      },
      onHeartbeat: () => {
        lastBeat.current = Date.now();
        if (useBoardStore.getState().connection !== 'online') {
          useBoardStore.getState().setConnection('online');
        }
      },
      onOpen: (reconnected) => {
        lastBeat.current = Date.now();
        useBoardStore.getState().setConnection('online');
        if (reconnected) void refetchBoard();
      },
      onError: (closed) => {
        if (closed) {
          useBoardStore.getState().setConnection('offline');
          return;
        }
        // The browser is retrying the stream. Probe REST once: if that is
        // unreachable too, the API is down rather than the stream flaky.
        useBoardStore.getState().setConnection('reconnecting');
        if (probing.current) return;
        probing.current = true;
        api
          .board(building)
          .then((s) => {
            if (useBoardStore.getState().mode === 'live') {
              useBoardStore.getState().setSnapshot(s, 'rest');
            }
          })
          .catch(() => useBoardStore.getState().setConnection('offline'))
          .finally(() => {
            probing.current = false;
          });
      },
    });

    client.start();

    const watchdog = setInterval(() => {
      const silent = Date.now() - lastBeat.current;
      const state = useBoardStore.getState();
      if (silent > HEARTBEAT_TIMEOUT_MS && state.connection === 'online') {
        state.setConnection('reconnecting');
      }
    }, 5_000);

    return () => {
      clearInterval(watchdog);
      client.stop();
    };
  }, [building]);
}

/**
 * When a countdown reaches zero and no snapshot has landed, ask `/board` once —
 * a lost SSE frame must never leave a stale row on screen.
 */
export function useOptimisticRefetch(building = 'A'): void {
  const inFlight = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      const st = useBoardStore.getState();
      if (st.mode !== 'live' || inFlight.current) return;
      const nextTransition = st.snapshot.nextTransitionAt;
      if (!nextTransition) return;
      const due = new Date(nextTransition).getTime();
      const now = Date.now() + useTimeStore.getState().offsetMs;
      // 2 s of grace: the server pushes on the boundary, this is only the safety net.
      if (now < due + 2000) return;
      inFlight.current = true;
      api
        .board(building)
        .then((s) => {
          if (useBoardStore.getState().mode === 'live') {
            useBoardStore.getState().setSnapshot(s, 'rest');
          }
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight.current = false;
        });
    }, 1000);
    return () => clearInterval(id);
  }, [building]);
}
