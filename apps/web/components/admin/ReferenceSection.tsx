'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SearchCourse, SearchGroup, TeacherRef } from '@campuslive/contracts';
import { ApiError } from '@/lib/api/client';
import { adminApi } from '@/lib/api/admin';
import type { ApiKeyState } from '@/features/admin/useApiKey';
import { Eyebrow, PANEL, buttonStyle, inputStyle, primaryButtonStyle } from './ui';

export type ReferenceSectionProps = {
  apiKey: ApiKeyState;
  teachers: TeacherRef[];
  groups: SearchGroup[];
  courses: SearchCourse[];
  /** Re-reads the three public reference lists after a write. */
  refresh: () => Promise<void>;
};

/**
 * The three editable tables. Clicking a name turns it into an input; Enter saves
 * with a `PATCH`, Escape cancels. This is what turns `Преподаватель 1` into a
 * real name — every board row picks the change up over SSE.
 */
export function ReferenceSection({ apiKey, teachers, groups, courses, refresh }: ReferenceSectionProps) {
  const t = useTranslations('admin.reference');
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  const guard = async (id: string, run: () => Promise<unknown>) => {
    setError(null);
    try {
      await run();
      apiKey.markAccepted();
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) apiKey.markRejected();
      setError({ id, message: e instanceof Error ? e.message : t('failed') });
    }
  };

  return (
    <section
      data-testid="admin-reference"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
        gap: 'var(--gap)',
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <Table
        testId="teachers"
        title={t('teachers')}
        count={teachers.length}
        rows={teachers.map((x) => ({ id: x.id, value: x.shortName, sub: meaningful(x.department) }))}
        error={error}
        placeholder={t('addTeacher')}
        onRename={(id, value) =>
          guard(id, () => adminApi.updateTeacher(apiKey.key, id, { shortName: value, fullName: value }))
        }
        onDelete={(id) => guard(id, () => adminApi.deleteTeacher(apiKey.key, id))}
        onAdd={(value) =>
          guard('new', () => adminApi.createTeacher(apiKey.key, { shortName: value, fullName: value }))
        }
      />

      <Table
        testId="groups"
        title={t('groups')}
        count={groups.length}
        rows={groups.map((x) => ({ id: x.id, value: x.code, sub: meaningful(x.program) }))}
        error={error}
        placeholder={t('addGroup')}
        onRename={(id, value) => guard(id, () => adminApi.updateGroup(apiKey.key, id, { code: value }))}
        onDelete={(id) => guard(id, () => adminApi.deleteGroup(apiKey.key, id))}
        onAdd={(value) => guard('new', () => adminApi.createGroup(apiKey.key, { code: value }))}
      />

      <Table
        testId="courses"
        title={t('courses')}
        count={courses.length}
        rows={courses.map((x) => ({ id: x.id, value: x.title, sub: x.code }))}
        error={error}
        placeholder={t('addCourse')}
        onRename={(id, value) => guard(id, () => adminApi.updateCourse(apiKey.key, id, { title: value }))}
        onDelete={(id) => guard(id, () => adminApi.deleteCourse(apiKey.key, id))}
        onAdd={(value) =>
          guard('new', () =>
            adminApi.createCourse(apiKey.key, { code: value.slice(0, 12).toUpperCase(), title: value }),
          )
        }
      />
    </section>
  );
}

type Row = { id: string; value: string; sub?: string };

/** The seed writes `—` where a department or programme is unknown; do not echo it. */
function meaningful(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v && v !== '—' && v !== '-' ? v : undefined;
}

function Table({
  testId,
  title,
  count,
  rows,
  error,
  placeholder,
  onRename,
  onDelete,
  onAdd,
}: {
  testId: string;
  title: string;
  count: number;
  rows: Row[];
  error: { id: string; message: string } | null;
  placeholder: string;
  onRename: (id: string, value: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAdd: (value: string) => Promise<void>;
}) {
  const t = useTranslations('admin.reference');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [adding, setAdding] = useState('');

  return (
    <div style={{ ...PANEL, display: 'flex', flexDirection: 'column', minHeight: 0 }} data-testid={`ref-${testId}`}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <Eyebrow>{title}</Eyebrow>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {t('count', { n: count })}
        </span>
      </div>

      <div className="admin-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map((row) => {
            const isEditing = editing === row.id;
            return (
              <li
                key={row.id}
                data-testid={`ref-row-${row.id}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '7px 12px',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {isEditing ? (
                    <input
                      autoFocus
                      value={draft}
                      data-testid={`ref-input-${row.id}`}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const value = draft.trim();
                          setEditing(null);
                          if (value && value !== row.value) void onRename(row.id, value);
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditing(null);
                        }
                      }}
                      onBlur={() => setEditing(null)}
                      style={{ ...inputStyle, height: 28, fontSize: 12 }}
                    />
                  ) : (
                    <button
                      type="button"
                      data-testid={`ref-name-${row.id}`}
                      title={t('renameHint')}
                      onClick={() => {
                        setDraft(row.value);
                        setEditing(row.id);
                      }}
                      className="mono"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: 'left',
                        fontSize: 12.5,
                        fontWeight: 600,
                        padding: '3px 4px',
                        borderRadius: 6,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {row.value}
                      {row.sub ? (
                        <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> · {row.sub}</span>
                      ) : null}
                    </button>
                  )}
                  {confirming === row.id ? (
                    <>
                      <button
                        type="button"
                        data-testid={`ref-delete-confirm-${row.id}`}
                        onClick={() => {
                          setConfirming(null);
                          void onDelete(row.id);
                        }}
                        style={{
                          ...buttonStyle,
                          height: 24,
                          padding: '0 8px',
                          fontSize: 11,
                          color: 'var(--status-cancelled)',
                          borderColor: 'color-mix(in srgb, var(--status-cancelled) 45%, transparent)',
                        }}
                      >
                        {t('delete')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        style={{ ...buttonStyle, height: 24, padding: '0 8px', fontSize: 11 }}
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      aria-label={t('delete')}
                      data-testid={`ref-delete-${row.id}`}
                      onClick={() => setConfirming(row.id)}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        color: 'var(--text-dim)',
                        flex: 'none',
                        fontSize: 13,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                {error && error.id === row.id ? (
                  <span
                    role="alert"
                    data-testid={`ref-error-${row.id}`}
                    style={{ fontSize: 11, color: 'var(--status-cancelled)', lineHeight: 1.4 }}
                  >
                    {error.message}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <form
        style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid var(--line)' }}
        onSubmit={(e) => {
          e.preventDefault();
          const value = adding.trim();
          if (!value) return;
          setAdding('');
          void onAdd(value);
        }}
      >
        <input
          value={adding}
          placeholder={placeholder}
          aria-label={placeholder}
          data-testid={`ref-add-${testId}`}
          onChange={(e) => setAdding(e.target.value)}
          style={{ ...inputStyle, height: 30, fontSize: 12 }}
        />
        <button type="submit" style={{ ...primaryButtonStyle, height: 30, fontSize: 12, padding: '0 12px' }}>
          {t('add')}
        </button>
      </form>
      {error && error.id === 'new' ? (
        <span
          role="alert"
          data-testid={`ref-error-new-${testId}`}
          style={{ fontSize: 11, color: 'var(--status-cancelled)', padding: '0 12px 10px', lineHeight: 1.4 }}
        >
          {error.message}
        </span>
      ) : null}
    </div>
  );
}
