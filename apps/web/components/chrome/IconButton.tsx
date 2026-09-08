'use client';

import { forwardRef } from 'react';

export type IconButtonProps = {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  size?: number | string;
  color?: string;
  testId?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick'>;

/** `iconButton()` — square, hairline border, dim glyph. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, onClick, size, color, testId, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onClick}
      {...rest}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size ?? 'var(--btn-h)',
        height: size ?? 'var(--btn-h)',
        borderRadius: 9,
        border: '1px solid var(--line)',
        background: 'rgba(255,255,255,.03)',
        color: color ?? 'var(--text-dim)',
        flex: 'none',
        ...rest.style,
      }}
    >
      {children}
    </button>
  );
});
