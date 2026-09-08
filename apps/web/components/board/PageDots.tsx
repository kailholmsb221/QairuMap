'use client';

export function PageDots({ total, current }: { total: number; current: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 'var(--dots)',
        flex: 'none',
      }}
      aria-hidden="true"
    >
      {total > 1
        ? Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              data-active={i === current ? 'true' : undefined}
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: i === current ? 'var(--accent)' : 'rgba(255,255,255,.18)',
                transition: 'background var(--dur-base) var(--ease-out)',
              }}
            />
          ))
        : null}
    </div>
  );
}
