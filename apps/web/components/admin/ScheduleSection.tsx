'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  Lesson,
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
import {
  buildGridIndex,
  cellSpan,
  isCovered,
  lessonsAt,
  schedulableRooms,
  type ParityFilter,
} from '@/features/admin/grid';
import { LessonDialog, type LessonDraftSeed } from './LessonDialog';
import { Eyebrow, Segmented, Toggle, buttonStyle, inputStyle, lessonTypeColor } from './ui';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const ROW_MIN = 58;
const COL_MIN = 112;
const SLOT_COL = 78;

export type ScheduleSectionProps = {
  apiKey: ApiKeyState;
  rooms: RoomInfo[];
  slots: SlotInfo[];
  teachers: TeacherRef[];
  groups: SearchGroup[];
  courses: SearchCourse[];
  semesters: Semester[];
  /** The weekday of the server's own "today", so the grid opens on it. */
  todayWeekday: number;
};

export function ScheduleSection({
  apiKey,
  rooms,
  slots,
  teachers,
  groups,
  courses,
  semesters,
  todayWeekday,
}: ScheduleSectionProps) {
  const t = useTranslations('admin');
  const [weekday, setWeekday] = useState(todayWeekday);
  const [parity, setParity] = useState<ParityFilter>('all');
  const [roomQuery, setRoomQuery] = useState('');
  const [onlyBusy, setOnlyBusy] = useState(false);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seed, setSeed] = useState<LessonDraftSeed | null>(null);
  const [editing, setEditing] = useState<Lesson | null>(null);

  const load = useCallback(async () => {
    if (!apiKey.key) {
      setLessons(null);
      setLoadError(null);
      return;
    }
    try {
      const list = await adminApi.listLessons(apiKey.key, { weekday });
      setLessons(list.lessons);
      setLoadError(null);
      apiKey.markAccepted();
    } catch (e) {
      setLessons([]);
      if (e instanceof ApiError && e.status === 401) apiKey.markRejected();
      setLoadError(e instanceof Error ? e.message : t('grid.failed'));
    }
    // `apiKey` is a fresh object on every render; only its key drives a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey.key, weekday, t]);

  useEffect(() => {
    setLessons(null);
    void load();
  }, [load]);

  const allRooms = useMemo(() => schedulableRooms(rooms), [rooms]);
  const index = useMemo(() => buildGridIndex(lessons ?? [], { weekday, parity }), [lessons, weekday, parity]);

  const visibleRooms = useMemo(() => {
    const q = roomQuery.trim().toLowerCase();
    return allRooms.filter((room) => {
      if (q && !room.code.toLowerCase().includes(q) && !room.name.toLowerCase().includes(q)) {
        return false;
      }
      if (onlyBusy) {
        const busy = slots.some((s) => lessonsAt(index, room.code, s.idx).length > 0);
        if (!busy) return false;
      }
      return true;
    });
  }, [allRooms, roomQuery, onlyBusy, slots, index]);

  const shown = useMemo(() => {
    let n = 0;
    for (const list of index.origins.values()) n += list.length;
    return n;
  }, [index]);

  const loading = lessons === null && !!apiKey.key;
  const empty = lessons !== null && shown === 0;

  const openCreate = (roomCode: string, slotIdx: number) => {
    setEditing(null);
    setSeed({ roomCode, slotIdx, weekday, parity: parity === 'all' ? 'all' : parity });
  };

  return (
    <section
      data-testid="admin-schedule"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, minWidth: 0 }}
    >
      {/* ------------------------------------------------------------ toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 'none' }}>
        <Segmented
          value={weekday}
          testId="weekday"
          ariaLabel={t('nav.schedule')}
          onChange={setWeekday}
          options={WEEKDAYS.map((d) => ({
            value: d,
            label: t(`weekdayShort.${d}` as 'weekdayShort.1'),
            title: t(`weekdayLong.${d}` as 'weekdayLong.1'),
          }))}
        />
        <Segmented
          value={parity}
          testId="parity"
          ariaLabel={t('parity.all')}
          onChange={setParity}
          options={[
            { value: 'all', label: t('parity.allShort') },
            { value: 'odd', label: t('parity.oddShort') },
            { value: 'even', label: t('parity.evenShort') },
          ]}
        />
        <input
          value={roomQuery}
          onChange={(e) => setRoomQuery(e.target.value)}
          placeholder={t('grid.roomFilter')}
          aria-label={t('grid.roomFilter')}
          data-testid="room-filter"
          style={{ ...inputStyle, width: 150 }}
        />
        <Toggle
          checked={onlyBusy}
          onChange={setOnlyBusy}
          label={t('grid.onlyBusy')}
          testId="only-busy"
        />
        <div style={{ flex: 1 }} />
        <span
          className="mono"
          data-testid="lesson-count"
          style={{ fontSize: 12, color: 'var(--text-dim)', letterSpacing: '.04em' }}
        >
          {t('grid.count', {
            n: shown,
            weekday: t(`weekdayLong.${weekday}` as 'weekdayLong.1'),
            parity: t(`parity.${parity}` as 'parity.all'),
          })}
        </span>
      </div>

      {/* --------------------------------------------------------------- grid */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: 'auto',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--line)',
          background: 'var(--panel)',
          position: 'relative',
        }}
        className="admin-scroll"
      >
        <div
          data-testid="grid"
          style={{
            display: 'grid',
            gridTemplateColumns: `${SLOT_COL}px repeat(${Math.max(visibleRooms.length, 1)}, minmax(${COL_MIN}px, 1fr))`,
            gridTemplateRows: `40px repeat(${slots.length}, minmax(${ROW_MIN}px, 1fr))`,
            minHeight: '100%',
            minWidth: 'max-content',
          }}
        >
          {/* corner */}
          <div style={{ ...headCell, position: 'sticky', top: 0, left: 0, zIndex: 3 }}>
            <Eyebrow>{t('grid.slotColumn')}</Eyebrow>
          </div>

          {/* room header */}
          {visibleRooms.map((room, i) => (
            <div
              key={room.code}
              data-testid={`grid-room-${room.code}`}
              title={`${room.code} · ${room.name}`}
              style={{
                ...headCell,
                gridColumn: i + 2,
                gridRow: 1,
                position: 'sticky',
                top: 0,
                zIndex: 2,
                flexDirection: 'column',
                gap: 1,
              }}
            >
              <span className="mono" style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.02em' }}>
                {room.code}
              </span>
              <span
                className="mono"
                style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.12em', color: 'var(--text-dim)' }}
              >
                F{room.floor} · {room.type.toUpperCase()}
              </span>
            </div>
          ))}

          {/* slot column */}
          {slots.map((slot, r) => (
            <div
              key={slot.id}
              style={{
                ...cellBase,
                gridColumn: 1,
                gridRow: r + 2,
                position: 'sticky',
                left: 0,
                zIndex: 1,
                background: 'var(--bg-elev)',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 2,
              }}
            >
              <span className="mono" style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>
                {slot.startsAt}
              </span>
              <span
                className="mono"
                style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1 }}
              >
                {slot.endsAt}
              </span>
            </div>
          ))}

          {/* cells */}
          {visibleRooms.map((room, c) =>
            slots.map((slot, r) => {
              const key = `${room.code}:${slot.idx}`;
              if (isCovered(index, room.code, slot.idx)) return null;
              const here = lessonsAt(index, room.code, slot.idx);
              if (here.length === 0) {
                return (
                  <button
                    key={key}
                    type="button"
                    data-testid={`cell-${room.code}-${slot.idx}`}
                    data-empty="true"
                    aria-label={`${t('grid.addHere')} · ${room.code} · ${slot.startsAt}`}
                    title={t('grid.addHere')}
                    onClick={() => openCreate(room.code, slot.idx)}
                    style={{
                      ...cellBase,
                      gridColumn: c + 2,
                      gridRow: r + 2,
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'transparent',
                      fontSize: 18,
                      fontWeight: 300,
                      transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,.05)';
                      e.currentTarget.style.color = 'var(--text-dim)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'transparent';
                    }}
                  >
                    +
                  </button>
                );
              }
              const span = cellSpan(index, room.code, slot.idx);
              return (
                <div
                  key={key}
                  style={{
                    ...cellBase,
                    gridColumn: c + 2,
                    gridRow: `${r + 2} / span ${span}`,
                    flexDirection: 'column',
                    gap: 3,
                    padding: 4,
                  }}
                >
                  {here.map((lesson) => (
                    <LessonCell
                      key={lesson.id}
                      lesson={lesson}
                      grown={here.length === 1}
                      onOpen={() => {
                        setSeed(null);
                        setEditing(lesson);
                      }}
                    />
                  ))}
                </div>
              );
            }),
          )}
        </div>

        {loading ? <GridSkeleton label={t('grid.loading')} /> : null}
        {empty && !loading ? (
          <div
            data-testid="grid-empty"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              className="mono"
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                background: 'rgba(11,15,23,.86)',
                border: '1px solid var(--line)',
                color: 'var(--text-dim)',
                fontSize: 13,
              }}
            >
              {t('grid.empty')}
            </span>
          </div>
        ) : null}
        {loadError && !loading ? (
          <div
            data-testid="grid-error"
            style={{
              position: 'absolute',
              left: '50%',
              top: 60,
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 14px',
              borderRadius: 9,
              background: 'color-mix(in srgb, var(--status-cancelled) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--status-cancelled) 45%, transparent)',
              color: 'var(--status-cancelled)',
            }}
          >
            <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>
              {loadError}
            </span>
            <button type="button" onClick={() => void load()} style={{ ...buttonStyle, height: 26, fontSize: 11 }}>
              {t('grid.reload')}
            </button>
          </div>
        ) : null}
      </div>

      {seed || editing ? (
        <LessonDialog
          apiKey={apiKey}
          lesson={editing}
          seed={seed}
          rooms={allRooms}
          slots={slots}
          teachers={teachers}
          groups={groups}
          courses={courses}
          semesters={semesters}
          onClose={() => {
            setSeed(null);
            setEditing(null);
          }}
          onSaved={() => {
            setSeed(null);
            setEditing(null);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------- one class */

function LessonCell({
  lesson,
  grown,
  onOpen,
}: {
  lesson: Lesson;
  grown: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations('admin');
  const color = lessonTypeColor(lesson.type);
  const groups = lesson.groups.map((g) => g.code.replace(/^Группа\s*/i, '')).join(', ');
  return (
    <button
      type="button"
      data-testid={`lesson-${lesson.id}`}
      data-room={lesson.roomCode}
      data-slot={lesson.slotIdx}
      data-course={lesson.courseCode}
      onClick={onOpen}
      title={`${lesson.courseCode} ${lesson.courseTitle} · ${lesson.teacherName} · ${lesson.groups.map((g) => g.code).join(', ')}`}
      style={{
        flex: grown ? 1 : 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2,
        minHeight: 0,
        padding: '4px 7px',
        borderRadius: 7,
        textAlign: 'left',
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        borderLeft: `2px solid ${color}`,
        overflow: 'hidden',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span className="mono" style={{ fontSize: 12, fontWeight: 800, color, letterSpacing: '.02em' }}>
          {lesson.courseCode}
        </span>
        {lesson.parity !== 'all' ? (
          <span
            className="mono"
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '.1em',
              padding: '1px 4px',
              borderRadius: 4,
              border: '1px solid var(--line)',
              color: 'var(--text-dim)',
            }}
          >
            {lesson.parity === 'odd' ? t('parity.tagOdd') : t('parity.tagEven')}
          </span>
        ) : null}
      </span>
      <span
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--text)',
          opacity: 0.85,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {lesson.teacherName}
      </span>
      <span
        className="mono"
        style={{
          fontSize: 10,
          color: 'var(--text-dim)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {groups}
      </span>
    </button>
  );
}

/* --------------------------------------------------------------- skeleton */

function GridSkeleton({ label }: { label: string }) {
  return (
    <div
      data-testid="grid-skeleton"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--bg-elev)',
        display: 'grid',
        gridTemplateRows: '40px 1fr',
      }}
    >
      <div style={{ ...headCell, justifyContent: 'flex-start', paddingLeft: 14 }}>
        <Eyebrow>{label}</Eyebrow>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${SLOT_COL}px repeat(8, minmax(${COL_MIN}px, 1fr))`,
          gridAutoRows: `minmax(${ROW_MIN}px, 1fr)`,
        }}
      >
        {Array.from({ length: 72 }).map((_, i) => (
          <div key={i} style={{ ...cellBase, padding: 6 }}>
            <span
              className="blink"
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                borderRadius: 6,
                background: 'rgba(255,255,255,.035)',
                animationDelay: `${(i % 9) * 90}ms`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const cellBase: React.CSSProperties = {
  display: 'flex',
  minWidth: 0,
  minHeight: 0,
  borderRight: '1px solid var(--line)',
  borderBottom: '1px solid var(--line)',
  padding: '0 8px',
};

const headCell: React.CSSProperties = {
  ...cellBase,
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg-elev)',
  borderBottom: '1px solid var(--line)',
};
