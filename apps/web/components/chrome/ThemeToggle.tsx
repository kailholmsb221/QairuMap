'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMetrics } from '@/features/metrics/useViewportMetrics';
import { IconTheme } from './Icons';
import { IconButton } from './IconButton';

export function ThemeToggle() {
  const t = useTranslations('header');
  const m = useMetrics();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'light') setTheme('light');
  }, []);

  return (
    <IconButton
      label={t('theme')}
      testId="theme-toggle"
      onClick={() => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        document.documentElement.setAttribute('data-theme', next);
        try {
          localStorage.setItem('cl-theme', next);
        } catch {
          /* private mode — the choice simply does not persist */
        }
      }}
    >
      <IconTheme size={Math.round(m.tabFont * 1.23)} />
    </IconButton>
  );
}
