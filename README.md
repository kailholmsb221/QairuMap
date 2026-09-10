# CampusLive

**A real-time "airport departures board" for a university building, paired with an interactive 2.5D map of that building.**

One glance answers: which classes are running right now, in which rooms, taught by whom, and what starts next. Status changes reach every open screen the second a lesson crosses a boundary — no reload, no polling loop, no scrollbar anywhere.

![Main screen — Tuesday 10:47, exploded view](docs/screenshots/01-main-exploded.png)

---

## What it does

| | |
|---|---|
| **NOW / NEXT board** | Airport split-flap rows, sorted by end time and start time. Fits its rows to the available height and pages like a departures board when there are more classes than rows — it never scrolls. |
| **2.5D building map** | The building's two floor plates stacked in an exploded view; click a plate (or a floor tab) and it lies flat, scales up and grows a chip on every room with the course and a countdown. Rooms are painted by phase: free, starts-soon, live, ending, delayed, conflicted. |
| **Live** | Server-Sent Events push a complete snapshot on every phase transition and after every admin override. Budget: under one second, end to end. |
| **Time travel** | A 4 px line under the map expands into the whole day with an occupancy heat strip. Scrub it and the board rebuilds from the server for that instant, tagged `SIMULATED`. |
| **Search** | ⌘K over teachers, groups, rooms and courses. Picking a hit badges the matching rooms on the map and filters the board. |
| **Kiosk** | `/kiosk` — no chrome, no cursor, floor focus and board pages rotating on their own. |
| **Admin panel** | `/admin` — the weekly grid of the 13 schedulable rooms × 10 slots. Put a class in a free cell, edit or delete one, undo a day's changes, rename the placeholder teachers and groups, post a ticker line. Every write reaches every open board over SSE. |
| **Demo mode** | A deterministic seed, a settable server clock, and a hidden admin panel that cancels, moves and delays classes so the board visibly reacts on camera. |

### The states, all designed and implemented

| Focus view + room detail | Search highlight |
|---|---|
| ![Floor 2 focused, room 226 selected](docs/screenshots/02-focus-floor-2-room-226.png) | ![Searching Группа 13](docs/screenshots/04-search-highlight.png) |

| Time travel — 20:00, simulated | Kiosk (floor auto-rotate) |
|---|---|
| ![After hours](docs/screenshots/08-after-hours.png) | ![Kiosk](docs/screenshots/06-kiosk.png) |

Also implemented and screenshotted: `docs/screenshots/03-search.png` (palette open), `05-time-travel.png` (bar expanded at 14:05), `07-1280x720.png` (the compact layout, still no scroll), `09-api-down.png` (schedule service unreachable, last-known map intact), `10-admin.png` (`/admin` — the weekly grid).

---

## Architecture at a glance

```
                        ┌──────────────────────── apps/web (Next.js 15) ───────────────────────┐
  browser               │  RSC page ──fetch /map + /board──▶ first paint is already live       │
  ┌────────┐  SSE       │       │                                                              │
  │ screen │◀───────────┼── useRealtime()  EventSource /events   → boardStore.setSnapshot()    │
  │        │  REST      │       ├── useNow() 1 Hz  → countdowns & progress only                │
  │        │◀───────────┼──────▶├── useTimeTravel() → GET /board?at=                           │
  └────────┘            │       └── useSearch() → GET /search                                  │
                        └──────────────────────────────────────────────────────────────────────┘
                                             │  packages/contracts/openapi.yaml
                                             │  (oapi-codegen → Go, openapi-typescript → TS)
                        ┌────────────────────┴───────────── services/api (Go) ─────────────────┐
                        │  httpapi (chi, strict server, ETag)                                  │
                        │      │                                                               │
                        │      ├── service.Board  ── cache per building: timeline + snapshot    │
                        │      │        │                                                      │
                        │      │        ├── engine   PURE: BuildDayTimeline · ComputeSnapshot   │
                        │      │        │            phases · overrides · conflicts             │
                        │      │        │            nextTransitionAt                           │
                        │      │        └── clock    Real | Fixed | Offset                      │
                        │      │                                                               │
                        │      ├── realtime.Broker  hub per building, full snapshot, 25 s beat  │
                        │      └── scheduler        sleep until nextTransitionAt (≤ 5 min) →    │
                        │                           rebuild → publish;  admin POST pokes it     │
                        │  repo (pgx + sqlc) ─────────────────────────────▶ PostgreSQL 16       │
                        └──────────────────────────────────────────────────────────────────────┘

  packages/map-data:  svg/floor-{1,2}.svg ──svg2map.ts──▶ building-a.json ──▶ web (render)
                                                                            └▶ cmd/seed (rooms)
```

Three rules hold the design together:

1. **The server is the only source of truth for status.** `internal/engine` is pure Go with no I/O; the frontend derives nothing but progress percentages and countdowns from timestamps. There is no second phase implementation in TypeScript to drift.
2. **A day is materialised on the fly.** The database stores recurring `lessons` plus per-date `session_overrides`; concrete sessions are never persisted. Importing a real schedule means writing rows in those two tables — nothing else changes.
3. **Geometry is data.** `packages/map-data/svg/floor-{1,2}.svg` is the source of truth; `pnpm map:build` turns it into `building-a.json`, which both the web app and the seed read. No coordinate is hard-coded anywhere in either codebase.

`docs/ARCHITECTURE.md` is the full document (in Russian) — domain model, database schema, engine specification, API contract, motion budget and phase plan.

---

## Running it

### Prerequisites

Node 22, pnpm 10, Go 1.24, PostgreSQL 16 (or Docker).

### Local development

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d postgres   # or your own Postgres 16

cp infra/.env.example infra/.env                            # then export what you need
export DATABASE_URL=postgres://campuslive:campuslive@localhost:5432/campuslive

pnpm map:build          # svg → packages/map-data/building-a.json
pnpm contracts:generate # openapi.yaml → TS types
pnpm seed --reset       # migrations + deterministic demo data (seed 42)
pnpm dev                # web on :3000, api on :8080
```

Open <http://localhost:3000>. The building is busy on weekdays between 08:00 and 18:00 local time — outside that window you get the after-hours screen, which is by design. To see the hero moment at any hour:

```bash
export CLOCK_MODE=fixed CLOCK_FIXED_AT=2026-09-08T10:47:00+05:00
```

### The whole stack in Docker

```bash
docker compose -f infra/docker-compose.yml up --build
```

Caddy fronts both on <http://localhost>, with `flush_interval -1` so SSE is not buffered.

### The 90-second demo

```bash
pnpm demo         # starts the stack with an offset clock so "now" is Tuesday 10:47
pnpm demo:script  # cancels a class, moves another and posts an announcement over 90 s
```

Everything reacts live while you record.

---

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | web (3000) + api (8080) through Turborepo |
| `pnpm map:build` | `svg/floor-{1,2}.svg` → `building-a.json`, with validation |
| `pnpm contracts:generate` | `openapi.yaml` → `packages/contracts/src/types.gen.ts` |
| `pnpm seed [--reset]` | migrations + demo data |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | web + package gates |
| `pnpm e2e` | Playwright against a running API with a fixed clock |
| `pnpm --filter web shots` | regenerates `docs/screenshots/` |
| `/admin` | the admin panel — set `NEXT_PUBLIC_ADMIN_API_KEY` (or paste the key into the page) |
| `cd services/api && make test` | `go vet`, `go test -race -cover`, `golangci-lint` |

Regenerate the Go server types after editing the contract:

```bash
cd services/api && go generate ./internal/httpapi
```

---

## Quality gates

| Gate | Status |
|---|---|
| `go vet` · `golangci-lint` · `go test -race` | green |
| `internal/engine` coverage | **98 %** (target ≥ 95 %), table-driven + golden JSON fixtures |
| Contract tests | every handler response validated against `openapi.yaml` (`kin-openapi`) |
| `tsc --noEmit` · `eslint` · `vitest` | green — 67 unit tests |
| Playwright | 16 scenarios green, including no-scroll at 1280×720 / 1920×1080 / 2560×1440 / 3840×2160 |
| Main-route JS | 230 kB first load (budget 300 kB) |
| SSE latency | admin override → new snapshot on an open board in ~20 ms (budget 1 s) |

The e2e suite runs with `CLOCK_MODE=fixed`, which is the whole reason `Clock` is an interface: screenshots and assertions are byte-stable.

---

## Plugging in a real schedule

The engine, the API and the frontend only ever see `lessons` and `session_overrides`. Adding a real source means implementing one interface:

```go
type ScheduleSource interface {
    Sync(ctx context.Context, from, to time.Time) (SyncReport, error)
}
```

`SeedSource` (the demo generator) is one implementation. An `ExcelSource` parsing the dean's office spreadsheet, or an `ExternalAPISource` polling a university LMS and writing the diff as overrides, drops in beside it — no change to the engine, the contract or the UI. Rooms are matched by `rooms.code`, so start from the university's real room codes and the map lights up on its own.

Replacing the building is the same shape of change: retrace `packages/map-data/svg/floor-{n}.svg` from real plans, keep the element ids (`outline`, `zone-*`, `room-<code>`, `core-n`, `core-s`, `entrance-w`, `entrance-e`, `atrium`), and run `pnpm map:build`.

---

## Repository

```
apps/web              Next.js 15 App Router — board, 2.5D map, overlays, kiosk
services/api          Go — engine, REST, SSE, scheduler, seed, migrations
packages/contracts    openapi.yaml (single source of truth) + generated TS types
packages/map-data     floor SVGs → building-a.json (+ schema and validation)
infra                 docker-compose, Caddyfile, .env.example, demo scripts
docs                  ARCHITECTURE.md, STATUS.md, design export, screenshots, prompts
```

`CLAUDE.md` holds the working rules; `docs/STATUS.md` tracks what is done, what is next and every deliberate deviation.

---

## Credits

**Автор: Ашимхан Алихан.**

The building silhouette, wing zoning and circulation cores are traced from the real architectural plans of floors 1 and 2. Every room name, teacher, group and course inside it is invented — this is a portfolio demo, not a live university system.
