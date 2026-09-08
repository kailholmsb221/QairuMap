'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useUiStore } from '@/lib/store/uiStore';
import { useMetrics } from '@/features/metrics/useViewportMetrics';
import { IconKiosk, IconSearch, LogoMark } from './Icons';
import { IconButton } from './IconButton';
import { FloorTabs } from './FloorTabs';
import { LangSwitch } from './LangSwitch';
import { LiveClock } from './LiveClock';
import { ThemeToggle } from './ThemeToggle';

export type HeaderProps = {
  tz: string;
  initialAt: string;
  floors: number[];
};

export function Header({ tz, initialAt, floors }: HeaderProps) {
  const t = useTranslations('header');
  const brand = useTranslations('brand');
  const m = useMetrics();
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const icon = Math.round(m.tabFont * 1.23);

  return (
    <header
      style={{
        gridColumn: '1 / -1',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        height: 'var(--header-h)',
        padding: '0 6px',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
        <LogoMark size={Math.round(m.headerH * 0.47)} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            style={{
              fontSize: 'var(--brand)',
              fontWeight: 800,
              letterSpacing: '-.01em',
              lineHeight: 1.1,
            }}
          >
            {brand('title')}
          </span>
          <span
            style={{
              fontSize: 'var(--brand-sub)',
              color: 'var(--text-dim)',
              fontWeight: 500,
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
            }}
          >
            {brand('subtitle')}
          </span>
        </div>
      </div>

      <div
        style={{
          width: 1,
          height: 'calc(var(--header-h) * 0.5)',
          background: 'var(--line)',
          flex: 'none',
        }}
      />

      <LiveClock tz={tz} initialAt={initialAt} />

      <div style={{ flex: 1 }} />
      <FloorTabs floors={floors} />
      <div style={{ flex: 1 }} />

      <button
        type="button"
        data-testid="search-trigger"
        onClick={() => setSearchOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 'var(--btn-h)',
          padding: '0 12px',
          borderRadius: 9,
          border: '1px solid var(--line)',
          background: 'rgba(255,255,255,.03)',
          color: 'var(--text-dim)',
          flex: 'none',
        }}
      >
        <IconSearch size={icon} />
        <span style={{ fontSize: 'var(--tab-font)', fontWeight: 600 }}>{t('search')}</span>
        <span
          className="mono"
          style={{
            fontSize: 'calc(var(--tab-font) - 2px)',
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 5,
            border: '1px solid var(--line)',
            color: 'var(--text-dim)',
          }}
        >
          {t('searchHint')}
        </span>
      </button>

      <LangSwitch />
      <ThemeToggle />
      <Link href="/kiosk" aria-label={t('kiosk')} style={{ display: 'flex', flex: 'none' }}>
        <IconButton label={t('kiosk')} testId="kiosk-link" tabIndex={-1}>
          <IconKiosk size={icon} />
        </IconButton>
      </Link>
    </header>
  );
}
