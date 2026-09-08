'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, useAnimate } from 'motion/react';
import type { SessionView } from '@campuslive/contracts';
import { usePager } from '@/features/board/usePager';
import { BoardRow } from './BoardRow';
import { PageDots } from './PageDots';

export type BoardSectionProps = {
  title: string;
  count: number | string;
  note: string;
  sessions: readonly SessionView[];
  rows: number;
  tz: string;
  paused?: boolean;
  reducedMotion?: boolean;
  badge?: React.ReactNode;
  pageMs?: number;
  onSelect?: (roomCode: string) => void;
};

export function SectionHeader({
  title,
  count,
  note,
  badge,
}: {
  title: string;
  count: number | string;
  note: string;
  badge?: React.ReactNode;
}) {
  return (
    <div
      role="row"
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        height: 'var(--section-head)',
        padding: '0 4px',
        borderBottom: '1px solid rgba(94,234,212,.45)',
        flex: 'none',
      }}
    >
      <span
        className="mono"
        role="columnheader"
        style={{
          fontSize: 'calc(var(--row-title) * 0.78)',
          fontWeight: 800,
          letterSpacing: '.14em',
          color: 'var(--accent)',
        }}
      >
        {title}
      </span>
      <span
        className="mono"
        style={{
          fontSize: 'calc(var(--row-title) * 0.78)',
          fontWeight: 600,
          color: 'var(--text-dim)',
        }}
      >
        · {count}
      </span>
      <span style={{ flex: 1 }} />
      {badge}
      <span
        className="mono"
        style={{ fontSize: 'var(--row-sub)', color: 'var(--text-dim)', letterSpacing: '.04em' }}
      >
        {note}
      </span>
    </div>
  );
}

export function BoardSection({
  title,
  count,
  note,
  sessions,
  rows,
  tz,
  paused,
  reducedMotion,
  badge,
  pageMs = 8000,
  onSelect,
}: BoardSectionProps) {
  const pager = usePager(sessions, rows, pageMs, paused);
  const [scope, animate] = useAnimate();
  const firstPage = useRef(true);

  useEffect(() => {
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    if (reducedMotion || !scope.current) return;
    // the whole section flips down like a departure board
    void animate(
      scope.current,
      { rotateX: [-90, 0], opacity: [0.15, 1] },
      { duration: 0.4, ease: 'easeInOut' },
    );
  }, [pager.page, animate, scope, reducedMotion]);

  return (
    <section
      data-section={title}
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 'none' }}
    >
      <SectionHeader title={title} count={count} note={note} badge={badge} />
      <div
        ref={scope}
        role="rowgroup"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: `calc(var(--row-h) * ${rows})`,
          transformStyle: 'preserve-3d',
          transformOrigin: 'top center',
          perspective: 1200,
          overflow: 'hidden',
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {pager.items.map((s, i) => (
            <BoardRow
              key={s.sessionId}
              session={s}
              tz={tz}
              last={i === pager.items.length - 1}
              onSelect={onSelect}
            />
          ))}
        </AnimatePresence>
      </div>
      <PageDots total={pager.pages} current={pager.page} />
    </section>
  );
}
