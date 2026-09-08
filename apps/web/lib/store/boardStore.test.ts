import { beforeEach, describe, expect, it } from 'vitest';
import { emptySnapshot, useBoardStore } from './boardStore';
import { session, snapshot } from '@/test/fixtures';

const reset = () =>
  useBoardStore.setState({
    mode: 'live',
    snapshot: emptySnapshot(),
    travelAt: null,
    connection: 'online',
    lastSse: null,
    lastUpdateAt: 0,
    apiDown: false,
    announcements: [],
  });

describe('boardStore.setSnapshot', () => {
  beforeEach(reset);

  it('applies an SSE snapshot in live mode', () => {
    const s = snapshot();
    useBoardStore.getState().setSnapshot(s, 'sse');
    expect(useBoardStore.getState().snapshot).toBe(s);
    expect(useBoardStore.getState().lastSse).toBe(s);
    expect(useBoardStore.getState().lastUpdateAt).toBeGreaterThan(0);
  });

  it('ignores SSE snapshots while travelling, but keeps the live one warm', () => {
    const travelled = snapshot({ at: '2026-09-08T09:05:00Z', now: [] });
    useBoardStore.getState().setTravelAt('2026-09-08T09:05:00Z');
    useBoardStore.getState().setSnapshot(travelled, 'rest');
    expect(useBoardStore.getState().mode).toBe('travel');

    const live = snapshot({ at: '2026-09-08T05:52:00Z' });
    useBoardStore.getState().setSnapshot(live, 'sse');

    expect(useBoardStore.getState().snapshot).toBe(travelled);
    expect(useBoardStore.getState().lastSse).toBe(live);
  });

  it('always applies a REST snapshot — that is how travel and refetch land', () => {
    const s = snapshot();
    useBoardStore.getState().setTravelAt('2026-09-08T09:05:00Z');
    useBoardStore.getState().setSnapshot(s, 'rest');
    expect(useBoardStore.getState().snapshot).toBe(s);
  });

  it('clears the API-down flag when data arrives again', () => {
    useBoardStore.getState().setApiDown(true);
    useBoardStore.getState().setSnapshot(snapshot(), 'rest');
    expect(useBoardStore.getState().apiDown).toBe(false);
  });
});

describe('boardStore.goLive', () => {
  beforeEach(reset);

  it('re-applies the last SSE snapshot and leaves travel mode', () => {
    const live = snapshot({ at: '2026-09-08T05:52:00Z' });
    useBoardStore.getState().setSnapshot(live, 'sse');
    useBoardStore.getState().setTravelAt('2026-09-08T09:05:00Z');
    useBoardStore.getState().setSnapshot(snapshot({ now: [] }), 'rest');

    useBoardStore.getState().goLive();

    expect(useBoardStore.getState().mode).toBe('live');
    expect(useBoardStore.getState().travelAt).toBeNull();
    expect(useBoardStore.getState().snapshot).toBe(live);
  });

  it('keeps the current snapshot when no SSE frame ever arrived', () => {
    const rest = snapshot();
    useBoardStore.getState().setTravelAt('2026-09-08T09:05:00Z');
    useBoardStore.getState().setSnapshot(rest, 'rest');
    useBoardStore.getState().goLive();
    expect(useBoardStore.getState().snapshot).toBe(rest);
  });
});

describe('boardStore.pushAnnouncement', () => {
  beforeEach(reset);

  it('prepends, de-duplicates by id and caps the list', () => {
    const make = (id: string) => ({
      id,
      building: 'A',
      text: `line ${id}`,
      severity: 'info' as const,
      startsAt: '2026-09-08T05:00:00Z',
      endsAt: '2026-09-08T06:00:00Z',
    });
    for (let i = 0; i < 15; i++) useBoardStore.getState().pushAnnouncement(make(`a${i}`));
    useBoardStore.getState().pushAnnouncement(make('a0'));

    const list = useBoardStore.getState().announcements;
    expect(list.length).toBe(12);
    expect(list[0]?.id).toBe('a0');
    expect(list.filter((a) => a.id === 'a0').length).toBe(1);
  });
});

describe('boardStore travel mode', () => {
  beforeEach(reset);

  it('setTravelAt(null) returns to live mode', () => {
    useBoardStore.getState().setTravelAt('2026-09-08T09:05:00Z');
    expect(useBoardStore.getState().mode).toBe('travel');
    useBoardStore.getState().setTravelAt(null);
    expect(useBoardStore.getState().mode).toBe('live');
  });

  it('keeps sessions the server sent verbatim', () => {
    const s = snapshot({ now: [session({ sessionId: 'x', phase: 'ending' })] });
    useBoardStore.getState().setSnapshot(s, 'sse');
    expect(useBoardStore.getState().snapshot.now[0]?.phase).toBe('ending');
  });
});
