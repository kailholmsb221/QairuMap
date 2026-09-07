// Package schedule holds the seam that lets a real university timetable
// replace the demo data (ARCHITECTURE §17). Everything above it — the engine,
// the API, the frontend — only ever sees `lessons` and `session_overrides`, so
// swapping the source changes nothing else.
package schedule

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kailholmes/campuslive/services/api/internal/clock"
	"github.com/kailholmes/campuslive/services/api/internal/domain"
	"github.com/kailholmes/campuslive/services/api/internal/mapspec"
	"github.com/kailholmes/campuslive/services/api/internal/seed"
)

// SyncReport says what a synchronisation wrote.
type SyncReport struct {
	Source        string
	From          time.Time
	To            time.Time
	Skipped       bool
	Rooms         int
	Teachers      int
	Groups        int
	Courses       int
	Lessons       int
	Overrides     int
	Announcements int
}

// String renders a one-line summary for the seeder's log.
func (r SyncReport) String() string {
	if r.Skipped {
		return r.Source + ": already seeded, nothing written"
	}
	return fmt.Sprintf(
		"%s: %d rooms, %d teachers, %d groups, %d courses, %d lessons, %d overrides, %d announcements",
		r.Source, r.Rooms, r.Teachers, r.Groups, r.Courses, r.Lessons, r.Overrides, r.Announcements,
	)
}

// ScheduleSource is the pluggable timetable provider (ARCHITECTURE §17).
// SeedSource is the v1 implementation; an ExcelSource or an ExternalAPISource
// would satisfy the same interface without touching anything above it.
type ScheduleSource interface {
	// Sync brings the stored templates and overrides up to date for a period.
	Sync(ctx context.Context, from, to time.Time) (SyncReport, error)
}

// SeedSource generates the deterministic demo timetable (ARCHITECTURE §13).
type SeedSource struct {
	pool  *pgxpool.Pool
	spec  *mapspec.Spec
	clock clock.Clock
	reset bool
}

// NewSeedSource builds a source that writes into pool. When reset is true every
// table is truncated first; otherwise an already-seeded database is left alone.
func NewSeedSource(pool *pgxpool.Pool, spec *mapspec.Spec, clk clock.Clock, reset bool) *SeedSource {
	return &SeedSource{pool: pool, spec: spec, clock: clk, reset: reset}
}

// Sync generates the dataset and writes it. `from` fixes the local date the
// scripted per-day overrides are anchored to; the zero value means "now".
func (s *SeedSource) Sync(ctx context.Context, from, to time.Time) (SyncReport, error) {
	rep := SyncReport{Source: "seed", From: from, To: to}

	loc, err := time.LoadLocation(s.spec.Timezone)
	if err != nil {
		return rep, fmt.Errorf("schedule: time zone %q: %w", s.spec.Timezone, err)
	}
	anchor := from
	if anchor.IsZero() {
		anchor = s.clock.Now()
	}

	ds, err := seed.Generate(seed.Options{Spec: s.spec, Today: domain.DateIn(anchor, loc)})
	if err != nil {
		return rep, err
	}

	written, err := seed.Write(ctx, s.pool, ds, s.reset)
	if err != nil {
		return rep, err
	}

	rep.Skipped = written.Skipped
	rep.Rooms = written.Rooms
	rep.Teachers = written.Teachers
	rep.Groups = written.Groups
	rep.Courses = written.Courses
	rep.Lessons = written.Lessons
	rep.Overrides = written.Overrides
	rep.Announcements = written.Announcements
	return rep, nil
}

// Compile-time proof that the demo generator really is just one implementation.
var _ ScheduleSource = (*SeedSource)(nil)
