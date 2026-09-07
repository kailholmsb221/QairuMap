/**
 * `@campuslive/contracts` — the single source of truth for the CampusLive HTTP API.
 *
 * `openapi.yaml` is authored by hand; `src/types.gen.ts` is produced from it by
 * `pnpm --filter @campuslive/contracts run generate` (openapi-typescript) and is
 * committed, so consumers never need to run a build first. The Go server generates
 * its own types from the same file with `oapi-codegen`.
 *
 * Never hand-write a DTO on either side — regenerate instead.
 */

export type { components, paths, operations, webhooks, $defs } from './types.gen.js';

import type { components, operations } from './types.gen.js';

type S = components['schemas'];

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/** `{ error: { code, message } }` — the envelope of every non-2xx response. */
export type ApiError = S['Error'];
/** The `error` member of {@link ApiError}. */
export type ApiErrorBody = S['ErrorBody'];
/** Stable machine-readable error codes. */
export type ApiErrorCode = S['ErrorBody']['code'];

/* -------------------------------------------------------------------------- */
/* Vocabulary (string enums)                                                  */
/* -------------------------------------------------------------------------- */

export type RoomType = S['RoomType'];
export type Wing = S['Wing'];
export type LessonType = S['LessonType'];
export type SessionStatus = S['SessionStatus'];
export type Phase = S['Phase'];
export type RoomPhase = S['RoomPhase'];
export type OverrideKind = S['OverrideKind'];
export type Severity = S['Severity'];
export type ClockMode = S['ClockMode'];
export type WeekParity = S['WeekParity'];

/* -------------------------------------------------------------------------- */
/* Geometry (`GET /buildings/{code}/map`, `packages/map-data/building-a.json`) */
/* -------------------------------------------------------------------------- */

export type Building = S['Building'];
export type BBox = S['BBox'];
export type Point = S['Point'];
export type MapRoom = S['MapRoom'];
export type MapZone = S['MapZone'];
export type MapCore = S['MapCore'];
export type MapLandmark = S['MapLandmark'];
export type MapEntrance = S['MapEntrance'];
export type MapFloor = S['MapFloor'];
export type MapSpec = S['MapSpec'];

/* -------------------------------------------------------------------------- */
/* Board                                                                      */
/* -------------------------------------------------------------------------- */

export type TeacherRef = S['TeacherRef'];
export type SessionView = S['SessionView'];
export type RoomLiveState = S['RoomLiveState'];
export type Stats = S['Stats'];
export type Snapshot = S['Snapshot'];
export type Timeline = S['Timeline'];
export type DaySessions = S['DaySessions'];

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

export type SearchTeacher = S['SearchTeacher'];
export type SearchGroup = S['SearchGroup'];
export type SearchRoom = S['SearchRoom'];
export type SearchCourse = S['SearchCourse'];
export type SearchResult = S['SearchResult'];

/* -------------------------------------------------------------------------- */
/* Clock, admin, ops                                                          */
/* -------------------------------------------------------------------------- */

export type TimeInfo = S['TimeInfo'];
export type OverrideRequest = S['OverrideRequest'];
export type Override = S['Override'];
export type AnnouncementRequest = S['AnnouncementRequest'];
export type Announcement = S['Announcement'];
export type Health = S['Health'];
export type Ready = S['Ready'];

/* -------------------------------------------------------------------------- */
/* Realtime                                                                   */
/* -------------------------------------------------------------------------- */

/** Names of the events carried by `GET /api/v1/events`. */
export const SSE_EVENTS = ['snapshot', 'announcement', 'heartbeat'] as const;
export type SseEventName = (typeof SSE_EVENTS)[number];

/** Payload of the `heartbeat` SSE event. */
export type Heartbeat = { at: string };

/** Discriminated union of everything that can arrive on the SSE stream. */
export type SseEvent =
  | { event: 'snapshot'; data: Snapshot }
  | { event: 'announcement'; data: Announcement }
  | { event: 'heartbeat'; data: Heartbeat };

/* -------------------------------------------------------------------------- */
/* Operation helpers                                                          */
/* -------------------------------------------------------------------------- */

/** Every `operationId` in the contract. */
export type OperationId = keyof operations;

/** Query parameters of one operation, e.g. `OperationQuery<'getBoard'>`. */
export type OperationQuery<Id extends OperationId> = operations[Id]['parameters']['query'];

/** Path parameters of one operation, e.g. `OperationPath<'getRoomDay'>`. */
export type OperationPath<Id extends OperationId> = operations[Id]['parameters']['path'];

/** Header name carrying the admin key on the three `/admin/*` operations. */
export const API_KEY_HEADER = 'X-Api-Key';

/** Every `RoomType` that may ever carry a lesson. */
export const SCHEDULABLE_ROOM_TYPES = ['lecture', 'seminar', 'lab', 'coworking'] as const;
