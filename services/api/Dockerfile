# syntax=docker/dockerfile:1
# Build context is the repo root (see infra/docker-compose.yml) so that
# packages/map-data/building-a.json is available to `cmd/seed`.

FROM golang:1.24-alpine AS builder
WORKDIR /src
RUN apk add --no-cache git ca-certificates

COPY services/api/go.mod services/api/go.su[m] ./services/api/
WORKDIR /src/services/api
RUN go mod download || true

WORKDIR /src
COPY services/api ./services/api
COPY packages/map-data/building-a.json ./packages/map-data/building-a.json

WORKDIR /src/services/api
ENV CGO_ENABLED=0 GOOS=linux
RUN go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api \
 && go build -trimpath -ldflags="-s -w" -o /out/seed ./cmd/seed

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=builder /out/api /app/api
COPY --from=builder /out/seed /app/seed
COPY --from=builder /src/services/api/migrations /app/migrations
COPY --from=builder /src/packages/map-data/building-a.json /app/map-data/building-a.json
ENV PORT=8080 MAP_SPEC_PATH=/app/map-data/building-a.json MIGRATIONS_DIR=/app/migrations
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/api"]
