'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  Override,
  OverrideKind,
  OverrideRequest,
  RoomInfo,
  SessionView,
  TeacherRef,
} from '@campuslive/contracts';
import { ApiError, api } from '@/lib/api/client';
import { adminApi } from '@/lib/api/admin';
import type { ApiKeyState } from '@/features/admin/useApiKey';
import { formatHm } from '@/features/time/derive';
import { Eyebrow, Field, FieldError, PANEL, buttonStyle, inputStyle, primaryButtonStyle } from './ui';

const KIND_COLOR: Record<OverrideKind, string> = {
  cancel: 'var(--status-cancelled)',
  move: 'var(--status-moved)',
  delay: 'var(--status-delayed)',
  reassign_teacher: 'var(--accent)',
  extra: 'var(--status-live)',
};

export type OverridesSectionProps = {
  apiKey: ApiKeyState;
  tz: string;
  /** The building's current local date — where the picker starts. */
  today: string;
  rooms: RoomInfo[];
  teachers: TeacherRef[];
};

export function OverridesSection({ apiKey, tz, today, rooms, teachers }: OverridesSectionProps) {
  const t = useTranslations('admin');
  const [date, setDate] = useState(today);
  const [overrides, setOverrides] = useState<Override[] | null>(null);
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<OverrideKind>('cancel');
  const [sessionId, setSessionId] = useState('');
  const [newRoomCode, setNewRoomCode] = useState('');
  const [newTeacherId, setNewTeacherId] = useState('');
  const [delayMinutes, setDelayMinutes] = useState(15);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [tl, list] = await Promise.all([
        api.timeline('A', date),
        apiKey.key ? adminApi.listOverrides(apiKey.key, date) : Promise.resolve({ overrides: [] }),
      ]);
      setSessions(tl.sessions);
      setOverrides(list.overrides);
      if (apiKey.key) apiKey.markAccepted();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) apiKey.markRejected();
      setOverrides([]);
      setError(e instanceof Error ? e.message : t('overrides.failed'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, apiKey.key, t]);

  useEffect(() => {
    setOverrides(null);
    void load();
  }, [load]);

  const byLesson = useMemo(() => {
    const map = new Map<string, SessionView>();
    for (const s of sessions) if (s.lessonId) map.set(s.lessonId, s);
    return map;
  }, [sessions]);

  useEffect(() => {
    if (!sessionId && sessions[0]) setSessionId(sessions[0].sessionId);
  }, [sessions, sessionId]);

  const target = sessions.find((s) => s.sessionId === sessionId);

  async function apply() {
    if (!apiKey.key) {
      setFormError(t('key.missing'));
      return;
    }
    setFormError(null);
    setBusy(true);
    const body: OverrideRequest = { date, kind, note: note.trim() || undefined };
    if (target) body.sessionId = target.sessionId;
    if (kind === 'move') body.newRoomCode = newRoomCode;
    if (kind === 'delay') body.delayMinutes = delayMinutes;
    if (kind === 'reassign_teacher') body.newTeacherId = newTeacherId;
    try {
      await adminApi.createOverride(apiKey.key, body);
      apiKey.markAccepted();
      setNote('');
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) apiKey.markRejected();
      setFormError(e instanceof Error ? e.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  async function undo(id: string) {
    setFormError(null);
    try {
      await adminApi.deleteOverride(apiKey.key, id);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) apiKey.markRejected();
      setFormError(e instanceof Error ? e.message : t('failed'));
    }
  }

  const label = (s: SessionView) => {
    const room = s.movedFromRoomCode ? `${s.movedFromRoomCode} → ${s.roomCode}` : s.roomCode;
    return `${formatHm(s.startAt, tz)} · ${room} · ${s.courseCode} · ${s.teacher.shortName}`;
  };

  return (
    <section
      data-testid="admin-overrides"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 380px',
        gap: 'var(--gap)',
        minHeight: 0,
        minWidth: 0,
      }}
    >
      {/* --------------------------------------------------------------- list */}
      <div style={{ ...PANEL, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <Eyebrow>{t('overrides.list')}</Eyebrow>
          <div style={{ flex: 1 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Eyebrow>{t('overrides.date')}</Eyebrow>
            <input
              type="date"
              value={date}
              data-testid="override-date"
              onChange={(e) => setDate(e.target.value)}
              style={{ ...inputStyle, width: 160, height: 30, fontSize: 12 }}
            />
          </label>
        </div>

        <div className="admin-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10 }}>
          {overrides === null ? (
            <Placeholder text={t('overrides.loading')} />
          ) : error ? (
            <Placeholder text={error} tone="error" />
          ) : overrides.length === 0 ? (
            <Placeholder text={t('overrides.none')} testId="overrides-empty" />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {overrides.map((o) => {
                const s = o.lessonId ? byLesson.get(o.lessonId) : undefined;
                const color = KIND_COLOR[o.kind];
                return (
                  <li
                    key={o.id}
                    data-testid={`override-${o.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--line)',
                      background: 'rgba(255,255,255,.02)',
                      borderLeft: `2px solid ${color}`,
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
                      {t(`overrides.short${kindKey(o.kind)}` as 'overrides.shortCancel')}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span
                        className="mono"
                        style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {s ? label(s) : (o.courseCode ?? o.roomCode ?? o.lessonId ?? '—')}
                        {o.newRoomCode && o.newRoomCode !== s?.roomCode ? ` → ${o.newRoomCode}` : ''}
                        {o.delayMinutes ? ` +${o.delayMinutes}` : ''}
                      </span>
                      {o.note ? (
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{o.note}</span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      data-testid={`override-undo-${o.id}`}
                      onClick={() => void undo(o.id)}
                      style={{ ...buttonStyle, height: 28, fontSize: 12, padding: '0 12px' }}
                    >
                      {t('overrides.undo')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* --------------------------------------------------------------- form */}
      <div style={{ ...PANEL, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
          <Eyebrow>{t('overrides.add')}</Eyebrow>
        </div>
        <div
          className="admin-scroll"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <Field label={t('overrides.kind')}>
            <select
              value={kind}
              data-testid="override-kind"
              onChange={(e) => setKind(e.target.value as OverrideKind)}
              style={inputStyle}
            >
              <option value="cancel">{t('overrides.kindCancel')}</option>
              <option value="move">{t('overrides.kindMove')}</option>
              <option value="delay">{t('overrides.kindDelay')}</option>
              <option value="reassign_teacher">{t('overrides.kindReassign')}</option>
            </select>
          </Field>

          <Field label={t('overrides.session')}>
            <select
              value={sessionId}
              data-testid="override-session"
              onChange={(e) => setSessionId(e.target.value)}
              style={inputStyle}
            >
              {sessions.length === 0 ? <option value="">{t('overrides.noSessions')}</option> : null}
              {sessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  {label(s)}
                </option>
              ))}
            </select>
          </Field>

          {kind === 'move' ? (
            <Field label={t('overrides.newRoom')}>
              <select
                value={newRoomCode}
                data-testid="override-room"
                onChange={(e) => setNewRoomCode(e.target.value)}
                style={inputStyle}
              >
                <option value="">—</option>
                {rooms
                  .filter((r) => r.schedulable)
                  .map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.code} · {r.name}
                    </option>
                  ))}
              </select>
            </Field>
          ) : null}

          {kind === 'delay' ? (
            <Field label={t('overrides.minutes')}>
              <input
                type="number"
                min={5}
                max={120}
                step={5}
                value={delayMinutes}
                data-testid="override-minutes"
                onChange={(e) => setDelayMinutes(Number(e.target.value))}
                style={inputStyle}
              />
            </Field>
          ) : null}

          {kind === 'reassign_teacher' ? (
            <Field label={t('overrides.newTeacher')}>
              <select
                value={newTeacherId}
                data-testid="override-teacher"
                onChange={(e) => setNewTeacherId(e.target.value)}
                style={inputStyle}
              >
                <option value="">—</option>
                {teachers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.shortName}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <Field label={t('overrides.note')}>
            <input
              value={note}
              data-testid="override-note"
              onChange={(e) => setNote(e.target.value)}
              style={inputStyle}
            />
          </Field>

          {formError ? <FieldError>{formError}</FieldError> : null}

          <button
            type="button"
            data-testid="override-apply"
            disabled={busy || sessions.length === 0}
            onClick={() => void apply()}
            style={{ ...primaryButtonStyle, opacity: busy || sessions.length === 0 ? 0.5 : 1 }}
          >
            {t('overrides.apply')}
          </button>
        </div>
      </div>
    </section>
  );
}

function kindKey(kind: OverrideKind): string {
  switch (kind) {
    case 'cancel':
      return 'Cancel';
    case 'move':
      return 'Move';
    case 'delay':
      return 'Delay';
    case 'reassign_teacher':
      return 'Reassign';
    default:
      return 'Extra';
  }
}

export function Placeholder({
  text,
  tone,
  testId,
}: {
  text: string;
  tone?: 'error';
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 120,
        padding: 20,
        textAlign: 'center',
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 12,
          color: tone === 'error' ? 'var(--status-cancelled)' : 'var(--text-dim)',
          maxWidth: 420,
          lineHeight: 1.5,
        }}
      >
        {text}
      </span>
    </div>
  );
}
