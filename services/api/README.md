# CampusLive API

The Go service behind the board and the map: it materialises a teaching day from
recurring templates, decides every status, serves the REST contract and pushes
full snapshots over SSE.

Read `docs/ARCHITECTURE.md` §5–§9 first — this README only says how to run it.

## Layout

```
cmd/api           HTTP + SSE server (also `-healthcheck` for the compose probe)
cmd/seed          deterministic demo data (--reset)
internal/domain   pure types: Building, Room, Session, Snapshot, Date…
internal/clock    Clock: Real / Fixed / Offset — the ONLY time.Now() in the repo
internal/engine   BuildDayTimeline + ComputeSnapshot + WeekInfo — no I/O at all
internal/schedule ScheduleSource (§17) and its SeedSource implementation
internal/seed     the deterministic generator (seed 42)
internal/repo     pgx pool + sqlc output (queries/ → gen/)
internal/service  Board: per-building snapshot cache and time travel
internal/httpapi  chi router, oapi-codegen strict handlers, ETag, CORS, admin
internal/realtime SSE broker: hub per building, 16-message buffer, heartbeats
internal/scheduler sleeps until nextTransitionAt, rebuilds, broadcasts
internal/mapspec  loader for packages/map-data/building-a.json
migrations        goose SQL, embedded (embed.FS)
```

Nothing above `internal/engine` decides a status, and nothing below `httpapi`
knows what JSON looks like.

## Prerequisites

- Go 1.24
- PostgreSQL 16
- For regeneration only: `oapi-codegen` v2, `sqlc` 1.29, `golangci-lint` 2

## Quick start

```bash
export DATABASE_URL='postgres://campuslive:campuslive@127.0.0.1:5432/campuslive?sslmode=disable'

go run ./cmd/seed --reset          # migrates, then writes the demo timetable
go run ./cmd/api                   # http://localhost:8080
```

`cmd/seed` always migrates first, so a fresh database needs nothing else.

To reproduce the design's hero screen exactly:

```bash
CLOCK_MODE=fixed CLOCK_FIXED_AT=2026-09-08T10:47:00+05:00 \
ADMIN_API_KEY=dev-admin-key go run ./cmd/api

curl -s localhost:8080/api/v1/buildings/A/board | jq '{date,weekNumber,weekParity,stats}'
```

`make help` lists the rest (`make demo`, `make seed`, `make check`, …).

## Configuration (ARCHITECTURE §8.5)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Listen port |
| `DATABASE_URL` | local dev DSN | PostgreSQL connection string |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allow list; `*` allows any |
| `CLOCK_MODE` | `real` | `real` / `fixed` / `offset` |
| `CLOCK_FIXED_AT` | — | RFC 3339 instant, required by `fixed` |
| `CLOCK_OFFSET` | — | Go duration, required by `offset` (e.g. `-3h20m`) |
| `ADMIN_API_KEY` | `dev-admin-key` | `X-Api-Key` for the three `/admin/*` routes |
| `SOON_WINDOW` | `10m` | STARTING SOON window |
| `ENDING_WINDOW` | `5m` | ENDING window |
| `NEXT_HORIZON` | `90m` | How far ahead NEXT looks |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `MIGRATE_ON_START` | `false` | Apply the embedded migrations on boot |
| `SEED_ON_START` | `false` | Seed when the database is empty (never truncates) |
| `MAP_DATA_PATH` | auto | `packages/map-data/building-a.json`; found by walking up from the working directory |
| `DEFAULT_BUILDING` | `A` | Building the scheduler drives and the day views resolve against |

## Endpoints

Everything in `packages/contracts/openapi.yaml`, served under `/api/v1` plus
`/healthz` and `/readyz`. `/map` and `/board` carry a strong `ETag`
(sha256 of the body) and answer `304` to a matching `If-None-Match`.

```bash
curl -s localhost:8080/api/v1/buildings
curl -s localhost:8080/api/v1/buildings/A/map            | jq '.floors[].rooms|length'
curl -s localhost:8080/api/v1/buildings/A/board          | jq '.stats'
curl -s 'localhost:8080/api/v1/buildings/A/board?at=2026-09-08T09:05:00Z' | jq '.at'
curl -s 'localhost:8080/api/v1/buildings/A/timeline?date=2026-09-08' | jq '.sessions|length'
curl -s 'localhost:8080/api/v1/rooms/213/day'
curl -s 'localhost:8080/api/v1/search?q=ПО2308'
curl -s localhost:8080/api/v1/time
curl -N localhost:8080/api/v1/events?building=A

curl -X POST localhost:8080/api/v1/admin/overrides \
  -H 'X-Api-Key: dev-admin-key' -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-08","kind":"cancel","lessonId":"…"}'
```

## Regenerating the generated code

Both outputs are committed; CI fails if they drift.

```bash
make generate
# = oapi-codegen -config oapi.yaml ../../packages/contracts/openapi.yaml
#   sqlc generate
```

## Tests

```bash
make test       # unit tests; the database-backed ones skip
make test-all   # adds the contract + SSE tests against TEST_DATABASE_URL
make lint
```

- `internal/engine` — table-driven tests plus golden JSON fixtures in
  `internal/engine/testdata/`. Regenerate them with `make golden`.
- `internal/httpapi` — every response is validated against `openapi.yaml` with
  `kin-openapi`, against a real PostgreSQL named by `TEST_DATABASE_URL`. They
  **skip** when that variable is unset (see the deviation note in
  `docs/STATUS.md`: `testcontainers-go` is not used).

```bash
createdb campuslive_test
TEST_DATABASE_URL='postgres://campuslive:campuslive@127.0.0.1:5432/campuslive_test?sslmode=disable' \
  go test -race ./...
```

The contract tests truncate and reseed `TEST_DATABASE_URL` on every fixture —
never point it at a database you care about.

## Docker

The build context is the repository root, because the image needs
`packages/map-data/building-a.json`:

```bash
docker build -f services/api/Dockerfile -t campuslive-api .
```

`infra/docker-compose.yml` probes the container with `/app/api -healthcheck`,
which requests `/healthz` on the container's own `PORT` and exits 0 or 1.

## Plugging in a real timetable

Implement `schedule.ScheduleSource` (ARCHITECTURE §17) and write into `lessons`
and `session_overrides`; rooms are matched by `rooms.code`. The engine, the API
and the frontend see no difference — `SeedSource` is just the v1 implementation.
