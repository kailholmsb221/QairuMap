# CampusLive — status

_Last updated: Phase 0 complete + the map-data half of Phase 1._

## Done

**Phase 0 — scaffold**

- pnpm workspace (`apps/*`, `packages/*`) + Turborepo (`build`, `dev`, `lint`, `test`, `typecheck`, `e2e`, `map:build`, `contracts:generate`). `pnpm-lock.yaml` committed.
- Root config: `package.json` (pnpm 10.28.0), `turbo.json`, `.npmrc`, `.editorconfig`, `.gitignore`, `CLAUDE.md`.
- `infra/`: `docker-compose.yml` (postgres:16-alpine with healthcheck → api → web → caddy:2), `Caddyfile` (`/api/*` → `api:8080` with `flush_interval -1` for SSE, everything else → `web:3000`), `.env.example` with every variable from ARCHITECTURE §8.5.
- `infra/scripts/demo.sh` + `clock-offset.mjs` (start the stack with `CLOCK_MODE=offset` so "now" is next Tuesday 10:47 local) and `demo-script.mjs` (cancel → move → announcement over 90 s against `API_URL`).
- `.github/workflows/ci.yml`: `api` (go vet, `go test -race`, golangci-lint), `web` (install, `map:build`, `contracts:generate`, generated-file drift check, lint, typecheck, test), `e2e` (postgres service, build, seed, Playwright).
- Placeholder multi-stage Dockerfiles: `services/api/Dockerfile` (Go 1.24 builder → distroless static) and `apps/web/Dockerfile` (node:22-alpine + corepack pnpm, Next standalone output).

**`packages/contracts` — the API contract**

- `openapi.yaml`, OpenAPI 3.1, `info.version 1.0.0`, server `http://localhost:8080`. Every path from ARCHITECTURE §9 plus `/healthz` and `/readyz`; 15 operations, all with camelCase `operationId`s; `ApiKeyAuth` (`X-Api-Key`) on the three `/admin/*` operations; ETag / `If-None-Match` / 304 on `/map` and `/board`; `/events` documented as `text/event-stream` with the `snapshot`, `announcement`, `heartbeat` event names.
- Verified three ways: `redocly lint` clean; `openapi-typescript` generates `src/types.gen.ts` (committed); `oapi-codegen -generate types,chi-server,strict-server` accepts it and the generated Go passes `go vet` and `go build`.
- `src/index.ts` re-exports `paths` / `components` / `operations` plus a named alias for every schema (`Snapshot`, `SessionView`, `MapSpec`, …) and SSE helpers.

**`packages/map-data` — geometry pipeline (Phase 1, data half)**

- `scripts/svg2map.ts` reads `svg/floor-{1..4}.svg` (ignoring the C2PA `<metadata>` block) and writes `building-a.json`, shaped exactly like the contract's `MapSpec`.
- Rooms = every `room-*` path + both cores (as `CORE-N{n}` / `CORE-S{n}`, `service` / `core` / not schedulable) + `ATRIUM` on floor 2. Room `id` = UUID v5 of `campuslive:room:{code}`, so web and DB agree before the DB exists. `bbox` from the flattened path; `label` = polygon centroid, falling back to the bbox centre for narrow or concave shapes. Corridors derived from the shared bands and clipped to the floor outline.
- Build-time validation: viewBox `0 0 600 1000`, `data-floor` / `data-building`, every path `M … Z`, room codes unique building-wide, room `type` / `wing` in the contract enums, and each floor's schedulable set equal to Appendix A.
- `schema.json` (JSON Schema 2020-12) for the artifact; `src/index.ts` typed loader with `roomsOf`, `schedulableCodes`, `findRoom`, `findRoomById`, `floorOf`, `floorOfRoom`, `allRooms`.
- 10 vitest cases: counts, uniqueness and v5 id shape, determinism, closed paths, labels inside bboxes, cores/atrium, entity decoding, schema validation, and equality with the committed JSON.

**Room totals** — 89 spaces, 41 schedulable (floor 1: 24 / 5 · floor 2: 25 / 12 · floor 3: 20 / 12 · floor 4: 20 / 12).

## Next

1. **Backend (Phase 1 → 4).** Fill `services/api`: goose migrations for ARCHITECTURE §6, sqlc queries, `internal/{domain,engine,clock,schedule,repo,httpapi,realtime,scheduler,config,seed}`, `cmd/api`, `cmd/seed` (reads `packages/map-data/building-a.json`). Generate the server types with
   `oapi-codegen -generate types,chi-server,strict-server -package httpapi ../../packages/contracts/openapi.yaml > internal/httpapi/gen.go`.
2. **Frontend (Phase 5 → 8).** Create `apps/web` (Next.js 15, Tailwind v4, `transpilePackages: ['@campuslive/contracts', '@campuslive/map-data']`, `output: 'standalone'`), then the board, the 2.5D map and the overlays.
3. Add `lint` scripts to the new packages so `pnpm lint` covers them, and Playwright config so `pnpm e2e` has something to run.

## Known issues / deliberate deviations

- **Nullable fields are plain optionals.** `RoomLiveState.freeUntil` and `Snapshot.nextTransitionAt` are documented as nullable but typed `string` rather than `["string","null"]`: oapi-codegen cannot yet generate OpenAPI 3.1 type unions (it fails with `unhandled Schema type`). Go emits a nil pointer / JSON `null`; TypeScript sees the field as optional. Revisit when oapi-codegen supports 3.1 unions.
- **oapi-codegen prints a 3.1 warning.** Generation succeeds and the output compiles, but the tool still warns that 3.1 is not fully supported. The spec deliberately avoids `oneOf`, `anyOf`, `const` and other 3.1-only constructs so it stays generatable.
- **89 rooms, not "~85".** ARCHITECTURE §13 estimates ~85; the actual geometry from `docs/design/src/geometry.mjs` yields 89 spaces, because floors 3 and 4 each carry two `TECH-*` service rooms that Appendix A summarises rather than lists. The schedulable count is exactly the specified 41 (5 / 12 / 12 / 12).
- **`pnpm seed`, `pnpm dev` and `pnpm e2e` are wired but have nothing to run yet** — `services/api` holds only `go.mod` and the Dockerfile, `apps/web` only the Dockerfile.
- **`services/api/go.sum` does not exist yet**, so the CI Go cache key (`cache-dependency-path: services/api/go.sum`) warns until the backend engineer adds the first dependency.
- `docker-compose.yml` gives the api container a `-healthcheck` flag; `cmd/api` must implement it (or the healthcheck should be dropped).

---

# Backend — `services/api` (Phases 1–4 complete)

_Added by the backend engineer. Everything below concerns `services/api` only;
`apps/`, `packages/` and the root config were not touched._

## Done

**Migrations & data access**

- `migrations/0001_init.sql` — the full ARCHITECTURE §6 schema as one goose
  migration (`create extension pgcrypto`, `buildings`, `floors`, `room_type` /
  `wing` enums, `rooms` with `geometry jsonb`, `teachers`, `student_groups`,
  `courses`, `semesters`, `time_slots`, `lesson_type` / `week_parity` enums,
  `lessons`, `lesson_groups`, `override_kind`, `session_overrides`,
  `announcements`) plus a complete `Down`. Embedded via `migrations/embed.go`,
  applied by `cmd/api` when `MIGRATE_ON_START=true` and by `cmd/seed` always.
- `sqlc.yaml` + `internal/repo/queries/{buildings,schedule,search,seed}.sql` →
  committed `internal/repo/gen`. `internal/repo` wraps them and hands the rest
  of the service plain `internal/domain` values; it is the only package that
  knows pgx exists.

**Engine and clock**

- `internal/clock` — `Clock` / `Real` / `Fixed` / `Offset` / `FromEnv`.
  `time.Now()` appears in exactly one place in the repository:
  `clock.Real.Now`. 100 % coverage.
- `internal/domain` — pure types (`Date`, `TimeOfDay`, `Session`, `Snapshot`, …).
- `internal/engine` — `WeekInfo`, `BuildDayTimeline`, `ComputeSnapshot`,
  `PhaseOf`, `nextTransitionAt`; no I/O at all. **98.0 % coverage**, table-driven
  tests plus five golden fixtures in `internal/engine/testdata/`
  (`go test ./internal/engine -update` rewrites them). The day-walk test steps
  through a whole simulated day one minute at a time and proves that the board's
  phases cannot change before the `nextTransitionAt` the engine promised.

**Demo data**

- `internal/seed` — deterministic generator (`math/rand`, seed 42; no map is
  ever ranged over while generating). Building A, 4 floors, all 89 rooms with
  the ids from `building-a.json`, 40 teachers, 30 groups, 50 courses, 10 slots,
  semester "Fall 2026" (2026-08-24 → 2026-12-20, week 1 odd → 8 Sep 2026 is
  week 3 · odd), 1 388 lessons, 40 overrides, 3 announcements.
- Every hero row of `docs/design/src/states.mjs` exists on Tuesday, the themed
  laboratories only teach their own subjects, the Assembly Hall gets one weekly
  Open Lecture (Thu 14:00, two slots), and every weekday of the seeded fortnight
  carries two cancellations, a move and a delay.
- `internal/schedule` — `ScheduleSource` (§17) with `SeedSource`; `cmd/seed`
  (`--reset`) is a thin wrapper around it.

**API, realtime, scheduler**

- `internal/httpapi` — `gen.go` from `oapi-codegen` (types + chi-server +
  strict-server + embedded spec, committed, `go:generate` line in `server.go`),
  strict handlers for all 15 operations, the single error envelope, strong
  `ETag` (sha256 of the body) with `304` on `/map` and `/board`, CORS allow
  list, `X-Api-Key` + per-IP token bucket on `/admin/*`, `slog` JSON access log,
  request timeouts, panic recovery, `/healthz`, `/readyz`.
- `internal/service.Board` — per-building cache of `{timeline, snapshot}` for
  the current local date; `?at=` recomputes without touching it (time travel).
- `internal/realtime` — SSE broker, hub per building, 16-message buffer, slow
  clients dropped, `heartbeat` every 25 s, snapshot replayed on subscribe,
  `announcement` events, `X-Accel-Buffering: no`, flush after every event, 20
  streams per IP.
- `internal/scheduler` — sleeps until `nextTransitionAt` (capped at 5 min),
  rebuilds, broadcasts; admin writes poke its `invalidate` channel.
- `cmd/api` — env config, `-healthcheck` flag for the compose probe, graceful
  shutdown.

## Quality gates (all green)

| Gate | Result |
|---|---|
| `go build ./... && go vet ./...` | clean |
| `golangci-lint run ./...` (v2 config, `.golangci.yml`) | `0 issues` |
| `go test -race -cover ./...` | all packages pass |
| `internal/engine` coverage | **98.0 %** (target ≥ 95 %) |
| `internal/clock` / `internal/realtime` coverage | 100 % / 94.4 % |
| `internal/httpapi` coverage | 72.7 % (contract + SSE tests) |
| Seed | 89 rooms (41 schedulable), 1 388 lessons, 40 overrides |
| Board at the hero instant | Tue 8 Sep 2026 10:47, week 3 · odd, 25/41 rooms busy, NOW 25, NEXT 48 |
| SSE | a new `snapshot` reaches an open stream ~20 ms after `POST /admin/overrides` |

## Deliberate deviations

1. **No `testcontainers-go`.** ARCHITECTURE §14 names it, but this environment
   has no Docker daemon and the dependency tree is unreachable. The integration
   and contract tests connect to `TEST_DATABASE_URL` and `t.Skip` when it is
   unset. `make test-all` runs them; CI can point the variable at its
   `postgres` service. The tests truncate and reseed that database.
2. **`lessons.slot_span smallint not null default 1 check (slot_span in (1,2))`**
   added to the §6 schema, so 100-minute lectures exist (the design shows CS201
   10:00–11:50). The engine ends a session at the end of slot `idx+span-1`.
3. **`session_override_groups` table added.** The contract's `extra` override
   carries `groupCodes` and §6 has nowhere to store them.
4. **Instantaneous occupancy is 25–29 of 41 rooms, ~62 % across the day**, not a
   flat 70 %. With exactly 30 student groups no more than 30 rooms can be busy
   at once, and multi-group lectures push that lower; the design's own numbers
   (28 at 10:47, 31 at 14:05) are not reachable with 30 groups. The generator
   shapes the day so the mid-morning peak is full and the edges thin out.
5. **`nextTransitionAt` follows §7.2 literally** — the minimum of
   `{start−Soon, start, end−Ending, end}`. Entering the 90-minute NEXT horizon
   is *not* a boundary, so a row can appear in NEXT up to one scheduler tick
   (≤ 5 min) late. Phases, room states and the NOW list are exact; the day-walk
   test asserts precisely that split.
6. **Contract tests strip the 3.1 `examples` keyword before validating.**
   `kin-openapi` v0.132 models only 3.0's singular `example` and rejects
   `examples` as an unknown sibling field. The document is round-tripped with
   that key removed; every schema the responses are checked against is
   otherwise the one in `openapi.yaml`. (`redocly lint` still lints the file.)
7. **A `?date=` outside every semester still answers.** `SemesterForDate` falls
   back to the nearest semester rather than 404, so the scrubber never breaks.
8. **Announcement #3 is invented.** `HERO_TICKER` holds only two informational
   lines that are not derived from an override (the open lecture and the
   library); the third seeded line is a building-hours line taken from the
   after-hours state.
9. **Several overrides on one session** are applied in creation order and the
   resulting `status` follows the precedence `cancelled > moved > delayed`,
   because the contract's `SessionStatus` holds a single value.
10. **`/map` room order follows `building-a.json`.** Room attributes and
    geometry come from the `rooms` table; the floor-level geometry and the room
    order come from the file, so the payload is interchangeable with it
    (verified: the served document and `building-a.json` are structurally
    identical).
11. **Request durations and the admin rate limit use real wall time** via
    `clock.Stopwatch` / `clock.WallNow`, which live inside `internal/clock` and
    call `Real{}.Now()`. A frozen demo clock must not report every request as
    instantaneous or stop refilling a token bucket.
12. **`services/api/Dockerfile` now sets `MAP_DATA_PATH`** (the old
    `MAP_SPEC_PATH` is still accepted as an alias) and no longer copies
    `migrations/`, which are embedded in both binaries.

## Notes for the other engineers

- `services/api/go.sum` now exists, so the CI Go cache key resolves.
- `cmd/api -healthcheck` is implemented, so `infra/docker-compose.yml`'s
  healthcheck works as written.
- `pnpm seed` can now run `go run ./cmd/seed --reset` from `services/api`.
- The SSE payload and the `/board` body are produced by the same function, so a
  client can treat them interchangeably.
