# CampusLive API — see README.md.
#
# The build sandbox this service was authored in cannot reach proxy.golang.org,
# so every go invocation goes through GOFLAGS below. On a normal network they
# are harmless.

SHELL := /bin/bash
export GOPROXY ?= direct
export GOSUMDB ?= off
export GOTOOLCHAIN ?= local

DATABASE_URL      ?= postgres://campuslive:campuslive@127.0.0.1:5432/campuslive?sslmode=disable
TEST_DATABASE_URL ?= postgres://campuslive:campuslive@127.0.0.1:5432/campuslive_test?sslmode=disable
CONTRACT          := ../../packages/contracts/openapi.yaml

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

.PHONY: generate
generate: ## Regenerate gen.go (oapi-codegen) and internal/repo/gen (sqlc)
	oapi-codegen -config oapi.yaml $(CONTRACT)
	sqlc generate

.PHONY: build
build: ## Build both binaries
	go build ./...

.PHONY: vet
vet: ## go vet
	go vet ./...

.PHONY: lint
lint: ## golangci-lint
	golangci-lint run ./...

.PHONY: test
test: ## Unit tests (database-backed tests skip without TEST_DATABASE_URL)
	go test -race -cover ./...

.PHONY: test-all
test-all: ## Every test, including the contract tests against TEST_DATABASE_URL
	TEST_DATABASE_URL=$(TEST_DATABASE_URL) go test -race -cover ./...

.PHONY: cover-engine
cover-engine: ## Print the engine's coverage
	go test -cover ./internal/engine/...

.PHONY: golden
golden: ## Rewrite the engine's golden fixtures
	go test ./internal/engine/... -update

.PHONY: migrate
migrate: ## Apply the migrations to DATABASE_URL
	DATABASE_URL=$(DATABASE_URL) MIGRATE_ON_START=true go run ./cmd/api -healthcheck || true
	@echo "use 'make seed' — cmd/seed always migrates first"

.PHONY: seed
seed: ## Truncate and reseed the demo data
	DATABASE_URL=$(DATABASE_URL) go run ./cmd/seed --reset

.PHONY: run
run: ## Run the API against DATABASE_URL
	DATABASE_URL=$(DATABASE_URL) go run ./cmd/api

.PHONY: demo
demo: ## Run the API frozen at the design's hero instant (Tue 8 Sep 2026, 10:47)
	DATABASE_URL=$(DATABASE_URL) \
	CLOCK_MODE=fixed CLOCK_FIXED_AT=2026-09-08T10:47:00+05:00 \
	ADMIN_API_KEY=dev-admin-key \
	go run ./cmd/api

.PHONY: check
check: build vet lint test ## Everything CI runs
