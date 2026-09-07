#!/usr/bin/env bash
# CampusLive demo launcher.
#
# Starts the full Compose stack with CLOCK_MODE=offset, where the offset is
# computed so that the server's "now" lands on the NEXT Tuesday at 10:47 local
# time — the middle of slot 4, with a busy board and a few interesting statuses.
#
#   pnpm demo                 # start the stack at Tuesday 10:47
#   DEMO_WEEKDAY=3 pnpm demo  # ...at Wednesday instead (1=Mon .. 7=Sun)
#   DEMO_TIME=14:05 pnpm demo
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA="$ROOT/infra"

DEMO_WEEKDAY="${DEMO_WEEKDAY:-2}"   # 2 = Tuesday
DEMO_TIME="${DEMO_TIME:-10:47}"

if [ ! -f "$INFRA/.env" ]; then
  echo "infra/.env not found — creating it from infra/.env.example"
  cp "$INFRA/.env.example" "$INFRA/.env"
fi

# Offset = (next DEMO_WEEKDAY at DEMO_TIME local) - now, formatted as a Go duration.
CLOCK_OFFSET="$(node "$INFRA/scripts/clock-offset.mjs" "$DEMO_WEEKDAY" "$DEMO_TIME")"
echo "demo: CLOCK_MODE=offset CLOCK_OFFSET=$CLOCK_OFFSET  (target: weekday $DEMO_WEEKDAY $DEMO_TIME local)"

export CLOCK_MODE=offset
export CLOCK_OFFSET
export ADMIN_API_KEY="${ADMIN_API_KEY:-demo-admin-key}"

docker compose --env-file "$INFRA/.env" -f "$INFRA/docker-compose.yml" up --build -d

echo
echo "  web    http://localhost:3000"
echo "  api    http://localhost:8080/healthz"
echo "  caddy  http://localhost:8000"
echo
echo "Next: API_URL=http://localhost:8080 ADMIN_API_KEY=$ADMIN_API_KEY pnpm demo:script"
