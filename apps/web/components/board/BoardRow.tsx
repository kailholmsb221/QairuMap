'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'motion/react';
import type { SessionView } from '@campuslive/contracts';
import { displayRoomCode, pillKindOf, type PillKind } from '@/features/board/selectors';
import { formatHm, minutesLeft, minutesUntil } from '@/features/time/derive';
import { useNow } from '@/features/time/useNow';
import { IconWarn } from '@/components/chrome/Icons';
import { SplitFlap } from './SplitFlap';
import { StatusPill } from './StatusPill';

export type BoardRowProps = {
  session: SessionView;
  tz: string;
  last?: boolean;
  onSelect?: (roomCode: string) => void;
};

/** Only `ENDS n MIN` / `IN n MIN` need the 1 Hz tick, so only they subscribe. */
function CountdownPill({ kind, session }: { kind: 'ending' | 'soon'; session: SessionView }) {
  const t = useTranslations('pill');
  const now = useNow();
  const base = now || new Date(session.startAt).getTime();
  const n =
    kind === 'ending' ? minutesLeft(session.endAt, base) : minutesUntil(session.startAt, base);
  return <StatusPill kind={kind} label={kind === 'ending' ? t('ends', { n }) : t('in', { n })} />;
}

function StaticPill({
  kind,
  session,
  tz,
}: {
  kind: PillKind;
  session: SessionView;
  tz: string;
}) {
  const t = useTranslations('pill');
  switch (kind) {
    case 'live':
      return <StatusPill kind="live" label={t('live')} />;
    case 'cancelled':
      return <StatusPill kind="cancelled" label={t('cancelled')} />;
    case 'moved':
      return <StatusPill kind="moved" label={t('moved', { room: session.roomCode })} />;
    case 'delayed':
      return <StatusPill kind="delayed" label={t('delayed', { n: session.delayMinutes ?? 0 })} />;
    default:
      return (
        <StatusPill kind="upcoming" label={t('starts', { time: formatHm(session.startAt, tz) })} />
      );
  }
}

function Row({ session, tz, last, onSelect }: BoardRowProps) {
  const t = useTranslations('pill');
  const kind = pillKindOf(session);
  const cancelled = kind === 'cancelled';
  const room = displayRoomCode(session);
  const time = formatHm(session.startAt, tz);
  const sub = [
    session.teacher.shortName,
    session.groups.join(', '),
    kind === 'ending' ? null : `→ ${formatHm(session.endAt, tz)}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <motion.div
      layout="position"
      layoutId={session.sessionId}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      role="row"
      data-session={session.sessionId}
      data-room={room}
      data-status={kind}
      onClick={onSelect ? () => onSelect(session.roomCode) : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--row-gap)',
        height: 'var(--row-h)',
        padding: '0 4px',
        borderBottom: `1px solid ${last ? 'transparent' : 'var(--line)'}`,
        cursor: onSelect ? 'pointer' : undefined,
      }}
    >
      <span role="cell">
        <SplitFlap value={time} />
      </span>
      <span role="cell">
        <SplitFlap value={room} />
      </span>
      <div
        role="cell"
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <div
          data-testid="row-title"
          style={{
            fontSize: 'var(--row-title)',
            fontWeight: 700,
            color: cancelled ? 'var(--text-dim)' : 'var(--text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textDecoration: cancelled ? 'line-through' : undefined,
          }}
        >
          <span
            className="mono"
            style={{ color: 'var(--text-dim)', fontWeight: 600, marginRight: 8 }}
          >
            {session.courseCode}
          </span>
          {session.courseTitle}
          {session.conflict ? (
            <span
              title={t('conflict')}
              aria-label={t('conflict')}
              style={{
                display: 'inline-flex',
                color: 'var(--status-ending)',
                marginLeft: 6,
                verticalAlign: -3,
              }}
            >
              <IconWarn size={14} />
            </span>
          ) : null}
        </div>
        <div
          className="mono"
          style={{
            fontSize: 'var(--row-sub)',
            color: 'var(--text-dim)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {sub}
        </div>
      </div>
      <span role="cell" style={{ display: 'flex' }}>
        {kind === 'ending' || kind === 'soon' ? (
          <CountdownPill kind={kind} session={session} />
        ) : (
          <StaticPill kind={kind} session={session} tz={tz} />
        )}
      </span>
    </motion.div>
  );
}

export const BoardRow = memo(Row, (a, b) => {
  const x = a.session;
  const y = b.session;
  return (
    a.last === b.last &&
    a.tz === b.tz &&
    x.sessionId === y.sessionId &&
    x.phase === y.phase &&
    x.status === y.status &&
    x.roomCode === y.roomCode &&
    x.movedFromRoomCode === y.movedFromRoomCode &&
    x.startAt === y.startAt &&
    x.endAt === y.endAt &&
    x.conflict === y.conflict &&
    x.courseTitle === y.courseTitle &&
    x.teacher.shortName === y.teacher.shortName
  );
});
