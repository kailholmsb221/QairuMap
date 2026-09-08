import type { SVGProps } from 'react';

/** Stroke icons on a 20px grid — ported from `ICON` in `docs/design/src/ui.mjs`. */
function Ico({
  size = 18,
  children,
  ...rest
}: { size?: number; children: React.ReactNode } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flex: 'none' }}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconSearch = (p: { size?: number }) => (
  <Ico {...p}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="M13.5 13.5 17 17" />
  </Ico>
);

export const IconTheme = (p: { size?: number }) => (
  <Ico {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor" stroke="none" />
  </Ico>
);

export const IconKiosk = (p: { size?: number }) => (
  <Ico {...p}>
    <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
  </Ico>
);

export const IconClose = (p: { size?: number }) => (
  <Ico {...p}>
    <path d="M5 5l10 10M15 5 5 15" />
  </Ico>
);

export const IconMap = (p: { size?: number }) => (
  <Ico {...p}>
    <path d="M3 5l5-2 4 2 5-2v12l-5 2-4-2-5 2z" />
    <path d="M8 3v12M12 5v12" />
  </Ico>
);

export const IconLive = (p: { size?: number }) => (
  <Ico {...p}>
    <circle cx="10" cy="10" r="2.5" fill="currentColor" stroke="none" />
    <path d="M5.5 5.5a6.5 6.5 0 0 0 0 9M14.5 5.5a6.5 6.5 0 0 1 0 9" />
  </Ico>
);

export const IconWarn = (p: { size?: number }) => (
  <Ico {...p}>
    <path d="M10 3 18 17H2z" />
    <path d="M10 8v4M10 14.5v.5" />
  </Ico>
);

export const IconFeed = (p: { size?: number }) => (
  <Ico {...p}>
    <path d="M3 6h14M3 10h10M3 14h7" />
  </Ico>
);

export const IconRetry = (p: { size?: number }) => (
  <Ico {...p}>
    <path d="M16 10a6 6 0 1 1-1.8-4.3" />
    <path d="M16 3v4h-4" />
  </Ico>
);

export const IconGrid = (p: { size?: number }) => (
  <Ico {...p}>
    {[5, 10, 15].map((y) =>
      [5, 10, 15].map((x) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" fill="currentColor" stroke="none" />
      )),
    )}
  </Ico>
);

export const IconArrow = (p: { size?: number }) => (
  <Ico {...p}>
    <path d="M4 10h12M11 5l5 5-5 5" />
  </Ico>
);

export const IconClock = (p: { size?: number }) => (
  <Ico {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 6v4l2.5 1.5" />
  </Ico>
);

export const IconUsers = (p: { size?: number }) => (
  <Ico {...p}>
    <circle cx="8" cy="7" r="3" />
    <path d="M2.5 16a5.5 5.5 0 0 1 11 0" />
    <path d="M13 4.5a3 3 0 0 1 0 5.5M14.5 11a5 5 0 0 1 3 4.5" />
  </Ico>
);

export const IconChevron = (p: { size?: number }) => (
  <Ico {...p}>
    <path d="M7 4l6 6-6 6" />
  </Ico>
);

/** The building silhouette in a rounded tile (`logoMark()`). */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 30"
      style={{ display: 'block', flex: 'none' }}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="30" height="30" rx="8" fill="rgba(94,234,212,.14)" />
      <g transform="translate(9 5) scale(0.02)">
        <path
          d="M 320 40 L 545 40 Q 580 40 580 75 L 580 925 Q 580 960 545 960 L 260 984 C 140 986 44 900 34 770 Q 10 585 24 400 C 16 240 140 80 320 40 Z"
          fill="var(--accent)"
        />
        <rect x="0" y="430" width="600" height="140" fill="var(--bg)" fillOpacity="0.85" />
      </g>
    </svg>
  );
}
