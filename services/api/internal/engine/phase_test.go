package engine_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
	"github.com/kailholmes/campuslive/services/api/internal/engine"
)

// TestPhaseOfBoundaries walks every inclusive/exclusive edge of ARCHITECTURE
// §7.2 for a 10:00–10:50 session with the default 10 m / 5 m windows.
func TestPhaseOfBoundaries(t *testing.T) {
	t.Parallel()

	th := engine.DefaultThresholds()
	d := domain.NewDate(2026, time.September, 8)
	s := domain.Session{
		ID:      "s",
		StartAt: at(d, 10, 0),
		EndAt:   at(d, 10, 50),
		Status:  domain.StatusScheduled,
	}

	tests := []struct {
		name string
		now  time.Time
		want domain.Phase
	}{
		{"long before", at(d, 8, 0), domain.PhaseUpcoming},
		{"one second before the soon window", s.StartAt.Add(-th.Soon - time.Second), domain.PhaseUpcoming},
		{"exactly at start-Soon is soon (inclusive)", s.StartAt.Add(-th.Soon), domain.PhaseSoon},
		{"one second inside the soon window", s.StartAt.Add(-th.Soon + time.Second), domain.PhaseSoon},
		{"one second before start is still soon (exclusive)", s.StartAt.Add(-time.Second), domain.PhaseSoon},
		{"exactly at start is live (inclusive)", s.StartAt, domain.PhaseLive},
		{"mid lesson", at(d, 10, 20), domain.PhaseLive},
		{"one second before end-Ending is live (exclusive)", s.EndAt.Add(-th.Ending - time.Second), domain.PhaseLive},
		{"exactly at end-Ending is ending (inclusive)", s.EndAt.Add(-th.Ending), domain.PhaseEnding},
		{"one second before end is ending (exclusive)", s.EndAt.Add(-time.Second), domain.PhaseEnding},
		{"exactly at end is done (inclusive)", s.EndAt, domain.PhaseDone},
		{"long after", at(d, 18, 0), domain.PhaseDone},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tc.want, engine.PhaseOf(s, tc.now, th))
		})
	}
}

func TestPhaseOfCancelledIsAlwaysCancelled(t *testing.T) {
	t.Parallel()

	th := engine.DefaultThresholds()
	d := domain.NewDate(2026, time.September, 8)
	s := domain.Session{
		ID:      "s",
		StartAt: at(d, 10, 0),
		EndAt:   at(d, 10, 50),
		Status:  domain.StatusCancelled,
	}

	for _, now := range []time.Time{at(d, 8, 0), at(d, 9, 55), at(d, 10, 0), at(d, 10, 30), at(d, 10, 50), at(d, 20, 0)} {
		require.Equal(t, domain.PhaseCancelled, engine.PhaseOf(s, now, th), "at %s", now)
	}
}

// A session shorter than the ending window has no live phase at all: it must
// still resolve, going soon → ending → done rather than reporting a live window
// that does not exist.
func TestPhaseOfSessionShorterThanEndingWindow(t *testing.T) {
	t.Parallel()

	th := engine.DefaultThresholds()
	d := domain.NewDate(2026, time.September, 8)
	s := domain.Session{
		ID:      "short",
		StartAt: at(d, 10, 0),
		EndAt:   at(d, 10, 3), // 3 minutes, shorter than Ending = 5m
		Status:  domain.StatusScheduled,
	}

	require.Equal(t, domain.PhaseSoon, engine.PhaseOf(s, at(d, 9, 55), th))
	require.Equal(t, domain.PhaseEnding, engine.PhaseOf(s, at(d, 10, 0), th))
	require.Equal(t, domain.PhaseEnding, engine.PhaseOf(s, at(d, 10, 2), th))
	require.Equal(t, domain.PhaseDone, engine.PhaseOf(s, at(d, 10, 3), th))
}

func TestPhaseOfZeroThresholds(t *testing.T) {
	t.Parallel()

	th := engine.Thresholds{}
	d := domain.NewDate(2026, time.September, 8)
	s := domain.Session{ID: "s", StartAt: at(d, 10, 0), EndAt: at(d, 10, 50), Status: domain.StatusScheduled}

	// With no soon and no ending window a session is only ever upcoming, live
	// or done.
	require.Equal(t, domain.PhaseUpcoming, engine.PhaseOf(s, at(d, 9, 59), th))
	require.Equal(t, domain.PhaseLive, engine.PhaseOf(s, at(d, 10, 0), th))
	require.Equal(t, domain.PhaseLive, engine.PhaseOf(s, at(d, 10, 49), th))
	require.Equal(t, domain.PhaseDone, engine.PhaseOf(s, at(d, 10, 50), th))
}

func TestDefaultThresholds(t *testing.T) {
	t.Parallel()
	th := engine.DefaultThresholds()
	require.Equal(t, 10*time.Minute, th.Soon)
	require.Equal(t, 5*time.Minute, th.Ending)
	require.Equal(t, 90*time.Minute, th.NextHorizon)
}
