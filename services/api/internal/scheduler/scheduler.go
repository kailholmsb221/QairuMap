// Package scheduler is the loop that makes the board live without polling: it
// sleeps until the next phase boundary the engine predicted, rebuilds and
// broadcasts (ARCHITECTURE §8.3).
package scheduler

import (
	"context"
	"log/slog"
	"time"

	"github.com/kailholmes/campuslive/services/api/internal/clock"
	"github.com/kailholmes/campuslive/services/api/internal/domain"
	"github.com/kailholmes/campuslive/services/api/internal/service"
)

// MaxSleep is the safety cap on how long the loop may sleep, so that a data
// change made outside the API (or a date rollover) is picked up anyway.
const MaxSleep = 5 * time.Minute

// MinSleep keeps a pathological timeline from spinning the loop.
const MinSleep = 250 * time.Millisecond

// Publisher receives every rebuilt snapshot.
type Publisher interface {
	PublishSnapshot(building string, snap domain.Snapshot)
}

// Scheduler drives one building.
type Scheduler struct {
	board     *service.Board
	publisher Publisher
	clock     clock.Clock
	log       *slog.Logger
	building  string

	invalidate chan struct{}
}

// New builds the loop.
func New(board *service.Board, publisher Publisher, clk clock.Clock, log *slog.Logger, building string) *Scheduler {
	if log == nil {
		log = slog.Default()
	}
	return &Scheduler{
		board:      board,
		publisher:  publisher,
		clock:      clk,
		log:        log,
		building:   building,
		invalidate: make(chan struct{}, 1),
	}
}

// Invalidate asks the loop to rebuild now. It never blocks: one pending wake-up
// is as good as ten.
func (s *Scheduler) Invalidate() {
	select {
	case s.invalidate <- struct{}{}:
	default:
	}
}

// Run rebuilds, publishes and sleeps until the engine's next transition, until
// the context is cancelled.
func (s *Scheduler) Run(ctx context.Context) {
	lastDate := domain.Date{}

	for {
		var wait time.Duration

		snap, _, err := s.board.Rebuild(ctx, s.building)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			s.log.Error("scheduler rebuild failed", slog.String("building", s.building), slog.Any("err", err))
			wait = 5 * time.Second
		} else {
			s.publisher.PublishSnapshot(s.building, snap)

			if !snap.Date.Equal(lastDate) {
				s.log.Info("board rolled over to a new day",
					slog.String("building", s.building), slog.String("date", snap.Date.String()))
				lastDate = snap.Date
			}
			wait = s.sleepFor(snap)
			s.log.Debug("scheduler sleeping",
				slog.String("building", s.building),
				slog.Duration("wait", wait),
				slog.Int("roomsBusy", snap.Stats.RoomsBusy),
				slog.Int("now", len(snap.Now)),
			)
		}

		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		case <-s.invalidate:
			timer.Stop()
		}
	}
}

// sleepFor is min(nextTransitionAt - now, MaxSleep), clamped from below.
func (s *Scheduler) sleepFor(snap domain.Snapshot) time.Duration {
	wait := MaxSleep
	if snap.NextTransitionAt != nil {
		if d := snap.NextTransitionAt.Sub(s.clock.Now()); d < wait {
			wait = d
		}
	}
	if wait < MinSleep {
		wait = MinSleep
	}
	return wait
}
