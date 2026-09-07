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
