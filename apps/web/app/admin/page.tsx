import type {
  CourseList,
  GroupList,
  MapSpec,
  RoomList,
  SemesterList,
  SlotList,
  Snapshot,
  TeacherList,
  TimeInfo,
} from '@campuslive/contracts';
import { spec as staticSpec } from '@campuslive/map-data';
import { AdminApp } from '@/components/admin/AdminApp';
import { isoWeekday } from '@/features/admin/grid';
import { apiBase } from '@/lib/api/client';
import { emptySnapshot } from '@/lib/snapshot';

export const dynamic = 'force-dynamic';

const BUILDING = 'A';

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * The admin panel's reference data is public, so it is fetched on the server and
 * the first frame already has the pickers filled. The lessons themselves need the
 * `X-Api-Key`, which lives in the browser, so `AdminApp` loads those itself.
 */
export default async function AdminPage() {
  const [board, time, rooms, slots, teachers, groups, courses, semesters, map] = await Promise.all([
    getJson<Snapshot>(`/api/v1/buildings/${BUILDING}/board`),
    getJson<TimeInfo>('/api/v1/time'),
    getJson<RoomList>(`/api/v1/buildings/${BUILDING}/rooms`),
    getJson<SlotList>(`/api/v1/buildings/${BUILDING}/slots`),
    getJson<TeacherList>('/api/v1/teachers'),
    getJson<GroupList>('/api/v1/groups'),
    getJson<CourseList>('/api/v1/courses'),
    getJson<SemesterList>('/api/v1/semesters'),
    getJson<MapSpec>(`/api/v1/buildings/${BUILDING}/map`),
  ]);

  const snapshot = board ?? emptySnapshot(BUILDING);
  const tz = map?.timezone || staticSpec.timezone || 'Asia/Almaty';

  return (
    <AdminApp
      initialSnapshot={snapshot}
      initialTime={time?.now ?? snapshot.at}
      tz={tz}
      apiDown={board === null}
      rooms={rooms?.rooms ?? []}
      slots={slots?.slots ?? []}
      teachers={teachers?.teachers ?? []}
      groups={groups?.groups ?? []}
      courses={courses?.courses ?? []}
      semesters={semesters?.semesters ?? []}
      todayWeekday={isoWeekday(snapshot.date)}
    />
  );
}
