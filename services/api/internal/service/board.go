// Package service holds the use cases that sit between the HTTP layer and the
// engine: it loads a day from the repository, materialises it once and keeps
// the result cached per building until something invalidates it
// (ARCHITECTURE §8.1).
package service

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/kailholmes/campuslive/services/api/internal/clock"
	"github.com/kailholmes/campuslive/services/api/internal/domain"
	"github.com/kailholmes/campuslive/services/api/internal/engine"
	"github.com/kailholmes/campuslive/services/api/internal/repo"
)

// Day is one materialised local building date.
type Day struct {
	Building domain.Building
	Semester domain.Semester
	Date     domain.Date
	Rooms    []domain.Room
	Slots    []domain.TimeSlot
	Sessions []domain.Session
}

// Context returns the engine's view of this day.
func (d *Day) Context() engine.DayContext {
	return engine.DayContext{
		Building: d.Building,
		Semester: d.Semester,
		Date:     d.Date,
		Rooms:    d.Rooms,
	}
}

// Board owns the per-building snapshot cache.
type Board struct {
	repo  *repo.Repo
	clock clock.Clock
	th    engine.Thresholds

	mu    sync.RWMutex
	cache map[string]*cached
}

type cached struct {
	day      *Day
	snapshot domain.Snapshot
}

// NewBoard builds the cache.
func NewBoard(r *repo.Repo, clk clock.Clock, th engine.Thresholds) *Board {
	return &Board{repo: r, clock: clk, th: th, cache: map[string]*cached{}}
}

// Clock exposes the configured clock so handlers never reach for time.Now().
func (b *Board) Clock() clock.Clock { return b.clock }

// Thresholds exposes the configured windows.
func (b *Board) Thresholds() engine.Thresholds { return b.th }

// Repo exposes the store for the lookup-only handlers.
func (b *Board) Repo() *repo.Repo { return b.repo }

// Now is the server's current instant.
func (b *Board) Now() time.Time { return b.clock.Now() }

// LocalDate is the building's current local date.
func (b *Board) LocalDate(bld domain.Building) domain.Date {
	return domain.DateIn(b.clock.Now(), bld.Location)
}

// LoadDay materialises one local date of one building. Nothing is cached: this
// is the path `?date=` and the per-room / per-teacher / per-group views take.
func (b *Board) LoadDay(ctx context.Context, code string, date domain.Date) (*Day, error) {
	building, err := b.repo.GetBuilding(ctx, code)
	if err != nil {
		return nil, err
	}
	return b.loadDayFor(ctx, building, date)
}

func (b *Board) loadDayFor(ctx context.Context, building domain.Building, date domain.Date) (*Day, error) {
	semester, err := b.repo.SemesterForDate(ctx, date)
	if err != nil {
		return nil, err
	}
	rooms, err := b.repo.ListRooms(ctx, building.ID)
	if err != nil {
		return nil, err
	}
	slots, err := b.repo.ListTimeSlots(ctx, building.ID)
	if err != nil {
		return nil, err
	}
	lessons, err := b.repo.ListLessons(ctx, semester.ID, building.ID, date.ISOWeekday())
	if err != nil {
		return nil, err
	}
	overrides, err := b.repo.ListOverrides(ctx, building.ID, date)
	if err != nil {
		return nil, err
	}

	sessions := engine.BuildDayTimeline(engine.DayInput{
		Building:  building,
		Semester:  semester,
		Date:      date,
		Lessons:   lessons,
		Overrides: overrides,
		Slots:     slots,
	})

	return &Day{
		Building: building,
		Semester: semester,
		Date:     date,
		Rooms:    rooms,
		Slots:    slots,
		Sessions: sessions,
	}, nil
}

// Live returns the cached snapshot for the building's current local date,
// rebuilding it when the cache is cold, stale or the date has rolled over.
func (b *Board) Live(ctx context.Context, code string) (domain.Snapshot, *Day, error) {
	building, err := b.repo.GetBuilding(ctx, code)
	if err != nil {
		return domain.Snapshot{}, nil, err
	}
	now := b.clock.Now()
	date := domain.DateIn(now, building.Location)

	b.mu.RLock()
	entry, ok := b.cache[code]
	b.mu.RUnlock()

	if ok && entry.day.Date.Equal(date) {
		// The timeline for the day is still valid; only the instant moved.
		snap := engine.ComputeSnapshot(entry.day.Context(), entry.day.Sessions, now, b.th)
		b.mu.Lock()
		if cur, ok := b.cache[code]; ok && cur.day == entry.day {
			cur.snapshot = snap
		}
		b.mu.Unlock()
		return snap, entry.day, nil
	}

	return b.rebuild(ctx, building, date, now)
}

// Rebuild forces a reload from the database and recomputes the snapshot. The
// scheduler calls it on every wake-up and after every admin override.
func (b *Board) Rebuild(ctx context.Context, code string) (domain.Snapshot, *Day, error) {
	building, err := b.repo.GetBuilding(ctx, code)
	if err != nil {
		return domain.Snapshot{}, nil, err
	}
	now := b.clock.Now()
	return b.rebuild(ctx, building, domain.DateIn(now, building.Location), now)
}

func (b *Board) rebuild(ctx context.Context, building domain.Building, date domain.Date, now time.Time) (domain.Snapshot, *Day, error) {
	day, err := b.loadDayFor(ctx, building, date)
	if err != nil {
		return domain.Snapshot{}, nil, err
	}
	snap := engine.ComputeSnapshot(day.Context(), day.Sessions, now, b.th)

	b.mu.Lock()
	b.cache[building.Code] = &cached{day: day, snapshot: snap}
	b.mu.Unlock()

	return snap, day, nil
}

// At evaluates the board at an arbitrary instant without touching the live
// cache — this is what the time-travel scrubber calls (`GET /board?at=`).
//
// When date is nil the local date of `at` is used.
func (b *Board) At(ctx context.Context, code string, at time.Time, date *domain.Date) (domain.Snapshot, *Day, error) {
	building, err := b.repo.GetBuilding(ctx, code)
	if err != nil {
		return domain.Snapshot{}, nil, err
	}
	d := domain.DateIn(at, building.Location)
	if date != nil {
		d = *date
	}

	// Reuse the live cache when it already holds exactly this day.
	b.mu.RLock()
	entry, ok := b.cache[code]
	b.mu.RUnlock()
	if ok && entry.day.Date.Equal(d) {
		return engine.ComputeSnapshot(entry.day.Context(), entry.day.Sessions, at, b.th), entry.day, nil
	}

	day, err := b.loadDayFor(ctx, building, d)
	if err != nil {
		return domain.Snapshot{}, nil, err
	}
	return engine.ComputeSnapshot(day.Context(), day.Sessions, at, b.th), day, nil
}

// Invalidate drops the cached day so the next read reloads from the database.
func (b *Board) Invalidate(code string) {
	b.mu.Lock()
	delete(b.cache, code)
	b.mu.Unlock()
}

// Cached reports whether a snapshot has already been built for a building; it
// backs `/readyz`.
func (b *Board) Cached(code string) bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	_, ok := b.cache[code]
	return ok
}

// SessionsFor filters a materialised day. `match` is applied to every session.
func SessionsFor(day *Day, match func(domain.Session) bool) []domain.Session {
	out := make([]domain.Session, 0, len(day.Sessions))
	for _, s := range day.Sessions {
		if match(s) {
			out = append(out, s)
		}
	}
	return out
}

// ParseDate turns a `YYYY-MM-DD` query parameter into a local building date.
func ParseDate(raw string) (domain.Date, error) {
	d, err := domain.ParseDate(raw)
	if err != nil {
		return domain.Date{}, fmt.Errorf("date must be YYYY-MM-DD: %w", err)
	}
	return d, nil
}
