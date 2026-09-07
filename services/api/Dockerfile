# syntax=docker/dockerfile:1
# Build context is the repo root (see infra/docker-compose.yml) so that
# packages/map-data/building-a.json is available to `cmd/seed` and to `/map`.

FROM golang:1.24-alpine AS builder
WORKDIR /src
RUN apk add --no-cache git ca-certificates

# Dependencies first, so a source-only change reuses this layer.
COPY services/api/go.mod services/api/go.su[m] ./services/api/
WORKDIR /src/services/api
RUN go mod download

WORKDIR /src
COPY services/api ./services/api
COPY packages/map-data/building-a.json ./packages/map-data/building-a.json

WORKDIR /src/services/api
# CGO off: the runtime image is distroless/static and has no libc.
ENV CGO_ENABLED=0 GOOS=linux
RUN go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api \
 && go build -trimpath -ldflags="-s -w" -o /out/seed ./cmd/seed

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=builder /out/api /app/api
COPY --from=builder /out/seed /app/seed
# The geometry the /map endpoint and the seeder read. Migrations are embedded
# in the binaries (migrations/embed.go), so they are not copied.
COPY --from=builder /src/packages/map-data/building-a.json /app/map-data/building-a.json
ENV PORT=8080 \
    MAP_DATA_PATH=/app/map-data/building-a.json
EXPOSE 8080
USER nonroot:nonroot
# infra/docker-compose.yml probes the container with `/app/api -healthcheck`.
ENTRYPOINT ["/app/api"]
