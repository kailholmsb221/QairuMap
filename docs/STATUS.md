# CampusLive — status

## Photo Map Update (2026-09-10)

The two supplied photographs now sit on the original animated 2.5D slabs.
Search, focus, room details, two floors and live schedule integration remain;
only presentation geometry and protected room coloring changed. The exterior
photo background is clipped, with original captions shown only in focus.
See [the verification record](screenshots/photo-map/README.md) for source-scale
50% overlays, actual application screenshots and the focused regression tests.

Follow-up: replaced the low-resolution first-floor image with the supplied HD
source (lossless rotation to 1448x1086). Libraries 102/102A, CR, Cinema and the
first-floor WCs are passive on the map. CR is no longer schedulable; its existing
44 lesson templates were preserved but excluded from the active timeline.

**All ten phases (0–9) are complete, and the project has since been rebuilt
around the university's real building.** The stack builds, seeds, runs and is
covered end to end; `README.md` has the screenshots and the run instructions.

> **Second pass — the real building.** The four invented floors were replaced by
> the two real ones traced from the university's own floor plans, with the real
> room numbering and names (`docs/BUILDING.md`), the five real first-year
> subjects, placeholder `Преподаватель N` / `Группа N` rosters, and a full
> **admin panel at `/admin`** for creating and changing classes live. The design
> of the board, the map and every existing state is unchanged. The three
> sections at the bottom of this file record that work.

| # | Phase | State |
|---|---|---|
| 0 | Scaffold, contract, CI | ✅ |
| 1 | Data — migrations, sqlc, map-data pipeline, seed | ✅ |
| 2 | Engine + clock (98 % coverage) | ✅ |
| 3 | REST API + contract tests + ETag | ✅ |
| 4 | Realtime — broker, scheduler, admin overrides | ✅ |
| 5 | Screen shell — layout, header, board, ticker, i18n | ✅ |
| 6 | 2.5D map — scene, plates, rooms, focus, detail panel | ✅ |
| 7 | Interaction — search, highlight, time travel, a11y | ✅ |
| 8 | Kiosk + demo scripts | ✅ |
| 9 | Polish — states, README, screenshots, deploy config | ✅ |

The three sections below are the per-area records, written as each area landed.

---

# Scaffold, contract and map-data (Phase 0 + the data half of Phase 1)

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

## Known issues / deliberate deviations

- **Nullable fields are plain optionals.** `RoomLiveState.freeUntil` and `Snapshot.nextTransitionAt` are documented as nullable but typed `string` rather than `["string","null"]`: oapi-codegen cannot yet generate OpenAPI 3.1 type unions (it fails with `unhandled Schema type`). Go emits a nil pointer / JSON `null`; TypeScript sees the field as optional. Revisit when oapi-codegen supports 3.1 unions.
- **oapi-codegen prints a 3.1 warning.** Generation succeeds and the output compiles, but the tool still warns that 3.1 is not fully supported. The spec deliberately avoids `oneOf`, `anyOf`, `const` and other 3.1-only constructs so it stays generatable.
- **89 rooms, not "~85".** ARCHITECTURE §13 estimates ~85; the actual geometry from `docs/design/src/geometry.mjs` yields 89 spaces, because floors 3 and 4 each carry two `TECH-*` service rooms that Appendix A summarises rather than lists. The schedulable count is exactly the specified 41 (5 / 12 / 12 / 12).
- ~~`pnpm seed` / `pnpm dev` / `pnpm e2e` have nothing to run yet~~ — resolved: both halves shipped.
- ~~`services/api/go.sum` does not exist~~ / ~~`cmd/api` must implement `-healthcheck`~~ — both resolved by the backend.

---

---

# Backend — `services/api` (Phases 1–4)

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

---

# Frontend — `apps/web` (Phases 5–9)

## Done

**Shell and layout**

- Next.js 15.5 App Router, React 19, TypeScript strict, Tailwind CSS v4 (`@tailwindcss/postcss`), `output: 'standalone'`, `transpilePackages` for both workspace packages. Manrope + JetBrains Mono are self-hosted (`public/fonts`, `app/fonts.css`) so the build needs no network.
- `app/globals.css` carries every token from `docs/design/tokens.css` plus the layout metrics as CSS variables. `features/metrics/useViewportMetrics.ts` re-values them per breakpoint: the design's `M720` table below 1536 px, `M1080` up to 2560, then a proportional scale up to 4K. Nothing in the tree reads a pixel constant directly.
- `app/(main)/page.tsx` is a Server Component: it fetches `/map` and `/board` on the server, so the first paint is already live data. If the API is unreachable at SSR it falls back to the static `@campuslive/map-data` spec and boots straight into the API-down state instead of a blank screen.
- Grid is `100dvh` / `overflow: hidden` / `64px 1fr 40px` × `1fr 560px`. Below 1024 px map and board become tabs. Verified by Playwright at 1280×720, 1920×1080, 2560×1440 and 3840×2160.

**Board**

- Two-line rows exactly as the design draws them: `SplitFlap(time) · SplitFlap(room) · course code + title (+ ⚠ on conflict) / teacher · groups · → end` and a status pill. Seven pill kinds (`LIVE`, `ENDS n MIN`, `IN n MIN`, `STARTS hh:mm`, `CANCELLED` with a struck title, `MOVED → room`, `DELAYED +n`); a moved row keeps the original room in the flap.
- `SplitFlap` flips each cell in two `rotateX` halves, 90 ms per half, staggered 25 ms, capped at 40 simultaneous cells (beyond that it fades). `useAutoFitRows` measures with a `ResizeObserver` and `splitRows` divides the height between the sections; `usePager` rotates pages every 8 s and pauses while the pointer is over the board.
- Rows enter/leave with `AnimatePresence mode="popLayout"`; a session crossing from NEXT to NOW keeps its `layoutId` and slides between the sections. Rows are subscribed per `sessionId`, so the 1 Hz clock tick only re-renders the rows that show a countdown.

**2.5D map**

- `Scene` is a `motion.div` at `perspective: 2200px` with `rotateX`/`rotateZ` on springs (`stiffness 120, damping 18`); the exploded default is `rotateX(58°) rotateZ(-38°)` with plates 118 px apart on Z and a darker under-slab 6 px below each. The fit-to-stage projection is a direct port of the design's `projector()`, which is also what positions the `F1 · 3 busy` labels and the search badges.
- Focus view ports `focusScene()`: the plate lies flat turned −90°, the floor below shows through as a 7 % ghost, and every schedulable room gets a chip (code, course, countdown, progress arc) that goes compact under 118 px of screen width.
- `FloorPlan` (slab, zone tints, corridors, core stair/lift glyphs, entrances, atrium void with its bridge, lit top edge) is memoised and never re-renders on a tick. `RoomShape` is a focusable `<path role="button">` with a full `aria-label`; phase fills, the 1 Hz `soon` blink, the live pulse dot, the conflict hatch and the dashed void all come from the design's `roomFill()`. Glow is a second stroked path — the only `filter` in the app is one `drop-shadow` on the single focused plate.
- Parallax tilts ±2.5° on a slow spring, off in kiosk mode and under `prefers-reduced-motion`. Geometry is read only from `/map` (or the static spec) — no coordinate is written in the components.

**Overlays, interaction, states**

- `RoomDetailPanel` (420 px glass card, live block with progress and teacher, next three sessions from `/rooms/{code}/day`, "Show on map" / "Full day"), `SearchPalette` (⌘K via `cmdk`, four result groups, selection badges the rooms and filters the board), `TimeTravelBar` (4 px line → 96 px day timeline with slot ticks and an occupancy heat strip from `/timeline`; drag or arrow keys scrub, debounced 120 ms, `SIMULATED` tag, `LIVE` returns), `DemoAdminPanel` (cancel / move / delay / reassign / announce against the admin API, with undo).
- `useRealtime` wraps `EventSource` behind a `RealtimeClient` interface: `snapshot` → store, `announcement` → ticker, no `heartbeat` for 30 s → `reconnecting`, reconnect → one `/board` refetch. Travel mode ignores SSE snapshots and re-applies the last live one when you press `LIVE`.
- Every state in the design is implemented: live, travel, after-hours (dim map, lit entrances, "next class" card), reconnecting (`stale · n s` badge, board intact), API down (error card with a 12 s retry countdown), plus `/kiosk` with the ring-progress floor indicator and self-rotating focus and pages.
- i18n is `next-intl` with a cookie locale (no URL prefix) and a server action to switch — `/` and `/kiosk` keep stable URLs. `ru`, `kk`, `en` are complete. Light theme is the same token set re-valued under `:root[data-theme='light']`.

## Quality gates (all green)

| Gate | Result |
|---|---|
| `pnpm lint` (eslint 9, next config) | clean |
| `pnpm typecheck` (`tsc --noEmit`, strict) | clean |
| `pnpm test` (vitest) | 91 tests / 9 files |
| `pnpm build` | main route **233 kB** first-load JS (budget 300 kB), `/admin` 147 kB, kiosk 220 kB |
| `pnpm e2e` (Playwright, `CLOCK_MODE=fixed`) | 24 / 24 |

Unit tests cover `deriveProgress` / `formatCountdown` / `formatHm`, `usePager`, `useAutoFitRows` (mocked `ResizeObserver`), the board selectors (pill kind, display room, room phase, floor busy counts, highlight matching), `boardStore` (SSE ignored while travelling), `SplitFlap` and `BoardRow` in all seven statuses, plus the admin panel's grid placement (`buildGridIndex`, span coverage, parity sharing, natural ordering, `isoWeekday`), its conflict-message → field mapping, and the api-key hook (env vs. stored precedence, `localStorage` that throws, a remembered `401`).

E2E covers: no page scroll at four viewports plus `/kiosk`, and no *horizontal* scroll on `/admin` at the same four; an admin cancel reaching an open board over SSE in well under a second with no navigation, then recovering when the override is deleted; the connection dot; searching `Группа 13` badging room `101`, dimming the rest to 0.35 and filtering the board, then restoring on Escape; ⌘K; floor tab 2 → focus → room `226` → detail panel; room keyboard reachability and `aria-label`s; the board's table semantics; time travel entering and leaving simulated mode; the kiosk rotating floors and pages; two masked visual snapshots (main, focus) re-recorded for the two-floor building; and the admin panel — the 13-room grid, a class created in a free cell showing up in the grid *and* on the board of another tab with no reload and then disappearing when deleted, a `400` printed against the field that caused it, a rejected key reported instead of failing silently, the rename of a placeholder teacher, the honest `409` on deleting a group that is still enrolled, and the way in from the ticker.

`pnpm --filter web shots` regenerates the ten documentation screenshots in `docs/screenshots/` (`10-admin.png` is the new one).

## Deliberate deviations

1. **`next start` warns about `output: 'standalone'`.** It still serves correctly, and Playwright's `webServer` uses it; production containers run `node .next/standalone/server.js`, which is what `apps/web/Dockerfile` does.
2. **The e2e base URL is `localhost`, not `127.0.0.1`.** The API's CORS allow-list is an exact origin match and `infra/.env.example` ships `CORS_ORIGINS=http://localhost:3000`; using the loopback IP silently broke every client fetch. Noted in `playwright.config.ts`.
3. **The realtime and search e2e scenarios pin the board with a filter first.** The board legitimately paginates every 8 s, so a row for one specific room is not reliably on screen. Filtering is the user-facing way to hold it there and is itself part of the assertion. Row counts after a filter are polled rather than read once, because leaving rows stay mounted for their 300 ms exit animation.
4. **The after-hours screenshot scrubs the day slider with the keyboard** (`role="slider"` + `ArrowRight`) instead of a synthetic pointer drag — the drag was flaky at the track's far edge and the keyboard path is a real a11y affordance that deserves the coverage.
5. **No Lighthouse run.** This sandbox has no Chrome-with-devtools-protocol budget for it; the underlying targets are met by construction (SSR first paint, 233 kB JS, `aria-label`s on every interactive element, ≥ 4.5:1 status contrast, motion limited to `transform`/`opacity`), but the score itself is unverified.
6. **More `ending` (orange) rooms than the design's hero.** At the demo instant 10:47 most seeded classes are in their last five minutes, which is exactly what the engine should say; the design's mock hand-picked a livelier mix. The map and board are both correct — the difference is data, not styling.
7. **Admin writes go through `/admin-api/*` on the app's own origin.** The Go service's CORS allow-list is `GET, POST, DELETE, OPTIONS`, so a browser `PATCH` — how the panel edits a lesson and renames a placeholder — never gets past the preflight. `apps/web/app/admin-api/[...path]/route.ts` forwards the caller's `X-Api-Key` unchanged and injects nothing, so it grants no privileges of its own; an unauthenticated request still comes back as the API's own `401`. The path is `/admin-api/*` rather than `/api/*` because `infra/Caddyfile` routes `/api/*` straight to the service. The clean fix is one line in the service's CORS methods, after which this route can go.
8. **`playwright.config.ts`'s `webServer` now runs `pnpm exec next start`.** `pnpm run start -- --port` forwarded the `--` to `next start`, which read it as a project directory and refused to boot; the suite only ever passed because a server was already listening.

## Notes

- `turbo.json` now carries `@campuslive/map-data#build` and `@campuslive/contracts#build` overrides so their artifacts are cached rather than warned about.
- `.github/workflows/ci.yml`: the Phase-0 "detect sources" guards are gone, and the `e2e` job now builds and starts `cmd/api` (with `CORS_ORIGINS` and the fixed clock) and waits on `/readyz` before Playwright runs.

---

# Frontend — the real building and the admin panel

_Added after the building model changed from four invented floors to the user's two
real ones and the backend grew a full admin API. `apps/web/**` only, plus the
regenerated `docs/screenshots/` and the two README image references that name them._

## The building

The map and the board already read `mapSpec.floors`, so the floor tabs, the plates,
the focus view and the kiosk adapted on their own. Three things did not:

- `components/map/RoomShape.tsx` keyed the dashed atrium-gallery detail off
  `room.code === 'ATRIUM'`; the floor-2 void is now `VOID-2`.
- **The exploded stack's z was hard-coded for four plates.** `projector()` placed
  floor *i* at `(i − 1.5)·118 px` and `Scene` translated the real DOM plates by the
  same expression, which centres four plates on z = 0 and pushes two of them below
  it. Both now call `plateZ(i, floorCount)` = `(i − (n−1)/2)·118 px`, which is the
  same value for four plates and the right one for two. The gap itself is untouched.
- **The fit was width-bound with two plates and clipped the `F2 · 7 busy` labels.**
  With four thin plates the stack was height-bound and the labels had room by
  accident. `fitExploded` now takes an explicit `reserveRight` (132 px, the widest
  label) off the available width and centres the stack in what is left. Margins,
  angles, perspective and plate gap are unchanged — this is the fit maths the brief
  allowed, not a design change.
- `test/fixtures.ts`, `features/board/selectors.test.ts`, `BoardRow.test.tsx` and
  `SplitFlap.test.tsx` were rewritten against the real world: floors `[1, 2]`, the
  Assembly Hall's `100 · HK1105` as the default row, the seeded move `226A → 101`,
  and `Преподаватель N` / `Группа N`.

The header subtitle ("Главный учебный корпус · Блок A") is still accurate and was
left alone. Nothing else on the board, map, kiosk or any existing state changed.

## `/admin`

One screen, `100dvh`, no page scroll; panels inside it scroll, which is what a
working tool needs. It is built from the same tokens, the same metric variables and
the same mono/UI type as the board — `Eyebrow`, `Segmented`, `Toggle` and the pills
in `components/admin/ui.tsx` are the board's own vocabulary, and the header reuses
`LogoMark`, `LiveClock`, `ConnectionDot`, `LangSwitch` and `ThemeToggle` beside an
`АДМИН` badge and a link back to the board. The page holds its own `EventSource`
(`useRealtime`), so an edit made anywhere else lands here too.

- **Расписание** — the weekly grid: 10 slot rows × the 13 schedulable rooms, with a
  weekday selector, a parity selector (все / нечётные / чётные), a room filter, a
  "только занятые" toggle and the count line (`85 пар · вторник · все недели`).
  Each cell shows course code, teacher and groups in the board's compact mono,
  tinted by lesson type (lecture teal, lab violet, practice amber); a two-slot
  lesson spans two rows, and an odd/even pair shares one cell. Clicking a free cell
  opens the create dialog pre-filled with that room, slot and weekday; clicking a
  class opens it for editing. `features/admin/grid.ts` holds the placement helper
  (`buildGridIndex` / `lessonsAt` / `isCovered` / `cellSpan`) and is unit-tested.
- **Изменения на дату** — the overrides of any date, each with an undo button, plus
  a form that cancels, moves, delays or reassigns a session of that day. Same power
  as the ticker's demo popover, laid out properly.
- **Справочники** — three editable tables. Click a name, type, Enter → `PATCH`.
  This is what turns `Преподаватель 1` into a real name; the board picks it up over
  SSE. Add and delete are there too, and the `409` ("still teaches 43 lessons",
  "is still enrolled in 23 lessons") is printed against the row, not swallowed.
- **Объявления** — post a ticker line with a severity and a TTL, and see the lines
  this tab has received on the stream.

Errors from the server are attributed to the field that caused them
(`lessonErrorField`) and printed there — a `409` on the room, the teacher or a group,
a `400` on the room type or the span — never a toast that disappears.

The key is `NEXT_PUBLIC_ADMIN_API_KEY` by default, with a pasted key persisted in
`localStorage` (every access in `try`/`catch`), so the page also works against a
deployed API. A missing or rejected key is said out loud in the header and in the
grid, with the API's own `401` message.

`messages/{ru,kk,en}.json` gained the `admin` namespace (nested under the existing
demo-panel keys); Russian is the primary language and all three are complete.

## The way in

`components/panels/DemoAdminPanel.tsx` — the popover behind the ticker's grid button
— gained an "Открыть админку →" link. The ticker's own layout and the header are
untouched.

## Known gaps

- There is no `GET /announcements`, so "сейчас в бегущей строке" can only list what
  this tab has seen on the stream. The panel says so rather than pretending.
- The grid's room-header sub-line prints the raw `RoomType` (`LAB`, `LECTURE`,
  `SEMINAR`) in every locale, like the board's `LIVE` / `NEXT` tokens.
- `extra` overrides are creatable through the API but not through the panel's
  override form; the four targeted kinds are.

---

# Backend — the real building and the admin API

## Done

**The building**

- `internal/seed` rewritten for `docs/BUILDING.md`: building `A` (two floors),
  all **51 spaces** with their Kazakh/Russian names and the uuids
  `building-a.json` carries, **13 schedulable** rooms, the **five** real
  first-year subjects (`AIF1303`, `FC1301`, `HK1105`, `ICT1103`, `IP1302`),
  **12** placeholder teachers `Преподаватель 1…12` and **24** groups
  `Группа 1…24`, ten 08:00–17:50 slots, `Осенний семестр 2026`
  (2026-08-24 → 12-20, week 1 odd, so 8 Sep 2026 is week 3 · odd).
- A dense weekday schedule — **432 lessons**, ~63 % of the room-slots Mon–Fri —
  built room by room from a catalogue that pins what each room may teach (the AI
  lab only teaches AI; the seven laboratories only hold labs; multi-group
  lectures only go in the four lecture halls). No group and no teacher is ever
  double-booked.
- The demo instant `CLOCK_FIXED_AT=2026-09-08T10:47:00+05:00` is hand-placed:
  **10 of the 13** rooms busy, three two-slot lectures `live`, six one-slot
  lessons `ending`, `204` `delayed +15`, and in `NEXT` the cancelled `223` lab
  and the `226A → 101` move.
- `buildings.name` is the neutral **"Главный учебный корпус"** — the floor plans
  do not name the institution, so the name is one constant
  (`seed.BuildingName`, plus `BUILDING_NAME` in `svg2map.ts`) to change rather
  than a guess baked into the data.

**The admin API** — everything under `X-Api-Key`, every write pokes
`board.Invalidate` so an open board sees it over SSE in ~20 ms:

| | |
|---|---|
| Reference data (public) | `GET /buildings/{code}/rooms`, `/slots`, `GET /teachers`, `/groups`, `/courses`, `/semesters` |
| Recurring schedule | `GET|POST /admin/lessons`, `PATCH|DELETE /admin/lessons/{id}` |
| Roster | `POST|PATCH|DELETE /admin/teachers|groups|courses` |
| One-off changes | `GET|POST /admin/overrides`, `DELETE /admin/overrides/{id}`, `POST /admin/announcements` |

`POST`/`PATCH /admin/lessons` validates the whole placement and answers **409**
with a readable message when the room, the teacher or any group is already
booked in that weekday + slot + parity (honouring `slotSpan` and treating
odd/even as non-colliding), and **400** when the room is not schedulable or its
type does not suit the lesson type. Deleting a teacher, group or course that is
still referenced is a **409**, not a silent cascade. `migrations/0002_admin.sql`
adds the indexes those checks need; `0001` is untouched.

## Quality gates (all green)

| Gate | Result |
|---|---|
| `go build` · `go vet` · `golangci-lint run` | clean, **0 issues** |
| `go test -race -cover ./...` | green — `engine` **98.0 %**, `clock` 100 %, `realtime` 94.4 % |
| Contract tests (`TEST_DATABASE_URL`) | green — `httpapi` **61.4 %**, every response validated against `openapi.yaml` |
| `go run ./cmd/seed --reset` | 51 rooms · 12 teachers · 24 groups · 5 courses · **432 lessons** · 40 overrides · 3 announcements |
| `/board` at the demo instant | `roomsBusy 10 / 13`, NOW 10, NEXT 15, week 3 · odd |
| SSE after `POST /admin/lessons` | new snapshot at **t + 20 ms** (budget 1 s) |

New contract tests cover the reference endpoints, the whole lesson lifecycle
(create → list → clash → patch → delete → 404), the room/type validation, the
placeholder renames reaching the board, the 409 on a teacher who still teaches,
`401` on every admin verb, and an SSE trace proving a new class lands on an open
board within a second.

## Deliberate deviations

1. **`engine` is untouched.** The admin API only writes `lessons` /
   `session_overrides` rows and pokes `invalidate`; phases, conflicts and
   `nextTransitionAt` are still computed by the same pure package.
2. **CORS now allows `PATCH`** (`middleware.go`) — a browser cannot preflight a
   `PATCH` otherwise, and every edit in the panel is one.
3. **`210`, `211`, `212`, `215` carry neutral "Кабинет NNN" names** — they are on
   the plan but not in the university's room list.

---

# Phase — real room geometry

The two plates no longer approximate the plans with rectangles: every room is the
polygon the real plan draws, segmented straight out of
`packages/map-data/reference/floor-{1,2}.png` and committed as
`packages/map-data/scripts/authoring/traced.json`.

| Before | After |
|---|---|
| one shared silhouette (60 pts) traced from the floor-1 photo | one silhouette **per floor** — 42 pts (f1) and 34 pts (f2) |
| floor 2 placed *topologically*: right ring order, invented rectangles | floor 2 placed from its own plan, rotated 90° CW into the shared box |
| every room an axis-aligned rectangle | 44 of 51 spaces are real polygons; 7 white-on-plan spaces keep rectangles |

The segmentation flood-fills the background from the border, splits the plate into
fills and wall strokes, erodes the fill mask so doorway gaps stop leaking one room
into the next, then grows the surviving cores back so neighbours meet in the
middle of the wall. Two pairs are fused by a doorway and are cut apart on the
perpendicular bisector of their captions: `102`/`102A` and `209`/`210`.

`207`, `208` and `213` now carry the office holders' names, per the university's
room list.

| Gate | Result |
|---|---|
| `pnpm --filter @campuslive/map-data run svg:author` | clean — 18 + 33 = **51 spaces** |
| `pnpm map:build` | 51 rooms, **13 schedulable**, unchanged per-floor sets |
| `packages/map-data` vitest | 12 passed |
| `go build ./...` · `go test ./...` | green |
| `apps/web` vitest · `tsc --noEmit` | 91 passed · clean |
| `go run ./cmd/seed --reset` | 51 rooms · 432 lessons · 40 overrides |

## Deliberate deviations

4. **The two silhouettes differ slightly.** They are two separate drawings of one
   building, so the plates are concentric but not identical — that reads as a
   set-back in the stacked view, which is what the plans show.
5. **`mapspec.TestLoad` asserted 4 floors / 89 rooms**, left over from the
   four-floor draft. Corrected to 2 / 51 — the building `docs/BUILDING.md`
   describes.

---

# Phase — every space named, every space findable

Searching for a place by its ordinary name now finds it and the map points at
it, whether or not a class is running there.

**The bug.** `highlightedRooms` only ever walked `snapshot.now` and
`snapshot.next`, so a hit could only light up a room that had a lesson. The
cafe, the restrooms, the library and every office are never in either list —
searching for one highlighted nothing at all. It now takes a room index built
from the map spec and always resolves a `room` hit, falling back to a plain
`HERE` badge when there is no lesson to describe.

**The vocabulary.** `rooms.name` holds the university's Kazakh wording, so
«кафе», «туалет», «коворкинг» or «айти департамент» matched nothing. Migration
`0003_room_aliases.sql` adds `rooms.aliases`, a search-only synonym bag in all
three languages that `SearchRooms` also matches on. It is never rendered.

**The gaps.** Six spaces the plan draws but never numbers are now real rooms —
`227` IT департаменті, `228` Коворкинг, and `229`–`232` service rooms of the
inner core. The building is **57 spaces**, still 13 schedulable.

| Query | Finds |
|---|---|
| `кафе` | `CAFE` |
| `туалет` | `WC-1` `WC-2` `WC-N2` `WC-S2` |
| `коворкинг` | `102` `102A` `228` |
| `айти` | `222` `227` |
| `склад` | `205` `231` |
| `синема` | `CINEMA` |

| Gate | Result |
|---|---|
| `svg:author` · `map:build` | 18 + 39 = **57 spaces**, 13 schedulable |
| `packages/map-data` vitest | 12 passed |
| `go build` · `go vet` · `go test -count=1 ./...` | green |
| `apps/web` vitest · `tsc --noEmit` | 93 passed · clean |
| `go run ./cmd/seed --reset` | 57 rooms · 432 lessons |

## Deliberate deviations

6. **`internal/repo/gen` was hand-edited.** `sqlc` will not build on this
   machine's 32-bit toolchain (`math.MaxInt64` overflows `int` in a transitive
   TiDB parser dependency), so the three `aliases` edits were written by hand in
   exactly the shape `sqlc generate` emits. Re-run generation on a 64-bit host
   before trusting the drift check.
7. **`227`–`232` are our codes, not the university's.** The plan draws the
   spaces and numbers none of them; `docs/BUILDING.md` records which are
   staff-supplied names and which are placeholders.
8. **Five slivers on floor 2 stay unnamed.** They are 2–6 kpx segmentation
   artifacts along wall lines, not rooms, and read as corridor.

---

# Phase — the plan reads like a wayfinding board

The map is restyled after a public campus plan: a dark plate, every space a
visitor can enter in blue, plant rooms and stair cores grey, and the room number
printed inside each room.

**Printed numbers.** `components/map/PlanLabels.tsx` draws a code in every room
and the full name in the landmarks (assembly hall, library, cafe, cinema, lobby,
atrium, coworking). The focused plate is turned −90° about Z, so each label is
counter-rotated +90° about its own anchor to read horizontally. A name is only
printed when it actually fits the room's on-screen width; otherwise the room
falls back to its number. Restrooms are signed `WC`, as the plan itself prints
them. Only the focused plate prints — the ghost of the floor below stays mute.

**Three quiet fills.** A room with no timetable used to be painted the same grey
as a plant room, so most of the plan read as "not a place". `RoomShape` now
splits them: `room` (blue — the cafe, the library, every office), `service`
(grey — `TECH*`, `CORE*`) and `circulation` (ground — the north hall and the
lobby). Every space is clickable too; only the atrium void stays inert.

**Chips only where something happens.** A chip sits on the room's label anchor,
so one per free room buried the numbers under a row of "free today". They are
now limited to rooms with a live, ending or starting class.

**A geometry defect the restyle exposed.** Printing numbers made it obvious that
several polygons had number-shaped notches bitten out of them: each room on the
plan carries its number in white type, and on a narrow room those glyphs touch
the walls, so the contour tracer wrapped around the letters. The tracer now heals
captions first — small enclosed white blobs are dilated and merged back into the
room, and exempted from the Sobel wall pass. Floor 2's worst polygon fell from
**42 points to 16**. With the glyphs no longer acting as accidental separators,
erosion rose to 10 (floor 1) and 14 (floor 2); both floors now match **every**
labelled room automatically — 13/13 and 37/37 — so the two hand-cut pairs
(`102`/`102A`, `209`/`210`) are no longer needed.

| Gate | Result |
|---|---|
| `svg:author` · `map:build` | 18 + 38 = 56 spaces, 13 schedulable |
| `packages/map-data` vitest | 12 passed |
| `go vet` · `go test -count=1 ./...` | green |
| `apps/web` vitest · `tsc --noEmit` | 93 passed · clean |
| `cmd/seed --reset` | 56 rooms · 432 lessons |

---

# Fix — `220` is one room, and there is no `230`

Reported from the plan: the band between `219` and `221` is a single room, `220`,
running unbroken to the façade. Two stub partitions inside it — walls that stop
short of the far side — had split it into three components, and the largest of
the strays had been named `230`.

`230` is gone (56 spaces, floor 2 down to 38) and the tracer learned to weld: a
code repeated in the labels file, once per piece, claims every one of them. The
extra components are relabelled onto the first and the union is re-traced as a
single contour, so `220` is now 24 843 px across 26 points instead of three
polygons with a false neighbour between them.

This is the general remedy for a stub partition, and the first case where the
segmentation needed to be told something the pixels alone could not say.

| Gate | Result |
|---|---|
| `map:build` | 18 + 38 = 56 spaces, 13 schedulable |
| `packages/map-data` vitest | 12 passed |
| `go vet` · `go test -count=1 ./...` | green |
| `cmd/seed --reset` | 56 rooms · 432 lessons |

---

# Phase — floor 1 is the plan, and rooms speak three languages

**Floor 1 now draws only what the plan draws.** `LOBBY` and `TECH-N1` were
authoring rectangles with no counterpart on the real plan, and `CAFE` sat 26
units from where the plan prints it; the first two are gone and the cafe moved
onto its box. The building is **54 spaces** (16 + 38), still 13 schedulable.

**The furniture is gone.** Stair/lift glyphs and entrance doorways were drawn at
authoring rectangles rather than anything the plans mark, so they landed as
stray squares and hatched boxes on the plate. `FloorPlan` no longer renders
either; both stay in the map data, ready for when they are traced.

**Two fills, not three.** Blue is every room a visitor can walk into. Grey is the
served zone — the north hall, the structures standing in it and the stair cores —
filled as solidly as the rest of the plan but carrying **no caption at all**: it
is what you walk through, not what you are looking for. The `circulation` fill
that used to sink the hall into the background is gone.

**Room names follow the locale.** `rooms.name` in the database is the
university's own Kazakh wording — one string, no locale. The translations live
in `messages/{ru,kk,en}.json` under `rooms.<CODE>` and are resolved by
`features/rooms/useRoomName.ts`, used by the plan labels, the tooltip, the
detail panel and the search results. Switching language now renames every space:
Кітапхана · Библиотека · Library.

**Labels are fitted, not accepted or rejected.** A landmark name is drawn at the
largest size that fits its room and falls back to the number only below 13px —
otherwise a room that could hold "LIBRARY" would flip to a bare number the
moment the reader switched to "БИБЛИОТЕКА".

| Gate | Result |
|---|---|
| `svg:author` · `map:build` | 16 + 38 = **54 spaces**, 13 schedulable |
| `packages/map-data` vitest | 12 passed |
| `go vet` · `go test -count=1 ./...` | green |
| `apps/web` vitest · `tsc` · `eslint` | 93 passed · clean · clean |
| `cmd/seed --reset` | 54 rooms · 432 lessons |

---

# Fix — the served zone is one shape, not a scatter of scraps

Reported: small stray shapes still floating on floor 1. They were the served
zone coming apart. `ATRIUM-N` was traced as a 238-point contour woven around
every white structure the plan draws, and the three `TECH-*` blocks were more
grey islands beside it — so the north read as torn paper rather than one zone.

`ATRIUM-N` is now the band `[0, 0, 600, 442]` clipped to the façade: a single
solid region with a clean edge. `TECH-N2`, `TECH-N3` and `TECH-S1` are gone —
they were grey islands standing inside or beside that zone and named nothing a
visitor would look for. Floor 1 is **13 spaces**, the building **51**.

Contour tracing is right for a room, which has walls; it is wrong for the space
between rooms, which does not.

| Gate | Result |
|---|---|
| `svg:author` · `map:build` | 13 + 38 = **51 spaces**, 13 schedulable |
| `packages/map-data` vitest | 12 passed |
| `go vet` · `go test -count=1 ./...` | 6 packages ok |
| `apps/web` vitest · `tsc` · `eslint` | 93 passed · clean · clean |
| `cmd/seed --reset` | 51 rooms · 432 lessons |

---

# Fix — the room chips are gone

Reported, plainly: the chips are not needed and they are maddening. They were.

A chip sat on each busy room's label anchor with a progress ring and a
countdown, directly over the number printed on that room — two labels fighting
for one spot. The status is already on the plan as the room's own fill (live,
ending, starting) and in full on the board beside it, so the chip repeated what
the reader could already see while hiding the one thing only the plan carries:
which room it is.

`RoomChip.tsx` is deleted, along with `RoomChips`, the `chipRooms` filter and
`COMPACT_CHIP_WIDTH`. Three e2e specs clicked a chip to open a room; they now
click the room polygon itself (`[data-room="226"]`), which is the honest target
anyway, and the visual snapshot no longer masks chips that cannot appear.

The search badge is untouched: it is raised deliberately by a search and points
at one room, rather than crowding every busy one.

| Gate | Result |
|---|---|
| `apps/web` vitest · `tsc` · `eslint` | 93 passed · clean · clean |
| `packages/map-data` vitest | 12 passed |
| `go vet` · `go test -count=1 ./...` | 6 packages ok |

---

# Phase — the trace becomes drawn geometry

The plates were built straight out of a pixel segmentation, so every wall was a
staircase: ~40 vertices per room, each edge a degree or two off true, and a
façade that read as hand-torn. `scripts/authoring/regularize.mjs` closes that
gap between *traced* and *drawn*.

The building is an arc, so the usual trick — find the plate's dominant axis and
snap everything to it — does not apply: the rooms fan out around the curve and
there is no one axis. Each room is instead straightened in **its own** frame,
which is the right model, because a room here is a rectangle that happens to be
rotated. The façade is filtered rather than snapped, since it is genuinely
curved, then rescaled to its original area and given 3 units of slack so the
perimeter rooms it was traced against stay enclosed.

| | before | after |
|---|---|---|
| floor 1 vertices | 382 | **98** |
| floor 2 vertices | 413 | **283** |
| median wall skew | 15.0° / 7.0° | **0.8° / 0.7°** |

Two guards keep it honest: a room whose area moves by more than 12 % keeps its
merely-simplified polygon, and any vertex that still lands outside the smoothed
façade is pinned to the wall rather than left poking through.

The hall's structures are back on floor 1 (`TECH-N2`, `TECH-N3`, `TECH-S1`) —
regularised they are clean rectangles rather than the ragged scraps that were
removed earlier, so the served zone reads as structured instead of blank. It is
now drawn in two greys, as the plan draws it: the hall recedes as one mass, the
structures sit a shade lighter on top. Building back to **54 spaces**.

No business logic moved. Room codes, ids, ordering, the database rows and every
handler are untouched — only vertices changed.

| Gate | Result |
|---|---|
| `svg:author` · `map:build` | 16 + 38 = 54 spaces, 13 schedulable |
| `packages/map-data` vitest | 12 passed |
| `go vet` · `go test -count=1 ./...` | 6 packages ok |
| `apps/web` vitest · `tsc` · `eslint` | 93 passed · clean · clean |
| Interaction sweep | floor switch, hover, click, non-teaching room, search, legend, mobile — all pass |


---

# Phase — the plates are rebuilt from the plans

The map was rebuilt from `reference/floor-{1,2}.png` from scratch. The old
pipeline kept a hand-maintained table of rectangles beside a partial trace, and
the two had drifted: floor 1 landed twelve traced rooms in a plate of invented
boxes, so `100` was a sliver in the middle of the lobby instead of the hall in
the south-west corner, and the CR / cinema / WC band was four small squares
instead of two long runs. That table is gone. Every polygon on both plates is now
the one the plan draws.

The tracer is `packages/map-data/scripts/authoring/` (Python — OpenCV, SciPy,
shapely). Walls are the Scharr ridge of the plan's luminance with the white room
captions **inpainted out first**, which is what unlocked the rest: traced as-is a
number bit its own shape out of the polygon around it and erased the wall it sat
on. The doorway gaps the plan draws are then sealed by *oriented line closings* —
a gap in a straight wall is collinear, so a line kernel bridges it while a room,
which is not a line, never fills in. That is what finally separates `206`-`213`,
seven offices the plan joins through open doorways.

Sealing rounds the corners it reaches into, so the seeds it produces are used
only for **identity**. The shape comes from the components of the plate minus the
*thin* walls — crisp, square corners intact — each handed to the seed inside it,
with the wall band split down its centre line so two neighbours meet on the same
line. Rooms are named by an **anchor**, a point in plan pixels, not by a cell
number, so re-tuning the segmentation cannot silently renumber the building.

| | floor 1 | floor 2 |
|---|---|---|
| spaces traced (was: traced / invented) | **16 / 0** (was 12 / 4) | **38 / 0** (was 36 / 2) |
| median overlap with the plan | **0.95** | **0.95** |
| worst overlap | 0.90 `CORE-N1` | 0.88 `CORE-N2` |
| outline vertices | 69 | 73 |

`pnpm --filter @campuslive/map-data run svg:check` prints that overlap table and
writes `reference/authored-check.png`, each authored plate beside its plan.

Two consumers had drifted with the old geometry and were corrected: `FloorLayer`
still hid `200` and `LOBBY` as "the central hall", which blanked a real lecture
hall, and it skipped the stair cores, which are now traced structures rather than
authoring rectangles and draw like the rest of the plan. `svg2map` reads
`<g id="corridors">` from the SVG instead of clipping two hard-coded bands, so
the circulation the plan draws — the lobby, the slots through the north hall, the
corridor ring — is on the plate.

No business logic moved. Room codes, ids, types, wings, capacities, the
schedulable set, the database rows, the seed and every handler are untouched.

| Gate | Result |
|---|---|
| `svg:author` · `svg:check` · `map:build` | 16 + 38 = 54 spaces, 13 schedulable, median overlap 0.95 |
| `packages/map-data` vitest | 12 passed |
| `apps/web` vitest · `tsc` · `eslint` | 93 passed · clean · clean |
| `go build ./...` · `go test ./...` | clean · 6 packages ok |
| Interaction sweep (1920×1080 + 390×844) | floor switch, hover, select, tooltip, detail panel, legend, labels, no page scroll — all pass; no console errors beyond the offline API |

`apps/web/e2e/visual.spec.ts-snapshots/` was deleted: both baselines are of the
old plates. Regenerate on Linux against the demo stack with
`pnpm e2e --update-snapshots` and commit the two PNGs.


---

# Phase — the plates become drawn geometry, not a trace

The plates were right about *where* every room is and wrong about *what* it looks
like. Walls wobbled a degree either side of true, corners came back chamfered,
rooms the plan draws the same width came out different widths, and the finer half
of the plan — the stub partitions, the thin passages, the service closets, the
line work of floor 1's south-east block — was missing from the plate entirely.

Two bugs were behind it.

**The crisp cells were being thrown away.** The doorway seal is what separates
rooms the plan joins through an open door, but it rounds corners and swallows the
smallest rooms whole. The tracer treated its blobs as the rooms, so a room the
seal erased was dissolved into its neighbours by a nearest-blob fill — which is
what turned the WC cluster into a set of rounded lumps with diagonal boundaries.
It is the other way round: **the crisp cells are the rooms**, and the sealed
blobs only say which of them a doorway joins. A cell holding two blobs is two
rooms and is split; a cell holding none is a room the seal erased and keeps its
own shape. Every partitioned room and closet on both plates came back.

**The move guard measured the wrong distance.** Straightening replaces the dozen
vertices a trace leaves along one wall with the two ends of it, and the guard
compared corner to corner — so the middle of a 60-unit wall read as a 30-unit
move and *every* room was rejected. Measured point-to-wall instead, the
straightening runs: 47 of the 53 spaces are now rectilinear, and the six that are
not are the ones the plan genuinely does not draw square.

With those fixed, the straightening became worth doing properly. `rectify` turns
a room onto the axis its own walls run at, forces every wall to the nearer axis,
swallows jags and flattens serrations, and rebuilds the ring from those lines;
`consolidate` then averages, across the whole floor, the lines that are one wall
the trace saw twice. Both guards are judged after clipping to the façade, so a
perimeter room keeps straight party walls and a curved outer edge. A partition
traced from an open line drawing has no axis of its own and is squared to the
room beside it, which is what keeps a block of them a grid.

| | floor 1 | floor 2 |
|---|---|---|
| room vertices (was) | **163** (473) | **261** (1125) |
| rectilinear rooms | 12 / 15 | 35 / 38 |
| structures drawn (was) | **41** (23) | **10** (3) |
| median overlap with the plan | 0.92 | 0.93 |
| cells the plan encloses / shapes drawn | 52 / 57 | 39 / 48 |
| size drift from the traced cell | ≤ 8 % | ≤ 13 % |

Everything the plan draws but does not number is now emitted as
`<g id="corridors">` and, in `FloorPlan`, **stroked** as well as filled — a
partition is a line before it is an area, and at 3.5 % white with no stroke the
finer half of the plan was invisible. Two tokens, `--fill-circulation` and
`--line-circulation`, carry it in both themes.

No business logic moved. Room codes, ids, types, wings, capacities, the
schedulable set, the database rows, the seed and every handler are untouched.

| Gate | Result |
|---|---|
| `svg:author` · `svg:check` · `map:build` | 16 + 38 = 54 spaces, 13 schedulable, median overlap 0.92 / 0.93 |
| `packages/map-data` vitest | 12 passed |
| `apps/web` vitest · `tsc` · `eslint` | 93 passed · clean · clean |
| `go vet` · `go test ./...` | clean · 6 packages ok |
| Plate sweep (1920×1080 + 390×844) | 54 rooms drawn, 0 captions overflow their room, no page scroll, no console errors beyond the offline API |
