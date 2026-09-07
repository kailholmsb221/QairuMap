# CampusLive
Single-screen realtime "airport board" + 2.5D map of a university building. Read docs/ARCHITECTURE.md before changing anything.
## Commands
pnpm dev · pnpm map:build · pnpm seed · pnpm test · pnpm e2e · pnpm demo · pnpm demo:script
## Rules
- Status/phase logic lives ONLY in services/api/internal/engine (pure Go). Frontend derives progress/countdown from timestamps only.
- All server time comes from internal/clock. Never call time.Now() elsewhere.
- API types are generated from packages/contracts/openapi.yaml (oapi-codegen, openapi-typescript). Never hand-write DTOs.
- Room geometry comes only from packages/map-data/building-a.json (built from svg/). Never hard-code coordinates.
- The page never scrolls. Animate transform/opacity only. Respect prefers-reduced-motion.
- Every phase ends with green quality gates and an updated docs/STATUS.md.

## Repo map
`apps/web` — Next.js 15 App Router UI (board, 2.5D map, overlays). `services/api` — Go service (`cmd/api`, `cmd/seed`, `internal/{domain,engine,schedule,repo,httpapi,realtime,scheduler,clock,config,seed}`, goose `migrations/`). `packages/contracts` — `openapi.yaml` (single source of truth for the HTTP contract) plus the committed `src/types.gen.ts` produced by `openapi-typescript`; Go types are generated from the same file into `services/api/internal/httpapi/gen.go` by `oapi-codegen`. `packages/map-data` — `svg/floor-{1..4}.svg` (geometry source of truth) → `scripts/svg2map.ts` → committed `building-a.json`, validated against `schema.json`; consumed by both the web app and `cmd/seed`. `infra` — docker-compose, Caddyfile, `.env.example`, demo scripts. `docs` — ARCHITECTURE.md, STATUS.md, design exports and prompts.
