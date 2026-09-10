import { beforeEach, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import building from '@campuslive/map-data/building-a.json';
import type { MapRoom } from '@campuslive/contracts';
import { RoomShape } from '@/components/map/RoomShape';
import { useUiStore } from '@/lib/store/uiStore';
import { isMapSearchableRoom, isPassiveRoom } from './room-interaction';

beforeEach(() => {
  useUiStore.setState({ selectedRoomCode: null, hoveredRoomCode: null, focusedFloor: null, highlight: null });
});

it.each(['102', '102A', 'CR', 'CINEMA', 'WC-1', 'WC-2'])('%s has no pointer, keyboard, tint or selection overlay', (code) => {
  const room = building.floors[0]!.rooms.find((r) => r.code === code) as MapRoom;
  for (const phase of ['free', 'soon', 'live', 'ending'] as const) {
    expect(renderToStaticMarkup(<RoomShape room={room} phase={phase} mode="focus"
      idPrefix="f1-" maskId="mask" ariaLabel={code} selected dimmed />)).toBe('');
  }
  const ui = useUiStore.getState();
  ui.selectRoom(code);
  ui.hoverRoom(code);
  if (!isMapSearchableRoom(code)) ui.setHighlight({ kind: 'room', id: code });
  ui.showOnMap(1, code);
  expect(useUiStore.getState()).toMatchObject({
    selectedRoomCode: null, hoveredRoomCode: null, highlight: null, focusedFloor: null,
  });
});

it.each(['102', '102A'])('%s can be highlighted by search without becoming a button', (code) => {
  const room = building.floors[0]!.rooms.find((r) => r.code === code) as MapRoom;
  useUiStore.getState().setHighlight({ kind: 'room', id: code });
  expect(useUiStore.getState().highlight).toEqual({ kind: 'room', id: code });
  const markup = renderToStaticMarkup(<RoomShape room={room} phase="free" mode="exploded"
    idPrefix="f1-" maskId="mask" ariaLabel={code} highlighted />);
  expect(markup).toContain(`data-passive-highlight="${code}"`);
  expect(markup).not.toContain('role="button"');
  expect(markup).not.toContain('data-room-tint');
});

it('keeps other rooms and second-floor restrooms interactive', () => {
  for (const code of ['100', '101', '103', 'CAFE', 'WC-N2', 'WC-S2', '226']) {
    expect(isPassiveRoom(code)).toBe(false);
    useUiStore.getState().selectRoom(code);
    expect(useUiStore.getState().selectedRoomCode).toBe(code);
  }
});
