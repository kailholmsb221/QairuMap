'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type {
  RoomInfo,
  SearchCourse,
  SearchGroup,
  Semester,
  SlotInfo,
  Snapshot,
  TeacherRef,
} from '@campuslive/contracts';
import { api } from '@/lib/api/client';
import { useBoardStore } from '@/lib/store/boardStore';
import { useViewportMetrics } from '@/features/metrics/useViewportMetrics';
import { useRealtime } from '@/features/realtime/useRealtime';
import { seedClock } from '@/features/time/useNow';
import { useApiKey } from '@/features/admin/useApiKey';
import { naturalCompare } from '@/features/admin/grid';
import { ConnectionDot } from '@/components/chrome/ConnectionDot';
import { LangSwitch } from '@/components/chrome/LangSwitch';
import { LiveClock } from '@/components/chrome/LiveClock';
import { ThemeToggle } from '@/components/chrome/ThemeToggle';
import { LogoMark } from '@/components/chrome/Icons';
import { ApiKeyBar } from './ApiKeyBar';
import { AnnouncementsSection } from './AnnouncementsSection';
import { OverridesSection } from './OverridesSection';
import { ReferenceSection } from './ReferenceSection';
import { ScheduleSection } from './ScheduleSection';
import { Eyebrow, buttonStyle } from './ui';

export type AdminSection = 'schedule' | 'overrides' | 'reference' | 'announcements';

const SECTIONS: AdminSection[] = ['schedule', 'overrides', 'reference', 'announcements'];

export type AdminAppProps = {
  initialSnapshot: Snapshot;
  initialTime: string;
  tz: string;
  apiDown: boolean;
  rooms: RoomInfo[];
  slots: SlotInfo[];
  teachers: TeacherRef[];
  groups: SearchGroup[];
  courses: SearchCourse[];
  semesters: Semester[];
  /** ISO weekday of the building's current local date, 1 = Monday. */
  todayWeekday: number;
};

/**
 * `/admin` — one screen, the same tokens and metrics as the board. It holds its
 * own `EventSource`, so a change made in another tab (or on the board) lands here
 * as well; the connection dot is the board's.
 */
export function AdminApp({
  initialSnapshot,
  initialTime,
  tz,
  apiDown,
  rooms,
  slots,
  teachers: initialTeachers,
  groups: initialGroups,
  courses: initialCourses,
  semesters,
  todayWeekday,
}: AdminAppProps) {
  const t = useTranslations('admin');

  useState(() => {
    useBoardStore.setState({
      snapshot: initialSnapshot,
      lastSse: apiDown ? null : initialSnapshot,
      connection: apiDown ? 'offline' : 'online',
      apiDown,
      lastUpdateAt: new Date(initialSnapshot.at).getTime(),
    });
    seedClock(initialTime);
    return true;
  });

  useViewportMetrics();
  useRealtime(initialSnapshot.building);

  const [section, setSection] = useState<AdminSection>('schedule');
  const [teachers, setTeachers] = useState(initialTeachers);
  const [groups, setGroups] = useState(initialGroups);
  const [courses, setCourses] = useState(initialCourses);
  const apiKey = useApiKey();
  const connection = useBoardStore((s) => s.connection);
  const snapshotDate = useBoardStore((s) => s.snapshot.date);

  // `Преподаватель 2` before `Преподаватель 10` — the API orders lexicographically.
  const sortedTeachers = useMemo(
    () => [...teachers].sort((a, b) => naturalCompare(a.shortName, b.shortName)),
    [teachers],
  );
  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => naturalCompare(a.code, b.code)),
    [groups],
  );

  const refreshReference = useCallback(async () => {
    const [tl, gl, cl] = await Promise.all([api.teachers(), api.groups(), api.courses()]);
    setTeachers(tl.teachers);
    setGroups(gl.groups);
    setCourses(cl.courses);
  }, []);

  return (
    <main
      data-testid="admin-app"
      data-section={section}
      style={{
        position: 'relative',
        height: '100dvh',
        maxHeight: '100dvh',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateRows: 'var(--header-h) minmax(0,1fr)',
        gap: 'var(--gap)',
        padding: 'var(--gutter)',
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      {/* ------------------------------------------------------------- header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          height: 'var(--header-h)',
          padding: '0 6px',
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
          <LogoMark size={30} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 'var(--brand)',
                fontWeight: 800,
                letterSpacing: '-.01em',
                lineHeight: 1.1,
              }}
            >
              CampusLive
              <span
                className="pill"
                data-testid="admin-badge"
                style={{
                  height: 20,
                  padding: '0 8px',
                  fontSize: 10,
                  color: 'var(--accent)',
                  background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
                }}
              >
                {t('page.badge')}
              </span>
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
              {t('page.title')}
            </span>
          </div>
        </div>

        <div
          style={{ width: 1, height: 'calc(var(--header-h) * 0.5)', background: 'var(--line)', flex: 'none' }}
        />

        <LiveClock tz={tz} initialAt={initialTime} />

        <div style={{ flex: 1 }} />

        <ApiKeyBar state={apiKey} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 34,
            borderRadius: 8,
            border: '1px solid var(--line)',
            background: 'rgba(255,255,255,.03)',
            overflow: 'hidden',
            flex: 'none',
          }}
        >
          <ConnectionDot connection={connection} />
        </div>
        <LangSwitch />
        <ThemeToggle />
        <Link
          href="/"
          data-testid="back-to-board"
          style={{ ...buttonStyle, textDecoration: 'none', color: 'var(--text-dim)' }}
        >
          ← {t('page.backToBoard')}
        </Link>
      </header>

      {/* --------------------------------------------------------- rail + body */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '212px minmax(0,1fr)',
          gap: 'var(--gap)',
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <nav
          aria-label={t('nav.sections')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: 8,
            borderRadius: 'var(--radius)',
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            minHeight: 0,
          }}
        >
          <Eyebrow style={{ padding: '6px 8px 8px' }}>{t('nav.sections')}</Eyebrow>
          {SECTIONS.map((s) => {
            const active = section === s;
            return (
              <button
                key={s}
                type="button"
                data-testid={`nav-${s}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => setSection(s)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  padding: '9px 10px',
                  borderRadius: 9,
                  textAlign: 'left',
                  background: active
                    ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                    : 'transparent',
                  borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                  color: active ? 'var(--accent)' : 'var(--text)',
                  transition: 'background var(--dur-fast) var(--ease-out)',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700 }}>{t(`nav.${s}` as 'nav.schedule')}</span>
                <span
                  className="mono"
                  style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '.04em' }}
                >
                  {t(`nav.${s}Sub` as 'nav.scheduleSub')}
                </span>
              </button>
            );
          })}
        </nav>

        <div style={{ display: 'grid', minHeight: 0, minWidth: 0 }}>
          {section === 'schedule' ? (
            <ScheduleSection
              apiKey={apiKey}
              rooms={rooms}
              slots={slots}
              teachers={sortedTeachers}
              groups={sortedGroups}
              courses={courses}
              semesters={semesters}
              todayWeekday={todayWeekday}
            />
          ) : null}
          {section === 'overrides' ? (
            <OverridesSection
              apiKey={apiKey}
              tz={tz}
              today={snapshotDate || initialSnapshot.date}
              rooms={rooms}
              teachers={sortedTeachers}
            />
          ) : null}
          {section === 'reference' ? (
            <ReferenceSection
              apiKey={apiKey}
              teachers={sortedTeachers}
              groups={sortedGroups}
              courses={courses}
              refresh={refreshReference}
            />
          ) : null}
          {section === 'announcements' ? <AnnouncementsSection apiKey={apiKey} tz={tz} /> : null}
        </div>
      </div>
    </main>
  );
}
