'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ApiKeyState } from '@/features/admin/useApiKey';
import { buttonStyle, inputStyle, primaryButtonStyle } from './ui';

/**
 * The `X-Api-Key` control. It shows where the key in use came from and says so
 * loudly when there is none or the API rejected it, instead of letting writes
 * fail quietly.
 */
export function ApiKeyBar({ state }: { state: ApiKeyState }) {
  const t = useTranslations('admin.key');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (state.source === 'none' || state.rejected) setOpen(true);
  }, [state.source, state.rejected]);

  const bad = state.source === 'none' || state.rejected;
  const note = state.rejected ? t('rejected') : state.source === 'none' ? t('missing') : null;

  return (
    <div
      data-testid="api-key-bar"
      data-key-state={state.rejected ? 'rejected' : state.source}
      style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}
    >
      {note ? (
        <span
          className="mono"
          data-testid="api-key-note"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.06em',
            color: 'var(--status-cancelled)',
            maxWidth: 260,
          }}
        >
          {note}
        </span>
      ) : null}

      {open ? (
        <form
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            state.setKey(draft);
            setDraft('');
            if (draft.trim()) setOpen(false);
          }}
        >
          <input
            type="password"
            value={draft}
            data-testid="api-key-input"
            aria-label={t('label')}
            placeholder={t('placeholder')}
            onChange={(e) => setDraft(e.target.value)}
            style={{ ...inputStyle, width: 176, height: 30, fontSize: 12 }}
          />
          <button
            type="submit"
            data-testid="api-key-save"
            style={{ ...primaryButtonStyle, height: 30, padding: '0 10px', fontSize: 12 }}
          >
            {t('save')}
          </button>
          {state.source === 'stored' ? (
            <button
              type="button"
              data-testid="api-key-clear"
              onClick={() => {
                state.clear();
                setDraft('');
              }}
              style={{ ...buttonStyle, height: 30, padding: '0 10px', fontSize: 12 }}
            >
              {t('clear')}
            </button>
          ) : null}
        </form>
      ) : (
        <button
          type="button"
          data-testid="api-key-edit"
          onClick={() => setOpen(true)}
          className="mono"
          style={{
            ...buttonStyle,
            height: 30,
            padding: '0 10px',
            fontSize: 11,
            fontWeight: 600,
            color: bad ? 'var(--status-cancelled)' : 'var(--text-dim)',
            letterSpacing: '.04em',
          }}
          title={t('edit')}
        >
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: 99,
              background: bad ? 'var(--status-cancelled)' : 'var(--status-live)',
            }}
          />
          {state.source === 'stored' ? t('stored') : t('env')}
        </button>
      )}
    </div>
  );
}
