// Package migrations embeds the goose SQL migrations so that `cmd/api`
// (MIGRATE_ON_START=true) and `cmd/seed` (always) can migrate without shipping
// the .sql files alongside the binary.
package migrations

import "embed"

// FS holds every goose migration in this directory.
//
//go:embed *.sql
var FS embed.FS
