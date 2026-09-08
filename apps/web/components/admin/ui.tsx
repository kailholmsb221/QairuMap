'use client';

/**
 * The admin panel's small parts, built from the same tokens as the board — the
 * mono face for anything code-like, `--panel` / `--line` surfaces, the pill
 * geometry of `globals.css`. Nothing here introduces a new colour.
 */
import type { CSSProperties, ReactNode } from 'react';

export const PANEL: CSSProperties = {
  borderRadius: 'var(--radius)',
  background: 'var(--panel)',
  border: '1px solid var(--line)',
};

export const inputStyle: CSSProperties = {
  height: 34,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid var(--line)',
  background: 'rgba(255,255,255,.04)',
  color: 'var(--text)',
  fontSize: 13,
  fontFamily: 'var(--font-board)',
  minWidth: 0,
  width: '100%',
};

export const buttonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  height: 34,
  padding: '0 14px',
  borderRadius: 8,
  border: '1px solid var(--line)',
  background: 'rgba(255,255,255,.04)',
  color: 'var(--text)',
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: 'nowrap',
};

export const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
  border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
  color: 'var(--accent)',
};

export const dangerButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'color-mix(in srgb, var(--status-cancelled) 12%, transparent)',
  border: '1px solid color-mix(in srgb, var(--status-cancelled) 45%, transparent)',
  color: 'var(--status-cancelled)',
};

/** The dim, wide-tracked mono caption the board uses over each section. */
export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      className="mono"
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '.16em',
        textTransform: 'uppercase',
        color: 'var(--text-dim)',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  error,
  children,
  style,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, ...style }}>
      <Eyebrow>{label}</Eyebrow>
      {children}
      {error ? <FieldError>{error}</FieldError> : null}
    </label>
  );
}

/** An error stays put next to the input that caused it — never a toast. */
export function FieldError({ children }: { children: ReactNode }) {
  return (
    <span
      role="alert"
      data-testid="field-error"
      style={{
        fontSize: 12,
        lineHeight: 1.35,
        color: 'var(--status-cancelled)',
        fontFamily: 'var(--font-board)',
      }}
    >
      {children}
    </span>
  );
}

/** A row of mutually exclusive choices — the floor tabs' geometry, reused. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  testId,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
  testId?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-testid={testId}
      style={{
        display: 'flex',
        gap: 2,
        padding: 3,
        borderRadius: 10,
        background: 'rgba(255,255,255,.04)',
        border: '1px solid var(--line)',
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="tab"
            aria-selected={active}
            title={o.title}
            data-testid={testId ? `${testId}-${o.value}` : undefined}
            onClick={() => onChange(o.value)}
            className="mono"
            style={{
              flex: 1,
              height: 28,
              padding: '0 10px',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '.04em',
              whiteSpace: 'nowrap',
              background: active
                ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-dim)',
              transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 34,
        padding: '0 12px 0 10px',
        borderRadius: 8,
        border: '1px solid var(--line)',
        background: checked
          ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
          : 'rgba(255,255,255,.03)',
        color: checked ? 'var(--accent)' : 'var(--text-dim)',
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 26,
          height: 14,
          borderRadius: 99,
          background: checked
            ? 'color-mix(in srgb, var(--accent) 55%, transparent)'
            : 'rgba(255,255,255,.12)',
          position: 'relative',
          flex: 'none',
          transition: 'background var(--dur-fast) var(--ease-out)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 14 : 2,
            width: 10,
            height: 10,
            borderRadius: 99,
            background: checked ? 'var(--accent)' : 'var(--text-dim)',
            transition: 'left var(--dur-fast) var(--ease-out)',
          }}
        />
      </span>
      {label}
    </button>
  );
}

/** The colour a lesson type is tinted with, everywhere in the panel. */
export function lessonTypeColor(type: string): string {
  switch (type) {
    case 'lecture':
      return 'var(--status-live)';
    case 'lab':
      return 'var(--status-moved)';
    default:
      return 'var(--status-soon)';
  }
}
