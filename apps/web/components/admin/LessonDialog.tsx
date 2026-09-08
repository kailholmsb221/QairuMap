'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  Lesson,
  LessonParity,
  LessonType,
  RoomInfo,
  SearchCourse,
  SearchGroup,
  Semester,
  SlotInfo,
  TeacherRef,
} from '@campuslive/contracts';
import { ApiError } from '@/lib/api/client';
import { adminApi } from '@/lib/api/admin';
import type { ApiKeyState } from '@/features/admin/useApiKey';
import { lessonErrorField, type LessonField } from '@/features/admin/grid';
import { Dialog, DialogContent, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import {
  Eyebrow,
  Field,
  FieldError,
  Segmented,
  buttonStyle,
  dangerButtonStyle,
  inputStyle,
  lessonTypeColor,
  primaryButtonStyle,
} from './ui';

/** What a click on an empty cell pre-fills. */
export type LessonDraftSeed = {
  roomCode: string;
  slotIdx: number;
  weekday: number;
  parity: LessonParity;
};

export type LessonDialogProps = {
  apiKey: ApiKeyState;
  /** Present when editing an existing entry. */
  lesson: Lesson | null;
  seed: LessonDraftSeed | null;
  rooms: RoomInfo[];
  slots: SlotInfo[];
  teachers: TeacherRef[];
  groups: SearchGroup[];
  courses: SearchCourse[];
  semesters: Semester[];
  onClose: () => void;
  onSaved: () => void;
};

/** The lesson type a room suggests, so the form opens on something valid. */
function typeForRoom(rooms: RoomInfo[], code: string): LessonType {
  const room = rooms.find((r) => r.code === code);
  if (room?.type === 'lab') return 'lab';
  if (room?.type === 'lecture') return 'lecture';
  return 'practice';
}

export function LessonDialog({
  apiKey,
  lesson,
  seed,
  rooms,
  slots,
  teachers,
  groups,
  courses,
  semesters,
  onClose,
  onSaved,
}: LessonDialogProps) {
  const t = useTranslations('admin');
  const editing = lesson !== null;

  const [courseId, setCourseId] = useState(lesson?.courseId ?? courses[0]?.id ?? '');
  const [teacherId, setTeacherId] = useState(lesson?.teacherId ?? teachers[0]?.id ?? '');
  const [roomCode, setRoomCode] = useState(lesson?.roomCode ?? seed?.roomCode ?? rooms[0]?.code ?? '');
  const [weekday, setWeekday] = useState(lesson?.weekday ?? seed?.weekday ?? 1);
  const [slotIdx, setSlotIdx] = useState(lesson?.slotIdx ?? seed?.slotIdx ?? 1);
  const [slotSpan, setSlotSpan] = useState(lesson?.slotSpan ?? 1);
  const [parity, setParity] = useState<LessonParity>(lesson?.parity ?? seed?.parity ?? 'all');
  const [type, setType] = useState<LessonType>(
    lesson?.type ?? typeForRoom(rooms, seed?.roomCode ?? rooms[0]?.code ?? ''),
  );
  const [groupCodes, setGroupCodes] = useState<string[]>(
    lesson ? lesson.groups.map((g) => g.code) : [],
  );
  const [groupQuery, setGroupQuery] = useState('');
  const [errors, setErrors] = useState<Partial<Record<LessonField, string>>>({});
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const semesterId = lesson?.semesterId ?? semesters[0]?.id;

  const filteredGroups = useMemo(() => {
    const q = groupQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.code.toLowerCase().includes(q));
  }, [groups, groupQuery]);

  const toggleGroup = (code: string) =>
    setGroupCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );

  const fail = (e: unknown) => {
    if (e instanceof ApiError) {
      if (e.status === 401) apiKey.markRejected();
      setErrors({ [lessonErrorField(e)]: e.message });
      return;
    }
    setErrors({ form: e instanceof Error ? e.message : t('failed') });
  };

  async function save() {
    setErrors({});
    if (groupCodes.length === 0) {
      setErrors({ groupCodes: t('form.groupsNone') });
      return;
    }
    setBusy(true);
    try {
      if (lesson) {
        await adminApi.updateLesson(apiKey.key, lesson.id, {
          courseId,
          teacherId,
          roomCode,
          slotIdx,
          weekday,
          parity,
          type,
          slotSpan,
          groupCodes,
        });
      } else {
        await adminApi.createLesson(apiKey.key, {
          semesterId,
          courseId,
          teacherId,
          roomCode,
          slotIdx,
          weekday,
          parity,
          type,
          slotSpan,
          groupCodes,
        });
      }
      apiKey.markAccepted();
      onSaved();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!lesson) return;
    setBusy(true);
    setErrors({});
    try {
      await adminApi.deleteLesson(apiKey.key, lesson.id);
      apiKey.markAccepted();
      onSaved();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  const accent = lessonTypeColor(type);

  return (
    <Dialog open onOpenChange={(v) => (v ? undefined : onClose())}>
      <DialogPortal>
        <DialogOverlay style={{ background: 'rgba(11,15,23,.55)', backdropFilter: 'blur(2px)' }} />
        <DialogContent
          data-testid="lesson-dialog"
          aria-describedby={undefined}
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%)',
            width: 'min(820px, calc(100vw - 48px))',
            maxHeight: 'calc(100dvh - 64px)',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 16,
            background: 'rgba(17,24,38,.98)',
            border: '1px solid rgba(255,255,255,.14)',
            boxShadow: '0 30px 80px rgba(0,0,0,.6)',
            color: 'var(--text)',
            overflow: 'hidden',
          }}
        >
          {/* header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 18px',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <span
              aria-hidden="true"
              style={{ width: 3, height: 26, borderRadius: 99, background: accent }}
            />
            <DialogTitle asChild>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
                {editing
                  ? t('form.editTitle', { course: lesson.courseCode })
                  : t('form.createTitle')}
              </h2>
            </DialogTitle>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={onClose}
              aria-label={t('form.close')}
              data-testid="lesson-dialog-close"
              style={{ ...buttonStyle, height: 28, padding: '0 10px', fontSize: 12 }}
            >
              ESC
            </button>
          </div>

          {/* body */}
          <div
            className="admin-scroll"
            style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label={t('form.course')} error={errors.courseId}>
                <select
                  value={courseId}
                  data-testid="lesson-course"
                  onChange={(e) => setCourseId(e.target.value)}
                  style={inputStyle}
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.title}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t('form.teacher')} error={errors.teacherId}>
                <select
                  value={teacherId}
                  data-testid="lesson-teacher"
                  onChange={(e) => setTeacherId(e.target.value)}
                  style={inputStyle}
                >
                  {teachers.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.shortName}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <Field label={t('form.room')} error={errors.roomCode}>
                <select
                  value={roomCode}
                  data-testid="lesson-room"
                  onChange={(e) => {
                    setRoomCode(e.target.value);
                    if (!editing) setType(typeForRoom(rooms, e.target.value));
                  }}
                  style={inputStyle}
                >
                  {rooms.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.code} · {t('form.floor', { n: r.floor })} · {r.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t('form.weekday')} error={errors.weekday}>
                <select
                  value={weekday}
                  data-testid="lesson-weekday"
                  onChange={(e) => setWeekday(Number(e.target.value))}
                  style={inputStyle}
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={d}>
                      {t(`weekdayLong.${d}` as 'weekdayLong.1')}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t('form.slot')} error={errors.slotIdx}>
                <select
                  value={slotIdx}
                  data-testid="lesson-slot"
                  onChange={(e) => setSlotIdx(Number(e.target.value))}
                  style={inputStyle}
                >
                  {slots.map((s) => (
                    <option key={s.id} value={s.idx}>
                      {s.idx} · {s.startsAt}–{s.endsAt}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <Field label={t('form.span')} error={errors.slotSpan}>
                <Segmented
                  value={slotSpan}
                  testId="lesson-span"
                  onChange={setSlotSpan}
                  options={[
                    { value: 1, label: t('form.span1') },
                    { value: 2, label: t('form.span2') },
                  ]}
                />
              </Field>
              <Field label={t('form.parity')} error={errors.parity}>
                <Segmented
                  value={parity}
                  testId="lesson-parity"
                  onChange={(v) => setParity(v)}
                  options={[
                    { value: 'all' as LessonParity, label: t('parity.allShort') },
                    { value: 'odd' as LessonParity, label: t('parity.oddShort') },
                    { value: 'even' as LessonParity, label: t('parity.evenShort') },
                  ]}
                />
              </Field>
              <Field label={t('form.type')} error={errors.type}>
                <Segmented
                  value={type}
                  testId="lesson-type"
                  onChange={(v) => setType(v)}
                  options={[
                    { value: 'lecture' as LessonType, label: t('form.typeLecture') },
                    { value: 'practice' as LessonType, label: t('form.typePractice') },
                    { value: 'lab' as LessonType, label: t('form.typeLab') },
                  ]}
                />
              </Field>
            </div>

            {/* groups */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Eyebrow>{t('form.groups')}</Eyebrow>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {t('form.groupsSelected', { n: groupCodes.length })}
                </span>
                <div style={{ flex: 1 }} />
                {groupCodes.length ? (
                  <button
                    type="button"
                    onClick={() => setGroupCodes([])}
                    style={{ ...buttonStyle, height: 26, fontSize: 11, padding: '0 10px' }}
                  >
                    {t('form.clearGroups')}
                  </button>
                ) : null}
                <input
                  value={groupQuery}
                  onChange={(e) => setGroupQuery(e.target.value)}
                  placeholder={t('form.groupsSearch')}
                  aria-label={t('form.groupsSearch')}
                  data-testid="lesson-group-search"
                  style={{ ...inputStyle, width: 190, height: 28, fontSize: 12 }}
                />
              </div>
              <div
                className="admin-scroll"
                data-testid="lesson-groups"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  maxHeight: 132,
                  overflowY: 'auto',
                  padding: 8,
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  background: 'rgba(255,255,255,.02)',
                }}
              >
                {filteredGroups.map((g) => {
                  const on = groupCodes.includes(g.code);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      data-testid={`group-${g.code}`}
                      onClick={() => toggleGroup(g.code)}
                      className="mono"
                      style={{
                        height: 26,
                        padding: '0 10px',
                        borderRadius: 99,
                        fontSize: 11,
                        fontWeight: 700,
                        border: on
                          ? '1px solid color-mix(in srgb, var(--accent) 55%, transparent)'
                          : '1px solid var(--line)',
                        background: on
                          ? 'color-mix(in srgb, var(--accent) 16%, transparent)'
                          : 'rgba(255,255,255,.03)',
                        color: on ? 'var(--accent)' : 'var(--text-dim)',
                      }}
                    >
                      {g.code}
                    </button>
                  );
                })}
              </div>
              {errors.groupCodes ? <FieldError>{errors.groupCodes}</FieldError> : null}
            </div>

            {errors.form ? <FieldError>{errors.form}</FieldError> : null}
            {errors.apiKey ? <FieldError>{errors.apiKey}</FieldError> : null}
          </div>

          {/* footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 18px',
              borderTop: '1px solid var(--line)',
              background: 'rgba(255,255,255,.02)',
            }}
          >
            {editing ? (
              confirming ? (
                <>
                  <span style={{ fontSize: 12, color: 'var(--status-cancelled)' }}>
                    {t('form.confirmDelete')}
                  </span>
                  <button
                    type="button"
                    data-testid="lesson-delete-confirm"
                    disabled={busy}
                    onClick={() => void remove()}
                    style={dangerButtonStyle}
                  >
                    {t('form.confirmYes')}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} style={buttonStyle}>
                    {t('form.confirmNo')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  data-testid="lesson-delete"
                  onClick={() => setConfirming(true)}
                  style={dangerButtonStyle}
                >
                  {t('form.delete')}
                </button>
              )
            ) : null}
            <div style={{ flex: 1 }} />
            <button type="button" onClick={onClose} style={buttonStyle}>
              {t('form.cancel')}
            </button>
            <button
              type="button"
              data-testid="lesson-save"
              disabled={busy}
              onClick={() => void save()}
              style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? t('form.saving') : t('form.save')}
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
