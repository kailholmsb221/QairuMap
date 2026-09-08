/**
 * Typed fetch wrapper over the generated `paths` of `@campuslive/contracts`.
 * Every response type is derived from the contract — no hand-written DTOs.
 */
import type {
  Announcement,
  AnnouncementRequest,
  Override,
  OverrideRequest,
  paths,
} from '@campuslive/contracts';

type JsonOf<R> = R extends { content: { 'application/json': infer T } } ? T : never;

type GetOk<P extends keyof paths> = paths[P] extends {
  get: { responses: { 200: infer R } };
}
  ? JsonOf<R>
  : never;

export const DEFAULT_API_URL = 'http://localhost:8080';

/** Base URL of the Go API. Server components read `API_URL`, the browser `NEXT_PUBLIC_API_URL`. */
export function apiBase(): string {
  if (typeof window === 'undefined') {
    return process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
  }
  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
}

export function adminKey(): string {
  return process.env.NEXT_PUBLIC_ADMIN_API_KEY || 'dev-admin-key';
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type Query = Record<string, string | number | undefined | null>;

export function url(path: string, query?: Query, base = apiBase()): string {
  const u = new URL(path, base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

export async function request<T>(
  path: string,
  query?: Query,
  init?: RequestInit,
  base?: string,
): Promise<T> {
  const res = await fetch(url(path, query, base ?? apiBase()), {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    let code = 'internal';
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      /* non-JSON error body — keep the status line */
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ reads -- */

export const api = {
  map: (building = 'A') =>
    request<GetOk<'/api/v1/buildings/{code}/map'>>(`/api/v1/buildings/${building}/map`),

  board: (building = 'A', query?: { at?: string; date?: string }) =>
    request<GetOk<'/api/v1/buildings/{code}/board'>>(`/api/v1/buildings/${building}/board`, query),

  timeline: (building = 'A', date?: string) =>
    request<GetOk<'/api/v1/buildings/{code}/timeline'>>(
      `/api/v1/buildings/${building}/timeline`,
      { date },
    ),

  roomDay: (code: string, date?: string) =>
    request<GetOk<'/api/v1/rooms/{code}/day'>>(
      `/api/v1/rooms/${encodeURIComponent(code)}/day`,
      { date },
    ),

  teacherDay: (id: string, date?: string) =>
    request<GetOk<'/api/v1/teachers/{id}/day'>>(
      `/api/v1/teachers/${encodeURIComponent(id)}/day`,
      { date },
    ),

  groupDay: (code: string, date?: string) =>
    request<GetOk<'/api/v1/groups/{code}/day'>>(
      `/api/v1/groups/${encodeURIComponent(code)}/day`,
      { date },
    ),

  search: (q: string, limit?: number) =>
    request<GetOk<'/api/v1/search'>>('/api/v1/search', { q, limit }),

  /* ------------------------------------------------- reference data (public) */

  rooms: (building = 'A') =>
    request<GetOk<'/api/v1/buildings/{code}/rooms'>>(`/api/v1/buildings/${building}/rooms`),

  slots: (building = 'A') =>
    request<GetOk<'/api/v1/buildings/{code}/slots'>>(`/api/v1/buildings/${building}/slots`),

  teachers: () => request<GetOk<'/api/v1/teachers'>>('/api/v1/teachers'),

  groups: () => request<GetOk<'/api/v1/groups'>>('/api/v1/groups'),

  courses: () => request<GetOk<'/api/v1/courses'>>('/api/v1/courses'),

  semesters: () => request<GetOk<'/api/v1/semesters'>>('/api/v1/semesters'),

  time: () => request<GetOk<'/api/v1/time'>>('/api/v1/time'),

  /* ---------------------------------------------------------------- admin -- */

  createOverride: (body: OverrideRequest) =>
    request<Override>('/api/v1/admin/overrides', undefined, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': adminKey() },
      body: JSON.stringify(body),
    }),

  deleteOverride: (id: string) =>
    request<void>(`/api/v1/admin/overrides/${encodeURIComponent(id)}`, undefined, {
      method: 'DELETE',
      headers: { 'X-Api-Key': adminKey() },
    }),

  announce: (body: AnnouncementRequest) =>
    request<Announcement>('/api/v1/admin/announcements', undefined, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': adminKey() },
      body: JSON.stringify(body),
    }),
};

/** SSE endpoint — `EventSource` needs the absolute URL, not a fetch. */
export function eventsUrl(building = 'A'): string {
  return url('/api/v1/events', { building });
}
