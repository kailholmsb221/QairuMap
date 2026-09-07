package engine_test

import (
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
	"github.com/kailholmes/campuslive/services/api/internal/engine"
)

// phaseFingerprint is everything the scheduler promises will not change before
// nextTransitionAt: the phase of every session, the state of every room and the
// NOW list.
func phaseFingerprint(snap domain.Snapshot, th engine.Thresholds) string {
	var b strings.Builder
	for _, r := range snap.Rooms {
		fmt.Fprintf(&b, "room %s=%s", r.Room.Code, r.Phase)
		if r.Current != nil {
			fmt.Fprintf(&b, " cur=%s", r.Current.ID)
		}
		if r.Next != nil {
			fmt.Fprintf(&b, " next=%s", r.Next.ID)
		}
		if r.FreeUntil != nil {
			fmt.Fprintf(&b, " free=%s", rfc(*r.FreeUntil))
		}
		b.WriteByte('\n')
	}
	for _, s := range snap.Now {
		fmt.Fprintf(&b, "now %s %s\n", s.ID, engine.PhaseOf(s, snap.At, th))
	}
	fmt.Fprintf(&b, "stats %+v\n", snap.Stats)
	return b.String()
}

// nextFingerprint is the NEXT list, which additionally moves when a session
// crosses the 90-minute horizon.
func nextFingerprint(snap domain.Snapshot) string {
	var b strings.Builder
	for _, s := range snap.Next {
		fmt.Fprintf(&b, "next %s %s\n", s.ID, s.Status)
	}
	return b.String()
}

// TestDayWalkNextTransitionAt walks a whole day one minute at a time and proves
// the property the scheduler is built on (ARCHITECTURE §8.3): nothing about the
// board's phases can change strictly before `nextTransitionAt`, and every
// change that does happen lands exactly on a predicted boundary.
func TestDayWalkNextTransitionAt(t *testing.T) {
	t.Parallel()

	dc, sessions := heroDay(t)
	th := engine.DefaultThresholds()

	// The boundaries the spec names: start-Soon, start, end-Ending, end.
	phaseBoundaries := map[time.Time]bool{}
	// The NEXT list additionally turns over when a session enters the horizon.
	nextBoundaries := map[time.Time]bool{}
	for _, s := range sessions {
		for _, b := range []time.Time{
			s.StartAt.Add(-th.Soon), s.StartAt,
			s.EndAt.Add(-th.Ending), s.EndAt,
		} {
			phaseBoundaries[b] = true
			nextBoundaries[b] = true
		}
		nextBoundaries[s.StartAt.Add(-th.NextHorizon)] = true
		nextBoundaries[s.SlotStart.Add(-th.NextHorizon)] = true
		nextBoundaries[s.SlotStart] = true
	}

	sortedBoundaries := make([]time.Time, 0, len(phaseBoundaries))
	for b := range phaseBoundaries {
		sortedBoundaries = append(sortedBoundaries, b)
	}
	sort.Slice(sortedBoundaries, func(i, j int) bool { return sortedBoundaries[i].Before(sortedBoundaries[j]) })

	start := at(tuesday, 0, 0)
	end := at(tuesday.AddDays(1), 0, 0)

	var (
		prev       time.Time
		prevPhase  string
		prevNext   string
		prevNextAt *time.Time
		first      = true
		observed   = map[time.Time]bool{}
	)

	for now := start; now.Before(end); now = now.Add(time.Minute) {
		snap := engine.ComputeSnapshot(dc, sessions, now, th)

		// (1) nextTransitionAt is exactly the smallest boundary after now.
		wantNext := (*time.Time)(nil)
		for _, b := range sortedBoundaries {
			if b.After(now) {
				b := b
				wantNext = &b
				break
			}
		}
		if wantNext == nil {
			require.Nil(t, snap.NextTransitionAt, "at %s", rfc(now))
		} else {
			require.NotNil(t, snap.NextTransitionAt, "at %s", rfc(now))
			require.True(t, wantNext.Equal(*snap.NextTransitionAt),
				"at %s want %s got %s", rfc(now), rfc(*wantNext), rfc(*snap.NextTransitionAt))
		}

		fp := phaseFingerprint(snap, th)
		nfp := nextFingerprint(snap)

		if !first {
			if fp != prevPhase {
				// (2) Phases only ever move on a spec boundary…
				b := boundaryIn(phaseBoundaries, prev, now)
				require.NotNil(t, b, "the board changed between %s and %s with no phase boundary in between", rfc(prev), rfc(now))
				observed[*b] = true

				// (3) …and never before the nextTransitionAt we promised.
				require.NotNil(t, prevNextAt, "at %s the board changed although nothing was scheduled", rfc(prev))
				require.False(t, prevNextAt.After(now),
					"the board changed at %s but we told the scheduler to sleep until %s", rfc(now), rfc(*prevNextAt))
			}
			if nfp != prevNext {
				// (4) The NEXT list only moves on a boundary or a horizon entry.
				require.NotNil(t, boundaryIn(nextBoundaries, prev, now),
					"NEXT changed between %s and %s with no boundary in between", rfc(prev), rfc(now))
			}
		}

		prev, prevPhase, prevNext, prevNextAt, first = now, fp, nfp, snap.NextTransitionAt, false
	}

	// Every phase boundary of the day was actually exercised by the walk —
	// otherwise the property above would be vacuously true.
	require.NotEmpty(t, observed)
	require.GreaterOrEqual(t, len(observed), 8, "the hero day should cross at least eight distinct boundaries")
}

// boundaryIn returns a boundary b with prev < b <= now, if any.
func boundaryIn(boundaries map[time.Time]bool, prev, now time.Time) *time.Time {
	for b := range boundaries {
		if b.After(prev) && !b.After(now) {
			b := b
			return &b
		}
	}
	return nil
}

// TestDayWalkIsIdempotent proves ComputeSnapshot is pure: recomputing the same
// instant from the same inputs yields an identical snapshot, which is what lets
// `?at=` time travel share the engine with the live board.
func TestDayWalkIsIdempotent(t *testing.T) {
	t.Parallel()

	dc, sessions := heroDay(t)
	th := engine.DefaultThresholds()

	for _, hm := range [][2]int{{7, 0}, {10, 0}, {10, 47}, {11, 50}, {14, 0}, {23, 59}} {
		now := at(tuesday, hm[0], hm[1])
		a := engine.ComputeSnapshot(dc, sessions, now, th)
		b := engine.ComputeSnapshot(dc, sessions, now, th)
		require.Equal(t, a, b, "at %02d:%02d", hm[0], hm[1])
	}
}
