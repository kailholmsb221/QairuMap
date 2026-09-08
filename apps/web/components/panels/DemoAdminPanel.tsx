'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Override, OverrideRequest } from '@campuslive/contracts';
import { api } from '@/lib/api/client';
import { useBoardStore } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { formatHm } from '@/features/time/derive';
import { IconGrid } from '@/components/chrome/Icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const inputStyle: React.CSSProperties = {
  height: 32,
  padding: '0 8px',
  borderRadius: 7,
  border: '1px solid var(--line)',
  background: 'rgba(255,255,255,.04)',
  color: 'var(--text)',
  fontSize: 12,
  fontFamily: 'var(--font-board)',
  minWidth: 0,
};

const buttonStyle: React.CSSProperties = {
  height: 32,
  padding: '0 12px',
  borderRadius: 7,
  border: '1px solid var(--line)',
  background: 'rgba(255,255,255,.04)',
  color: 'var(--text)',
  fontSize: 12,
  fontWeight: 700,
};

/** Hidden behind the grid button in the ticker; drives the real admin API. */
export function DemoAdminPanel({ tz }: { tz: string }) {
  const t = useTranslations('admin');
  const open = useUiStore((s) => s.adminOpen);
  const setOpen = useUiStore((s) => s.setAdminOpen);
  const snapshot = useBoardStore((s) => s.snapshot);

  const sessions = useMemo(() => [...snapshot.now, ...snapshot.next], [snapshot]);
  const teachers = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sessions) map.set(s.teacher.id, s.teacher.shortName);
    return [...map.entries()];
  }, [sessions]);

  const [sessionId, setSessionId] = useState('');
  const [room, setRoom] = useState('');
  const [minutes, setMinutes] = useState(15);
  const [teacherId, setTeacherId] = useState('');
  const [text, setText] = useState('');
  const [applied, setApplied] = useState<Override[]>([]);
  const [error, setError] = useState<string | null>(null);

  const target = sessions.find((s) => s.sessionId === sessionId) ?? sessions[0];

  async function send(body: OverrideRequest) {
    setError(null);
    try {
      const o = await api.createOverride(body);
      setApplied((a) => [o, ...a]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('failed'));
    }
  }

  async function undo(id: string) {
    setError(null);
    try {
      await api.deleteOverride(id);
      setApplied((a) => a.filter((o) => o.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('failed'));
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('title')}
          data-testid="admin-trigger"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 'var(--ticker-h)',
            height: '100%',
            color: 'rgba(139,148,167,.35)',
            flex: 'none',
          }}
        >
          <IconGrid size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" style={{ width: 420, padding: 16 }}>
        <div
          data-testid="admin-panel"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>{t('title')}</span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t('subtitle')}</span>
            </div>
            {/* the way into the full panel; the ticker's own layout is untouched */}
            <Link
              href="/admin"
              data-testid="open-admin"
              style={{
                ...buttonStyle,
                textDecoration: 'none',
                color: 'var(--accent)',
                borderColor: 'color-mix(in srgb, var(--accent) 45%, transparent)',
                background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                flex: 'none',
              }}
            >
              {t('page.openAdmin')} →
            </Link>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t('pickSession')}</span>
            <select
              value={target?.sessionId ?? ''}
              onChange={(e) => setSessionId(e.target.value)}
              style={inputStyle}
              data-testid="admin-session"
            >
              {sessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  {formatHm(s.startAt, tz)} · {s.roomCode} · {s.courseCode} {s.courseTitle}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              data-testid="admin-cancel"
              style={{
                ...buttonStyle,
                color: 'var(--status-cancelled)',
                borderColor: 'color-mix(in srgb, var(--status-cancelled) 45%, transparent)',
              }}
              onClick={() =>
                target &&
                void send({ date: snapshot.date, kind: 'cancel', sessionId: target.sessionId })
              }
            >
              {t('cancel')}
            </button>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder={t('roomPlaceholder')}
                style={{ ...inputStyle, width: 96 }}
                data-testid="admin-room"
              />
              <button
                type="button"
                style={{ ...buttonStyle, color: 'var(--status-moved)' }}
                disabled={!room}
                onClick={() =>
                  target &&
                  void send({
                    date: snapshot.date,
                    kind: 'move',
                    sessionId: target.sessionId,
                    newRoomCode: room,
                  })
                }
              >
                {t('move')}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number"
                min={5}
                max={60}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                style={{ ...inputStyle, width: 64 }}
              />
              <button
                type="button"
                style={{ ...buttonStyle, color: 'var(--status-delayed)' }}
                onClick={() =>
                  target &&
                  void send({
                    date: snapshot.date,
                    kind: 'delay',
                    sessionId: target.sessionId,
                    delayMinutes: minutes,
                  })
                }
              >
                {t('delay')} +{minutes} {t('minutes')}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                style={{ ...inputStyle, width: 150 }}
              >
                <option value="">—</option>
                {teachers.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                style={buttonStyle}
                disabled={!teacherId}
                onClick={() =>
                  target &&
                  void send({
                    date: snapshot.date,
                    kind: 'reassign_teacher',
                    sessionId: target.sessionId,
                    newTeacherId: teacherId,
                  })
                }
              >
                ↺
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('announcementPlaceholder')}
              style={{ ...inputStyle, flex: 1 }}
              data-testid="admin-announcement"
            />
            <button
              type="button"
              style={{ ...buttonStyle, color: 'var(--accent)' }}
              disabled={!text.trim()}
              onClick={async () => {
                setError(null);
                try {
                  await api.announce({
                    building: 'A',
                    text: text.trim(),
                    severity: 'info',
                    ttlMinutes: 30,
                  });
                  setText('');
                } catch (e) {
                  setError(e instanceof Error ? e.message : t('failed'));
                }
              }}
            >
              {t('post')}
            </button>
          </div>

          {error ? (
            <span style={{ fontSize: 11, color: 'var(--status-cancelled)' }}>{error}</span>
          ) : null}

          {applied.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: '.14em',
                  fontWeight: 800,
                  color: 'var(--text-dim)',
                }}
              >
                {t('created')}
              </span>
              {applied.map((o) => (
                <div
                  key={o.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 11,
                    color: 'var(--text-dim)',
                  }}
                >
                  <span className="mono" style={{ flex: 1, overflow: 'hidden' }}>
                    {o.kind} · {o.newRoomCode ?? o.delayMinutes ?? o.roomCode ?? ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => void undo(o.id)}
                    style={{ ...buttonStyle, height: 24, fontSize: 11 }}
                  >
                    {t('undo')}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
