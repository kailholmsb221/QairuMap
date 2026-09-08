'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { setLocale } from '@/app/actions';

const OPTIONS: { code: 'ru' | 'kk' | 'en'; label: string }[] = [
  { code: 'ru', label: 'RU' },
  { code: 'kk', label: 'KZ' },
  { code: 'en', label: 'EN' },
];

export function LangSwitch() {
  const active = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 3,
        borderRadius: 9,
        border: '1px solid var(--line)',
        background: 'rgba(255,255,255,.03)',
      }}
    >
      {OPTIONS.map(({ code, label }) => {
        const on = code === active;
        return (
          <button
            key={code}
            type="button"
            lang={code}
            aria-pressed={on}
            data-testid={`lang-${code}`}
            onClick={() =>
              startTransition(async () => {
                await setLocale(code);
                router.refresh();
              })
            }
            className="mono"
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 'calc(var(--btn-h) - 8px)',
              padding: '0 9px',
              borderRadius: 6,
              fontSize: 'calc(var(--tab-font) - 1px)',
              fontWeight: 700,
              letterSpacing: '.06em',
              color: on ? 'var(--text)' : 'var(--text-dim)',
              background: on ? 'rgba(255,255,255,.08)' : 'transparent',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
