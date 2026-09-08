'use client';

import { memo } from 'react';
import { motion } from 'motion/react';
import type { RoomDisplayPhase } from '@/features/board/selectors';

const PHASE_COLOR: Record<string, string> = {
  live: 'var(--status-live)',
  ending: 'var(--status-ending)',
  soon: 'var(--status-soon)',
  delayed: 'var(--status-delayed)',
  conflict: 'var(--status-ending)',
  free: 'var(--text-dim)',
};

export type RoomChipProps = {
  code: string;
  course?: string;
  line: string;
  phase: RoomDisplayPhase;
  pct?: number;
  x: number;
  y: number;
  selected?: boolean;
  dim?: boolean;
  compact?: boolean;
  delay?: number;
  onSelect?: (code: string) => void;
};

/** `roomChip()` — code, course and countdown with a progress arc, over a focused plate. */
function Chip({
  code,
  course,
  line,
  phase,
  pct = 0,
  x,
  y,
  selected,
  dim,
  compact,
  delay = 0,
  onSelect,
}: RoomChipProps) {
  const colour = PHASE_COLOR[phase] ?? 'var(--text-dim)';
  const busy = phase !== 'free';
  const r = 7;
  const circ = 2 * Math.PI * r;

  const arc = busy ? (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ display: 'block', flex: 'none' }}>
      <circle cx="9" cy="9" r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="2" />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        stroke={colour}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circ.toFixed(1)}
        strokeDashoffset={(circ * (1 - Math.min(1, Math.max(0, pct)))).toFixed(1)}
        transform="rotate(-90 9 9)"
      />
    </svg>
  ) : (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: 99,
        border: '1.5px solid rgba(255,255,255,.3)',
        display: 'block',
        flex: 'none',
      }}
    />
  );

  const border = selected
    ? '1.5px solid var(--accent)'
    : `1px solid ${busy ? `color-mix(in srgb, ${colour} 45%, transparent)` : 'var(--line)'}`;
  const boxShadow = selected
    ? '0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent), 0 10px 30px rgba(0,0,0,.5)'
    : '0 6px 18px rgba(0,0,0,.4)';

  return (
    <motion.button
      type="button"
      data-room-chip={code}
      onClick={onSelect ? () => onSelect(code) : undefined}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: dim ? 0.5 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.28, delay, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'absolute',
        left: Math.round(x),
        top: Math.round(y),
        transform: 'translate(-50%,-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 7 : 8,
        padding: compact ? '5px 8px' : '5px 9px 5px 7px',
        borderRadius: compact ? 7 : 8,
        background: 'rgba(11,15,23,.9)',
        border,
        boxShadow,
        cursor: onSelect ? 'pointer' : 'default',
        textAlign: 'left',
      }}
    >
      {arc}
      {compact ? (
        <span
          className="mono"
          style={{
            fontSize: 'calc(var(--legend-font) + 1px)',
            fontWeight: 800,
            color: 'var(--text)',
          }}
        >
          {code}
        </span>
      ) : (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span
              className="mono"
              style={{
                fontSize: 'calc(var(--legend-font) + 2px)',
                fontWeight: 800,
                color: 'var(--text)',
              }}
            >
              {code}
            </span>
            <span
              className="mono"
              style={{
                fontSize: 'var(--legend-font)',
                fontWeight: 600,
                color: 'var(--text-dim)',
              }}
            >
              {course ?? ''}
            </span>
          </span>
          <span
            className="mono"
            style={{
              fontSize: 'var(--legend-font)',
              color: busy ? colour : 'var(--text-dim)',
              letterSpacing: '.02em',
              whiteSpace: 'nowrap',
            }}
          >
            {line}
          </span>
        </span>
      )}
    </motion.button>
  );
}

export const RoomChip = memo(Chip);
