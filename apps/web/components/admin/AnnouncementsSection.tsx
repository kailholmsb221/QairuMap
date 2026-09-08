'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Severity } from '@campuslive/contracts';
import { ApiError } from '@/lib/api/client';
import { adminApi } from '@/lib/api/admin';
import type { ApiKeyState } from '@/features/admin/useApiKey';
import { useBoardStore } from '@/lib/store/boardStore';
import { formatHm } from '@/features/time/derive';
import { useNow } from '@/features/time/useNow';
import { Eyebrow, Field, FieldError, PANEL, inputStyle, primaryButtonStyle } from './ui';

const SEVERITY_COLOR: Record<Severity, string> = {
  info: 'var(--accent)',
  warning: 'var(--status-soon)',
  alert: 'var(--status-cancelled)',
};

/** Posts a ticker line and lists the ones the stream says are showing right now. */
export function AnnouncementsSection({ apiKey, tz }: { apiKey: ApiKeyState; tz: string }) {
  const t = useTranslations('admin.announcements');
  const nowMs = useNow();
  const announcements = useBoardStore((s) => s.announcements);
  const [text, setText] = useState('');
  const [severity, setSeverity] = useState<Severity>('info');
  const [ttl, setTtl] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const now = nowMs || Date.now();
  const showing = announcements.filter(
    (a) => new Date(a.startsAt).getTime() <= now && new Date(a.endsAt).getTime() > now,
  );

  async function post() {
    setError(null);
    setBusy(true);
    try {
      await adminApi.announce(apiKey.key, {
        building: 'A',
        text: text.trim(),
        severity,
        ttlMinutes: ttl,
      });
      apiKey.markAccepted();
      setText('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) apiKey.markRejected();
      setError(e instanceof Error ? e.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-testid="admin-announcements"
      style={{
        display: 'grid',
        gridTemplateColumns: '420px minmax(0,1fr)',
        gap: 'var(--gap)',
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <div style={{ ...PANEL, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
          <Eyebrow>{t('title')}</Eyebrow>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label={t('text')}>
            <input
              value={text}
              data-testid="announcement-text"
              onChange={(e) => setText(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label={t('severity')}>
              <select
                value={severity}
                data-testid="announcement-severity"
                onChange={(e) => setSeverity(e.target.value as Severity)}
                style={inputStyle}
              >
                <option value="info">{t('info')}</option>
                <option value="warning">{t('warning')}</option>
                <option value="alert">{t('alert')}</option>
              </select>
            </Field>
            <Field label={t('ttl')}>
              <input
                type="number"
                min={1}
                max={480}
                value={ttl}
                data-testid="announcement-ttl"
                onChange={(e) => setTtl(Number(e.target.value))}
                style={inputStyle}
              />
            </Field>
          </div>
          {error ? <FieldError>{error}</FieldError> : null}
          <button
            type="button"
            data-testid="announcement-post"
            disabled={busy || !text.trim()}
            onClick={() => void post()}
            style={{ ...primaryButtonStyle, opacity: busy || !text.trim() ? 0.5 : 1 }}
          >
            {t('post')}
          </button>
        </div>
      </div>

      <div style={{ ...PANEL, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
            padding: '12px 14px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <Eyebrow>{t('current')}</Eyebrow>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {t('hint')}
          </span>
        </div>
        <div className="admin-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10 }}>
          {showing.length === 0 ? (
            <div
              data-testid="announcements-empty"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140 }}
            >
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {t('none')}
              </span>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {showing.map((a) => {
                const color = SEVERITY_COLOR[a.severity];
                return (
                  <li
                    key={a.id}
                    data-testid={`announcement-${a.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--line)',
                      borderLeft: `2px solid ${color}`,
                      background: 'rgba(255,255,255,.02)',
                    }}
                  >
                    <span
                      className="pill"
                      style={{
                        height: 22,
                        padding: '0 8px',
                        fontSize: 10,
                        color,
                        background: `color-mix(in srgb, ${color} 14%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
                        flex: 'none',
                      }}
                    >
                      {t(a.severity)}
                    </span>
                    <span className="mono" style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
                      {a.text}
                    </span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', flex: 'none' }}>
                      {t('until', { time: formatHm(a.endsAt, tz) })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
