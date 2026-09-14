'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'motion/react';
import type { MapRoom, RoomLiveState } from '@campuslive/contracts';
import { formatHm } from '@/features/time/derive';
import { bilingualRoomName } from '@/features/rooms/roomNames';

export type RoomTooltipProps = {
  room: MapRoom;
  state?: RoomLiveState;
  tz: string;
  /** Position inside the stage, in px. */
  x: number;
  y: number;
};

/** `tooltip()` — 260 px card that follows the hovered room. */
export function RoomTooltip({ room, state, tz, x, y }: RoomTooltipProps) {
  const t = useTranslations('map');
  const td = useTranslations('detail');
  const current = state?.current;
  const upcoming = state?.next;

  return (
    <motion.div
      data-testid="room-tooltip"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, calc(-100% - 14px))',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '10px 12px',
        borderRadius: 8,
        background: 'rgba(11,15,23,.94)',
        border: '1px solid var(--line)',
        boxShadow: '0 10px 30px rgba(0,0,0,.5)',
        width: 260,
        pointerEvents: 'none',
        zIndex: 30,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          className="mono"
          style={{ fontSize: 'calc(var(--legend-font) + 3px)', fontWeight: 800 }}
        >
          {room.code}
        </span>
        <span
          style={{
            fontSize: 'calc(var(--legend-font) + 1px)',
            color: 'var(--text-dim)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {bilingualRoomName(room.code, room.name)}
          {room.capacity ? ` · ${td('capacity', { n: room.capacity })}` : ''}
        </span>
      </div>

      {current ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background:
                  state?.phase === 'ending' ? 'var(--status-ending)' : 'var(--status-live)',
                flex: 'none',
              }}
            />
            <span style={{ fontSize: 'calc(var(--legend-font) + 1px)', fontWeight: 700 }}>
              {current.courseCode} {current.courseTitle}
            </span>
            <span
              className="mono"
              style={{
                fontSize: 'var(--legend-font)',
                color: state?.phase === 'ending' ? 'var(--status-ending)' : 'var(--status-live)',
              }}
            >
              {t('until', { time: formatHm(current.endAt, tz) })}
            </span>
          </div>
          <div style={{ fontSize: 'var(--legend-font)', color: 'var(--text-dim)' }}>
            {current.teacher.shortName} · {current.groups.join(', ')}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 'var(--legend-font)', color: 'var(--text-dim)' }}>
          {upcoming
            ? t('freeNext', { time: formatHm(upcoming.startAt, tz) })
            : t('freeToday')}
        </div>
      )}

      <div
        className="mono"
        style={{
          fontSize: 'calc(var(--legend-font) - 1px)',
          color: 'var(--text-dim)',
          letterSpacing: '.06em',
          paddingTop: 4,
          borderTop: '1px solid var(--line)',
        }}
      >
        {t('tooltipHint')}
      </div>
    </motion.div>
  );
}
