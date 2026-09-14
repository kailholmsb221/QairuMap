'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence } from 'motion/react';
import type { MapRoom, MapSpec, RoomLiveState, Snapshot } from '@campuslive/contracts';
import {
  floorBusyCounts,
  highlightedRooms,
  phasesByFloor,
  type RoomDisplayPhase,
} from '@/features/board/selectors';
import { formatHm } from '@/features/time/derive';
import { useBoardStore } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { listPlaces, placeById, withVectorGeometry } from '@/lib/vector-map';
import { isMapSearchableRoom } from '@/lib/room-interaction';
import {
  eastMost,
  samplePath,
  type ExplodedFit,
  type FocusFit,
} from '@/lib/map-geometry';
import { useRoomName } from '@/features/rooms/useRoomName';
import { IconWarn } from '@/components/chrome/Icons';
import { TimeTravelBar } from '@/components/panels/TimeTravelBar';
import { Legend } from './Legend';
import { RoomTooltip } from './RoomTooltip';
import { Scene } from './Scene';
import { StatsChip } from './StatsChip';

export type MapStageProps = {
  spec: MapSpec;
  tz: string;
  kiosk?: boolean;
  /** After-hours: the building is dim and the entrances are lit. */
  lit?: boolean;
};

export function MapStage({ spec: inputSpec, tz, kiosk = false, lit = false }: MapStageProps) {
  const spec = useMemo(() => withVectorGeometry(inputSpec), [inputSpec]);
  const t = useTranslations('map');
  const roomName = useRoomName();
  const hostRef = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fits, setFits] = useState<{ exploded: ExplodedFit; focus: FocusFit } | null>(null);

  const snapshot = useBoardStore((s) => s.snapshot) as Snapshot;
  const connection = useBoardStore((s) => s.connection);
  const lastUpdateAt = useBoardStore((s) => s.lastUpdateAt);
  const focusedFloor = useUiStore((s) => s.focusedFloor);
  const selectedRoom = useUiStore((s) => s.selectedRoomCode);
  const hoveredRoom = useUiStore((s) => s.hoveredRoomCode);
  const highlight = useUiStore((s) => s.highlight);
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const travelOpen = useUiStore((s) => s.travelOpen);
  const setFocusedFloor = useUiStore((s) => s.setFocusedFloor);
  const selectRoom = useUiStore((s) => s.selectRoom);
  const hoverRoom = useUiStore((s) => s.hoverRoom);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const states = useMemo(() => {
    const out: Record<string, RoomLiveState> = {};
    for (const r of snapshot.rooms) out[r.roomCode] = r;
    return out;
  }, [snapshot.rooms]);

  const phases = useMemo(() => {
    const out: Record<number, Record<string, RoomDisplayPhase>> = {};
    for (const f of spec.floors) out[f.number] = phasesByFloor(snapshot, f.number);
    return out;
  }, [snapshot, spec.floors]);

  /**
   * Every space on the plate, so a hit on one without lessons still resolves —
   * the rooms the API knows and the named places the plan alone draws.
   */
  const roomIndex = useMemo(() => {
    const m = new Map<string, { floor: number; name: string }>();
    for (const f of spec.floors) {
      for (const r of f.rooms) m.set(r.code, { floor: f.number, name: roomName(r.code, r.name) });
    }
    for (const p of listPlaces()) m.set(p.id, { floor: p.floor, name: p.name });
    return m;
  }, [spec.floors, roomName]);

  const badges = useMemo(
    () => Object.fromEntries(Object.entries(highlightedRooms(snapshot, highlight, tz, roomIndex))
      .filter(([code]) => isMapSearchableRoom(code))),
    [snapshot, highlight, tz, roomIndex],
  );
  const highlightSet = useMemo(() => new Set(Object.keys(badges)), [badges]);

  const outline = useMemo(() => samplePath(spec.floors[0]?.outline ?? ''), [spec.floors]);
  const floorNumbers = useMemo(() => spec.floors.map((f) => f.number), [spec.floors]);
  const busyCounts = floorBusyCounts(snapshot.rooms, floorNumbers);

  const label = useCallback(
    (room: MapRoom, state: RoomLiveState | undefined) => {
      const current = state?.current;
      if (current) {
        return t('roomAriaLive', {
          code: room.code,
          name: roomName(room.code, room.name),
          course: `${current.courseCode} ${current.courseTitle}`,
          time: formatHm(current.endAt, tz),
        });
      }
      return room.schedulable
        ? t('roomAriaFree', { code: room.code, name: roomName(room.code, room.name) })
        : t('roomAria', { code: room.code, name: roomName(room.code, room.name) });
    },
    [t, tz, roomName],
  );

  const hoveredRoomSpec = useMemo(() => {
    if (!hoveredRoom) return null;
    for (const f of spec.floors) {
      const hit = f.rooms.find((r) => r.code === hoveredRoom);
      if (hit) return { room: hit, floor: f.number };
    }
    return null;
  }, [hoveredRoom, spec.floors]);

  const tooltipPos = useMemo(() => {
    if (!hoveredRoomSpec || !fits) return null;
    if (focusedFloor != null) {
      const [x, y] = fits.focus.toScreen(hoveredRoomSpec.room.label.x, hoveredRoomSpec.room.label.y);
      return { x, y };
    }
    const idx = spec.floors.findIndex((f) => f.number === hoveredRoomSpec.floor);
    const p = fits.exploded.project(
      hoveredRoomSpec.room.label.x,
      hoveredRoomSpec.room.label.y,
      idx,
    );
    return { x: size.w / 2 + p[0], y: size.h / 2 + p[1] };
  }, [hoveredRoomSpec, fits, focusedFloor, spec.floors, size.w, size.h]);

  const apiDown = connection === 'offline';
  const chipColor = apiDown
    ? 'var(--status-cancelled)'
    : connection === 'reconnecting'
      ? 'var(--status-soon)'
      : undefined;

  return (
    <section
      ref={hostRef}
      data-testid="map-stage"
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius)',
        // the plan is drawn on the authoring tool's own dark ground, in both themes
        background: 'var(--map-bg)',
        border: '1px solid var(--line)',
        minWidth: 0,
        minHeight: 0,
        filter: apiDown ? 'saturate(.35)' : undefined,
      }}
    >
      {size.w > 0 && size.h > 0 ? (
        <>
          <Scene
            spec={spec}
            phases={phases}
            states={states}
            stageWidth={size.w}
            stageHeight={size.h}
            focusedFloor={focusedFloor}
            selectedRoom={selectedRoom}
            hoveredRoom={hoveredRoom}
            highlight={highlightSet}
            lit={lit}
            kiosk={kiosk}
            reducedMotion={reducedMotion}
            travelOpen={travelOpen}
            label={label}
            onSelectRoom={kiosk ? undefined : selectRoom}
            onHoverRoom={kiosk ? undefined : hoverRoom}
            onFits={setFits}
          />

          {/* floor labels — only in the exploded view */}
          {focusedFloor == null && fits
            ? spec.floors.map((f, i) => {
                const [px, py] = eastMost(outline, fits.exploded.project, i);
                return (
                  <button
                    key={f.number}
                    type="button"
                    className="mono"
                    data-testid={`floor-label-${f.number}`}
                    onClick={kiosk ? undefined : () => setFocusedFloor(f.number)}
                    style={{
                      position: 'absolute',
                      left: Math.round(size.w / 2 + px + 18),
                      top: Math.round(size.h / 2 + py - 11),
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 'calc(var(--legend-font) + 1px)',
                      color: 'var(--text-dim)',
                      whiteSpace: 'nowrap',
                      opacity: highlight ? 0.5 : 1,
                      cursor: kiosk ? 'default' : 'pointer',
                    }}
                  >
                    <span
                      style={{ width: 14, height: 1, background: 'rgba(255,255,255,.25)' }}
                    />
                    <span style={{ fontWeight: 800, color: 'var(--text)' }}>F{f.number}</span>
                    <span>· {t('busy', { n: busyCounts[i + 1] ?? 0 })}</span>
                  </button>
                );
              })
            : null}

          {/* search badges */}
          {fits
            ? Object.entries(badges).map(([code, info]) => {
                const idx = spec.floors.findIndex((f) => f.number === info.floor);
                const room = spec.floors[idx]?.rooms.find((r) => r.code === code);
                const place = room ? null : placeById(code);
                const anchor = room?.label ?? place?.label;
                if (!anchor) return null;
                if (focusedFloor != null && info.floor !== focusedFloor) return null;
                const p = focusedFloor == null
                  ? fits.exploded.project(anchor.x, anchor.y, idx)
                  : fits.focus.toScreen(anchor.x, anchor.y);
                const badgeX = focusedFloor == null ? size.w / 2 + p[0] : p[0];
                const badgeY = focusedFloor == null ? size.h / 2 + p[1] : p[1];
                return (
                  <div
                    key={code}
                    data-testid={`map-badge-${code}`}
                    style={{
                      position: 'absolute',
                      left: Math.round(badgeX),
                      top: Math.round(badgeY),
                      transform: 'translate(-50%,-100%)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        borderRadius: 7,
                        background: 'rgba(11,15,23,.92)',
                        border: '1px solid color-mix(in srgb, var(--accent) 55%, transparent)',
                        boxShadow: '0 8px 24px rgba(0,0,0,.45)',
                      }}
                    >
                      <span
                        className="mono"
                        style={{
                          fontSize: 'calc(var(--legend-font) + 2px)',
                          fontWeight: 800,
                          color: 'var(--text)',
                        }}
                      >
                        {place ? place.name : code}
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: 'var(--legend-font)',
                          fontWeight: 700,
                          letterSpacing: '.1em',
                          color:
                            info.kind === 'now'
                              ? 'var(--status-live)'
                              : info.kind === 'room'
                                ? 'var(--accent)'
                                : 'var(--status-soon)',
                        }}
                      >
                        {info.label}
                      </span>
                      {place ? null : (
                        <span style={{ fontSize: 'var(--legend-font)', color: 'var(--text-dim)' }}>
                          {info.sub}
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        width: 1,
                        height: 26,
                        background: 'color-mix(in srgb, var(--accent) 60%, transparent)',
                      }}
                    />
                  </div>
                );
              })
            : null}

          <AnimatePresence>
            {hoveredRoomSpec && tooltipPos ? (
              <RoomTooltip
                key={hoveredRoomSpec.room.code}
                room={hoveredRoomSpec.room}
                state={states[hoveredRoomSpec.room.code]}
                tz={tz}
                x={tooltipPos.x}
                y={tooltipPos.y}
              />
            ) : null}
          </AnimatePresence>
        </>
      ) : null}

      {/* caption */}
      <div
        style={{
          position: 'absolute',
          left: 14,
          top: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          borderRadius: 9,
          background: 'rgba(11,15,23,.72)',
          border: '1px solid var(--line)',
          pointerEvents: 'none',
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: focusedFloor ? 'calc(var(--chip-font) + 3px)' : 'calc(var(--chip-font) + 1px)',
            fontWeight: 800,
          }}
        >
          {focusedFloor ? t('floor', { n: focusedFloor }) : t('allFloors')}
        </span>
        <span style={{ fontSize: 'var(--chip-font)', color: 'var(--text-dim)' }}>
          {focusedFloor
            ? t(`floorSub.${focusedFloor}` as 'floorSub.1')
            : t('explodedHint')}
        </span>
        {focusedFloor && !kiosk ? (
          <span
            className="mono"
            style={{
              fontSize: 'calc(var(--legend-font) - 1px)',
              color: 'var(--text-dim)',
              padding: '2px 6px',
              borderRadius: 5,
              border: '1px solid var(--line)',
            }}
          >
            {t('escHint')}
          </span>
        ) : null}
      </div>

      {apiDown ? (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 14,
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 12px',
            borderRadius: 8,
            background: 'color-mix(in srgb, var(--status-cancelled) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--status-cancelled) 45%, transparent)',
            color: 'var(--status-cancelled)',
          }}
        >
          <IconWarn size={14} />
          <span
            className="mono"
            style={{ fontSize: 'var(--legend-font)', fontWeight: 700, letterSpacing: '.1em' }}
          >
            {t('lastKnown', {
              time: lastUpdateAt
                ? new Date(lastUpdateAt).toLocaleTimeString('en-GB', { timeZone: tz })
                : '—',
            })}
          </span>
        </div>
      ) : null}

      {travelOpen ? null : <Legend />}
      <StatsChip
        busy={snapshot.stats.roomsBusy}
        total={snapshot.stats.roomsTotal}
        color={chipColor}
      />
      {kiosk ? null : <TimeTravelBar tz={tz} />}
    </section>
  );
}
