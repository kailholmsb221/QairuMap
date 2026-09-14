'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import type { MapSpec, SessionView } from '@campuslive/contracts';
import { api } from '@/lib/api/client';
import { useBoardStore } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { deriveProgress, formatCountdown, formatHm, initialsOf } from '@/features/time/derive';
import { useNow } from '@/features/time/useNow';
import { IconClock, IconClose, IconMap } from '@/components/chrome/Icons';
import { IconButton } from '@/components/chrome/IconButton';
import { SplitFlap } from '@/components/board/SplitFlap';
import { StatusPill } from '@/components/board/StatusPill';
import { roomNames } from '@/features/rooms/roomNames';

function SessionRow({ s, tz, last }: { s: SessionView; tz: string; last: boolean }) {
  const tm = useTranslations('map');
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 0',
        borderBottom: `1px solid ${last ? 'transparent' : 'var(--line)'}`,
      }}
    >
      <SplitFlap value={formatHm(s.startAt, tz)} cellWidth={11} height={22} fontSize={13} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <span
          style={{
            fontSize: 'calc(var(--legend-font) + 2px)',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textDecoration: s.status === 'cancelled' ? 'line-through' : undefined,
            color: s.status === 'cancelled' ? 'var(--text-dim)' : undefined,
          }}
        >
          <span className="mono" style={{ color: 'var(--text-dim)', marginRight: 6 }}>
            {s.courseCode}
          </span>
          {s.courseTitle}
        </span>
        <span className="mono" style={{ fontSize: 'var(--legend-font)', color: 'var(--text-dim)' }}>
          {s.teacher.shortName} · {s.groups.join(', ')} ·{' '}
          {tm('until', { time: formatHm(s.endAt, tz) })}
        </span>
      </div>
    </div>
  );
}

export function RoomDetailPanel({ spec, tz }: { spec: MapSpec; tz: string }) {
  const t = useTranslations('detail');
  const code = useUiStore((s) => s.selectedRoomCode);
  const selectRoom = useUiStore((s) => s.selectRoom);
  const showOnMap = useUiStore((s) => s.showOnMap);
  const rooms = useBoardStore((s) => s.snapshot.rooms);
  const date = useBoardStore((s) => s.snapshot.date);
  const now = useNow();
  const [fullDay, setFullDay] = useState(false);

  const found = useMemo(() => {
    if (!code) return null;
    for (const f of spec.floors) {
      const room = f.rooms.find((r) => r.code === code);
      if (room) return { room, floor: f.number };
    }
    return null;
  }, [code, spec.floors]);

  const state = rooms.find((r) => r.roomCode === code);

  const { data: day } = useQuery({
    queryKey: ['room-day', code, date],
    queryFn: () => api.roomDay(code as string, date),
    enabled: !!code,
    staleTime: 60_000,
  });

  const upcoming = useMemo(() => {
    const list = (day?.sessions ?? []).filter(
      (s) => new Date(s.endAt).getTime() > (now || Date.now()),
    );
    const withoutCurrent = list.filter((s) => s.sessionId !== state?.current?.sessionId);
    return fullDay ? withoutCurrent : withoutCurrent.slice(0, 3);
  }, [day, now, state, fullDay]);

  return (
    <AnimatePresence>
      {found ? (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => selectRoom(null)}
            style={{
              position: 'absolute',
              right: 'var(--gutter)',
              top: 'calc(var(--gutter) + var(--header-h) + var(--gap))',
              bottom: 'calc(var(--gutter) + var(--ticker-h) + var(--gap))',
              width: 'var(--board-w)',
              borderRadius: 'var(--radius)',
              background: 'rgba(11,15,23,.55)',
              zIndex: 40,
            }}
          />
          <motion.aside
            key="panel"
            data-testid="room-detail"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'absolute',
              right: 'var(--gutter)',
              top: 'calc(var(--gutter) + var(--header-h) + var(--gap))',
              bottom: 'calc(var(--gutter) + var(--ticker-h) + var(--gap))',
              width: 'min(420px, var(--board-w))',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              padding: '22px 22px 18px',
              borderRadius: 'var(--radius)',
              background: 'rgba(17,24,38,.94)',
              backdropFilter: 'blur(14px)',
              border: '1px solid rgba(255,255,255,.12)',
              boxShadow: '-24px 0 60px rgba(0,0,0,.5)',
              zIndex: 50,
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span
                    className="mono"
                    style={{
                      fontSize: 'calc(var(--legend-font) * 2.5)',
                      fontWeight: 800,
                      letterSpacing: '-.01em',
                    }}
                  >
                    {found.room.code}
                  </span>
                  <span
                    style={{
                      fontSize: 'calc(var(--legend-font) + 4px)',
                      fontWeight: 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {roomNames(found.room.code, found.room.name).kk}
                  </span>
                </div>
                {roomNames(found.room.code).en && roomNames(found.room.code).en !== roomNames(found.room.code).kk ? (
                  <span
                    data-testid="room-detail-name-en"
                    style={{ fontSize: 'calc(var(--legend-font) + 2px)', fontWeight: 600, color: 'var(--text-dim)' }}
                  >
                    {roomNames(found.room.code).en}
                  </span>
                ) : null}
                <span
                  style={{ fontSize: 'calc(var(--legend-font) + 1px)', color: 'var(--text-dim)' }}
                >
                  {t('meta', {
                    type: t(`type.${found.room.type}` as 'type.lecture'),
                    capacity: found.room.capacity
                      ? t('capacity', { n: found.room.capacity })
                      : '—',
                    floor: found.floor,
                    wing: t(`wing.${found.room.wing}` as 'wing.north'),
                  })}
                </span>
              </div>
              <IconButton label={t('close')} size={34} onClick={() => selectRoom(null)}>
                <IconClose size={16} />
              </IconButton>
            </div>

            {state?.current ? (
              <NowBlock session={state.current} tz={tz} now={now} />
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: 16,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,.04)',
                  border: '1px solid var(--line)',
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 'var(--legend-font)',
                    fontWeight: 800,
                    letterSpacing: '.14em',
                    color: 'var(--text-dim)',
                  }}
                >
                  {t('free')}
                </span>
                <span style={{ fontSize: 'calc(var(--legend-font) + 2px)' }}>
                  {state?.next
                    ? t('freeUntil', { time: formatHm(state.next.startAt, tz) })
                    : t('nothingLeft')}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  paddingBottom: 6,
                  borderBottom: '1px solid rgba(94,234,212,.4)',
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 'var(--legend-font)',
                    fontWeight: 800,
                    letterSpacing: '.14em',
                    color: 'var(--accent)',
                  }}
                >
                  {t('nextInRoom')}
                </span>
                <span
                  className="mono"
                  style={{ fontSize: 'var(--legend-font)', color: 'var(--text-dim)' }}
                >
                  {t('today')}
                </span>
              </div>
              <div className="no-scrollbar" style={{ overflowY: 'auto', minHeight: 0 }}>
                {upcoming.length ? (
                  upcoming.map((s, i) => (
                    <SessionRow
                      key={s.sessionId}
                      s={s}
                      tz={tz}
                      last={i === upcoming.length - 1}
                    />
                  ))
                ) : (
                  <div
                    style={{
                      padding: '14px 0',
                      fontSize: 'calc(var(--legend-font) + 1px)',
                      color: 'var(--text-dim)',
                    }}
                  >
                    {t('nothingLeft')}
                  </div>
                )}
              </div>
            </div>

            <div style={{ flex: 1 }} />

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                data-testid="show-on-map"
                onClick={() => showOnMap(found.floor, found.room.code)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  height: 'var(--btn-h)',
                  borderRadius: 9,
                  background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
                  color: 'var(--accent)',
                }}
              >
                <IconMap size={16} />
                <span style={{ fontSize: 'calc(var(--legend-font) + 1px)', fontWeight: 700 }}>
                  {t('showOnMap')}
                </span>
              </button>
              <button
                type="button"
                aria-pressed={fullDay}
                onClick={() => setFullDay((v) => !v)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  height: 'var(--btn-h)',
                  borderRadius: 9,
                  background: fullDay ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.04)',
                  border: '1px solid var(--line)',
                  color: 'var(--text)',
                }}
              >
                <IconClock size={16} />
                <span style={{ fontSize: 'calc(var(--legend-font) + 1px)', fontWeight: 700 }}>
                  {t('fullDay')}
                </span>
              </button>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function NowBlock({ session, tz, now }: { session: SessionView; tz: string; now: number }) {
  const t = useTranslations('detail');
  const tp = useTranslations('pill');
  const p = deriveProgress(session.startAt, session.endAt, now || session.startAt);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        borderRadius: 10,
        background: 'rgba(45,212,191,.07)',
        border: '1px solid rgba(45,212,191,.28)',
        flex: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          className="mono"
          style={{
            fontSize: 'var(--legend-font)',
            fontWeight: 800,
            letterSpacing: '.14em',
            color: 'var(--status-live)',
          }}
        >
          {t('now', { type: t(`lessonType.${session.lessonType}` as 'lessonType.lecture') })}
        </span>
        <StatusPill kind="live" label={tp('live')} minWidth={64} height={24} fontSize={11} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span
          style={{
            fontSize: 'calc(var(--legend-font) + 8px)',
            fontWeight: 800,
            letterSpacing: '-.01em',
          }}
        >
          <span
            className="mono"
            style={{
              color: 'var(--text-dim)',
              fontWeight: 600,
              marginRight: 8,
              fontSize: 'calc(var(--legend-font) + 4px)',
            }}
          >
            {session.courseCode}
          </span>
          {session.courseTitle}
        </span>
        <span
          className="mono"
          style={{ fontSize: 'calc(var(--legend-font) + 1px)', color: 'var(--text-dim)' }}
        >
          {formatHm(session.startAt, tz)} – {formatHm(session.endAt, tz)} ·{' '}
          {session.groups.join(', ')}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="mono" style={{ fontSize: 'var(--legend-font)', color: 'var(--text-dim)' }}>
            {t('elapsed', { n: p.elapsedMin, pct: Math.round(p.pct * 100) })}
          </span>
          <span
            className="mono"
            style={{
              fontSize: 'var(--legend-font)',
              fontWeight: 700,
              color: 'var(--status-live)',
            }}
          >
            {t('left', { countdown: formatCountdown(p.leftMs) })}
          </span>
        </div>
        <div
          style={{
            height: 6,
            borderRadius: 99,
            background: 'rgba(255,255,255,.1)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.round(p.pct * 100)}%`,
              height: '100%',
              borderRadius: 99,
              background: 'var(--status-live)',
              transition: 'width 1s linear',
            }}
          />
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          paddingTop: 10,
          borderTop: '1px solid rgba(45,212,191,.2)',
        }}
      >
        <span
          className="mono"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 99,
            background: 'rgba(255,255,255,.08)',
            fontSize: 'var(--legend-font)',
            fontWeight: 800,
            color: 'var(--text)',
            flex: 'none',
          }}
        >
          {initialsOf(session.teacher.shortName)}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 'calc(var(--legend-font) + 2px)', fontWeight: 700 }}>
            {session.teacher.fullName ?? session.teacher.shortName}
          </span>
          <span style={{ fontSize: 'var(--legend-font)', color: 'var(--text-dim)' }}>
            {session.teacher.department ?? ''}
          </span>
        </div>
      </div>
    </div>
  );
}
