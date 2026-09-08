/**
 * The `/admin/*` half of the contract, keyed by an `X-Api-Key` the caller passes
 * in. Every payload type comes from `@campuslive/contracts` — nothing here is a
 * hand-written DTO.
 */
import {
  API_KEY_HEADER,
  type Announcement,
  type AnnouncementRequest,
  type CourseCreate,
  type CourseUpdate,
  type GroupCreate,
  type GroupUpdate,
  type Lesson,
  type LessonCreate,
  type LessonList,
  type LessonUpdate,
  type Override,
  type OverrideList,
  type OverrideRequest,
  type SearchCourse,
  type SearchGroup,
  type TeacherCreate,
  type TeacherRef,
  type TeacherUpdate,
} from '@campuslive/contracts';
import { apiBase, request } from './client';

/**
 * Where the panel's admin calls go.
 *
 * On the server: straight at the Go service. In the browser: at this app's own
 * `/admin-api/*` route, because the service's CORS allow-list is
 * `GET, POST, DELETE, OPTIONS` and every edit in the panel is a `PATCH`. The
 * route forwards the caller's `X-Api-Key` untouched, so nothing is gained by
 * going through it except passing the preflight.
 */
export function adminBase(): string {
  return typeof window === 'undefined'
    ? `${apiBase()}/api/v1/admin`
    : `${window.location.origin}/admin-api`;
}

type Query = Record<string, string | number | undefined | null>;

/** `sub` is the path below `/admin`, e.g. `lessons` or `teachers/{id}`. */
function adminRequest<T>(sub: string, query?: Query, init?: RequestInit): Promise<T> {
  const base = adminBase();
  return request<T>(`${base}/${sub}`, query, init, base);
}

export type LessonFilter = {
  semesterId?: string;
  weekday?: number;
  roomCode?: string;
  teacherId?: string;
  groupCode?: string;
};

function auth(key: string, json = false): HeadersInit {
  return json
    ? { [API_KEY_HEADER]: key, 'Content-Type': 'application/json' }
    : { [API_KEY_HEADER]: key };
}

const post = <T>(key: string, sub: string, body: unknown) =>
  adminRequest<T>(sub, undefined, {
    method: 'POST',
    headers: auth(key, true),
    body: JSON.stringify(body),
  });

const patch = <T>(key: string, sub: string, body: unknown) =>
  adminRequest<T>(sub, undefined, {
    method: 'PATCH',
    headers: auth(key, true),
    body: JSON.stringify(body),
  });

const del = (key: string, sub: string) =>
  adminRequest<void>(sub, undefined, { method: 'DELETE', headers: auth(key) });

const id = (v: string) => encodeURIComponent(v);

export const adminApi = {
  /* ------------------------------------------------------------- lessons -- */

  listLessons: (key: string, filter: LessonFilter = {}) =>
    adminRequest<LessonList>('lessons', { ...filter }, { headers: auth(key) }),

  createLesson: (key: string, body: LessonCreate) =>
    post<Lesson>(key, 'lessons', body),

  updateLesson: (key: string, lessonId: string, body: LessonUpdate) =>
    patch<Lesson>(key, `lessons/${id(lessonId)}`, body),

  deleteLesson: (key: string, lessonId: string) =>
    del(key, `lessons/${id(lessonId)}`),

  /* ----------------------------------------------------------- overrides -- */

  listOverrides: (key: string, date?: string) =>
    adminRequest<OverrideList>('overrides', { date }, { headers: auth(key) }),

  createOverride: (key: string, body: OverrideRequest) =>
    post<Override>(key, 'overrides', body),

  deleteOverride: (key: string, overrideId: string) =>
    del(key, `overrides/${id(overrideId)}`),

  /* --------------------------------------------------------- announcement -- */

  announce: (key: string, body: AnnouncementRequest) =>
    post<Announcement>(key, 'announcements', body),

  /* ------------------------------------------------------------ reference -- */

  createTeacher: (key: string, body: TeacherCreate) =>
    post<TeacherRef>(key, 'teachers', body),

  updateTeacher: (key: string, teacherId: string, body: TeacherUpdate) =>
    patch<TeacherRef>(key, `teachers/${id(teacherId)}`, body),

  deleteTeacher: (key: string, teacherId: string) =>
    del(key, `teachers/${id(teacherId)}`),

  createGroup: (key: string, body: GroupCreate) =>
    post<SearchGroup>(key, 'groups', body),

  updateGroup: (key: string, groupId: string, body: GroupUpdate) =>
    patch<SearchGroup>(key, `groups/${id(groupId)}`, body),

  deleteGroup: (key: string, groupId: string) =>
    del(key, `groups/${id(groupId)}`),

  createCourse: (key: string, body: CourseCreate) =>
    post<SearchCourse>(key, 'courses', body),

  updateCourse: (key: string, courseId: string, body: CourseUpdate) =>
    patch<SearchCourse>(key, `courses/${id(courseId)}`, body),

  deleteCourse: (key: string, courseId: string) =>
    del(key, `courses/${id(courseId)}`),
};
