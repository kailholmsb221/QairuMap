'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { useBoardStore } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { filterSessions } from '@/features/board/selectors';
import { splitRows, useAutoFitRows } from '@/features/board/useAutoFitRows';
import { useMetrics } from '@/features/metrics/useViewportMetrics';
import { formatClock, formatHm } from '@/features/time/derive';
import { useNow } from '@/features/time/useNow';
import { api } from '@/lib/api/client';
import { IconClock, IconClose, IconRetry, IconWarn } from '@/components/chrome/Icons';
import { SplitFlap } from './SplitFlap';
import { BoardSection } from './BoardSection';

export type BoardProps = {
  tz: string;
  kiosk?: boolean;
  pageMs?: number;
};

/** `stale · 34 s` next to the NOW header while the stream is degraded. */
function StaleBadge() {
  const t = useTranslations('board');
  // subscribing to the tick is what makes the age count up
  useNow();
  const lastUpdateAt = useBoardStore((s) => s.lastUpdateAt);
  const seconds = lastUpdateAt ? Math.max(0, Math.round((Date.now() - lastUpdateAt) / 1000)) : 0;
  return (
    <span
      className="pill"
      style={{
        height: 20,
        padding: '0 8px',
        fontSize: 'calc(var(--row-sub) - 2px)',
        color: 'var(--status-soon)',
        background: 'color-mix(in srgb, var(--status-soon) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--status-soon) 40%, transparent)',
        marginRight: 10,
      }}
    >
      {t('stale', { age: `${seconds} s` })}
    </span>
  );
}

function EmptyCard({ tz }: { tz: string }) {
  const t = useTranslations('empty');
  const date = useBoardStore((s) => s.snapshot.date);
  const tomorrow = useMemo(() => {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }, [date]);

  const { data } = useQuery({
    queryKey: ['timeline', tomorrow],
    queryFn: () => api.timeline('A', tomorrow),
    staleTime: 5 * 60_000,
  });

  const first = data?.sessions?.find((s) => s.status !== 'cancelled');

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 64,
          height: 64,
          borderRadius: 99,
          background: 'rgba(255,255,255,.05)',
          border: '1px solid var(--line)',
          color: 'var(--text-dim)',
        }}
      >
        <IconClock size={28} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 'calc(var(--row-title) + 6px)', fontWeight: 800 }}>
          {t('title')}
        </span>
        <span style={{ fontSize: 'calc(var(--row-sub) + 2px)', color: 'var(--text-dim)' }}>
          {t('subtitle')}
        </span>
      </div>
      {first ? (
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: 18,
            borderRadius: 10,
            background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 'var(--row-sub)',
              fontWeight: 800,
              letterSpacing: '.14em',
              color: 'var(--accent)',
            }}
          >
            {t('nextClass')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <SplitFlap value={formatHm(first.startAt, tz)} />
            <SplitFlap value={first.roomCode} />
          </div>
          <span style={{ fontSize: 'var(--row-title)', fontWeight: 700 }}>
            <span className="mono" style={{ color: 'var(--text-dim)', marginRight: 8 }}>
              {first.courseCode}
            </span>
            {first.courseTitle}
          </span>
          <span className="mono" style={{ fontSize: 'var(--row-sub)', color: 'var(--text-dim)' }}>
            {first.teacher.shortName} · {first.groups.join(', ')}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function ErrorCard({ tz }: { tz: string }) {
  const t = useTranslations('error');
  const lastUpdateAt = useBoardStore((s) => s.lastUpdateAt);
  const [countdown, setCountdown] = useState(12);
  const busy = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c > 1) return c - 1;
        void retry();
        return 12;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  async function retry() {
    if (busy.current) return;
    busy.current = true;
    try {
      const s = await api.board('A');
      useBoardStore.getState().setSnapshot(s, 'rest');
      useBoardStore.getState().setConnection('online');
      useBoardStore.getState().setApiDown(false);
    } catch {
      /* still down — the countdown restarts */
    } finally {
      busy.current = false;
    }
  }

  const time = lastUpdateAt ? formatClock(lastUpdateAt, tz) : '—';

  return (
    <div
      data-state="api-down"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 64,
          height: 64,
          borderRadius: 99,
          background: 'color-mix(in srgb, var(--status-cancelled) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--status-cancelled) 40%, transparent)',
          color: 'var(--status-cancelled)',
        }}
      >
        <IconWarn size={28} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 'calc(var(--row-title) + 6px)', fontWeight: 800 }}>
          {t('title')}
        </span>
        <span
          style={{
            fontSize: 'calc(var(--row-sub) + 2px)',
            color: 'var(--text-dim)',
            maxWidth: 380,
            lineHeight: 1.5,
          }}
        >
          {t('body', { time })}
        </span>
      </div>
      <div
        className="mono"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 'var(--row-sub)',
          color: 'var(--text-dim)',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 99,
            background: 'var(--status-cancelled)',
          }}
        />
        {t('retryIn', { n: countdown })}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={() => void retry()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 'var(--btn-h)',
            padding: '0 18px',
            borderRadius: 9,
            background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
            color: 'var(--accent)',
          }}
        >
          <IconRetry size={16} />
          <span style={{ fontSize: 'calc(var(--row-sub) + 1px)', fontWeight: 700 }}>
            {t('retryNow')}
          </span>
        </button>
        <button
          type="button"
          onClick={() => useBoardStore.getState().setConnection('reconnecting')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 'var(--btn-h)',
            padding: '0 18px',
            borderRadius: 9,
            background: 'rgba(255,255,255,.04)',
            border: '1px solid var(--line)',
            color: 'var(--text)',
          }}
        >
          <span style={{ fontSize: 'calc(var(--row-sub) + 1px)', fontWeight: 700 }}>
            {t('showLast')}
          </span>
        </button>
      </div>
    </div>
  );
}

export function Board({ tz, kiosk = false, pageMs = 8000 }: BoardProps) {
  const t = useTranslations('board');
  const m = useMetrics();
  const areaRef = useRef<HTMLDivElement>(null);

  const now = useBoardStore((s) => s.snapshot.now);
  const next = useBoardStore((s) => s.snapshot.next);
  const connection = useBoardStore((s) => s.connection);
  const highlight = useUiStore((s) => s.highlight);
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const selectRoom = useUiStore((s) => s.selectRoom);
  const setHighlight = useUiStore((s) => s.setHighlight);
  const [hover, setHover] = useState(false);

  const nowRows = useMemo(() => filterSessions(now, highlight), [now, highlight]);
  const nextRows = useMemo(() => filterSessions(next, highlight), [next, highlight]);

  const chrome = 2 * (m.sectionHead + m.dots) + m.gap;
  const totalRows = useAutoFitRows(areaRef, m.rowH, 2, chrome);
  const [nowCount, nextCount] = splitRows(totalRows, nowRows.length, nextRows.length);

  const empty = now.length === 0 && next.length === 0;
  const offline = connection === 'offline';

  const filterKind = highlight
    ? t(
        highlight.kind === 'group'
          ? 'kindGroup'
          : highlight.kind === 'teacher'
            ? 'kindTeacher'
            : highlight.kind === 'room'
              ? 'kindRoom'
              : 'kindCourse',
      )
    : '';

  return (
    <aside
      data-testid="board"
      role="table"
      aria-label={t('label')}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--gap)',
        padding: 'var(--board-pad)',
        borderRadius: 'var(--radius)',
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      {offline ? (
        <ErrorCard tz={tz} />
      ) : empty ? (
        <EmptyCard tz={tz} />
      ) : (
        <>
          {highlight ? (
            <div
              data-testid="board-filter"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 'calc(var(--tab-h) + 4px)',
                padding: '0 6px 0 12px',
                borderRadius: 9,
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                flex: 'none',
              }}
            >
              <span style={{ fontSize: 'var(--row-sub)', color: 'var(--text-dim)' }}>
                {t('filteredBy', { kind: filterKind })}
              </span>
              <span
                className="mono"
                style={{
                  fontSize: 'calc(var(--row-sub) + 1px)',
                  fontWeight: 800,
                  color: 'var(--accent)',
                }}
              >
                {highlight.label ?? highlight.id}
              </span>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                aria-label={t('clearFilter')}
                onClick={() => setHighlight(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  color: 'var(--text-dim)',
                }}
              >
                <IconClose size={14} />
              </button>
            </div>
          ) : null}

          <div
            ref={areaRef}
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--gap)',
            }}
          >
            <BoardSection
              title={t('now')}
              count={nowRows.length}
              note={highlight ? t('nowNoteFiltered') : t('nowNote')}
              sessions={nowRows}
              rows={nowCount}
              tz={tz}
              paused={hover && !kiosk}
              reducedMotion={reducedMotion}
              pageMs={pageMs}
              badge={connection === 'reconnecting' ? <StaleBadge /> : undefined}
              onSelect={kiosk ? undefined : selectRoom}
            />
            <BoardSection
              title={t('next')}
              count={nextRows.length}
              note={nextRows.length ? t('nextNote') : ''}
              sessions={nextRows}
              rows={nextCount}
              tz={tz}
              paused={hover && !kiosk}
              reducedMotion={reducedMotion}
              pageMs={pageMs}
              onSelect={kiosk ? undefined : selectRoom}
            />
          </div>
        </>
      )}
    </aside>
  );
}
