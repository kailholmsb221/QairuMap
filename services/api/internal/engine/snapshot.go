package engine

import (
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
)

// Thresholds are the three windows that shape the board (ARCHITECTURE §7.2).
type Thresholds struct {
	// Soon is how long before its start a session shows as STARTING SOON.
	Soon time.Duration
	// Ending is how long before its end a session shows as ENDING.
	Ending time.Duration
	// NextHorizon is how far ahead the NEXT list looks.
	NextHorizon time.Duration
}

// DefaultThresholds are the documented defaults: 10 / 5 / 90 minutes.
func DefaultThresholds() Thresholds {
	return Thresholds{
		Soon:        10 * time.Minute,
		Ending:      5 * time.Minute,
		NextHorizon: 90 * time.Minute,
	}
}

// DayContext is the non-session half of a snapshot: which building and local
// date the sessions belong to, and every room the building has.
type DayContext struct {
	Building domain.Building
	Semester domain.Semester
	Date     domain.Date
	Rooms    []domain.Room
}

// PhaseOf classifies one session against `now` (ARCHITECTURE §7.2):
//
//	now <  start-Soon        → upcoming
//	start-Soon ≤ now < start  → soon
//	start ≤ now < end-Ending  → live
//	end-Ending ≤ now < end    → ending
//	now ≥ end                 → done
//	status == cancelled       → cancelled
//
// The comparisons are evaluated from the end backwards so that a session
// shorter than the ending window (end-Ending ≤ start) still resolves — it goes
// straight from soon to ending, never reporting a live window that does not
// exist.
func PhaseOf(s domain.Session, now time.Time, th Thresholds) domain.Phase {
	if s.Status == domain.StatusCancelled {
		return domain.PhaseCancelled
	}
	switch {
	case !now.Before(s.EndAt):
		return domain.PhaseDone
	case !now.Before(s.EndAt.Add(-th.Ending)):
		return domain.PhaseEnding
	case !now.Before(s.StartAt):
		return domain.PhaseLive
	case !now.Before(s.StartAt.Add(-th.Soon)):
		return domain.PhaseSoon
	default:
		return domain.PhaseUpcoming
	}
}

// occupies reports whether a phase makes its session the owner of a room.
func occupies(p domain.Phase) bool {
	return p == domain.PhaseLive || p == domain.PhaseEnding
}

// ComputeSnapshot turns a materialised day plus an instant into the complete
// board state (ARCHITECTURE §7.2). It is pure: same inputs, same output.
func ComputeSnapshot(dc DayContext, sessions []domain.Session, now time.Time, th Thresholds) domain.Snapshot {
	weekNumber, weekParity := WeekInfo(dc.Semester, dc.Date)

	phases := make([]domain.Phase, len(sessions))
	for i := range sessions {
		phases[i] = PhaseOf(sessions[i], now, th)
	}

	snap := domain.Snapshot{
		Building:         dc.Building.Code,
		At:               now,
		Date:             dc.Date,
		WeekNumber:       weekNumber,
		WeekParity:       weekParity,
		NextTransitionAt: nextTransitionAt(sessions, now, th),
		Rooms:            roomStates(dc.Rooms, sessions, phases),
		Now:              nowList(sessions, phases),
		Next:             nextList(sessions, phases, now, th),
	}
	snap.Stats = computeStats(snap.Rooms, sessions, phases)
	return snap
}

// roomStates derives the live state of every room of the building — schedulable
// or not, so the map can render them all.
func roomStates(rooms []domain.Room, sessions []domain.Session, phases []domain.Phase) []domain.RoomState {
	// Cancelled sessions do not occupy their room, so they are not indexed here.
	byRoom := make(map[uuid.UUID][]int, len(rooms))
	for i := range sessions {
		if phases[i] == domain.PhaseCancelled {
			continue
		}
		byRoom[sessions[i].Room.ID] = append(byRoom[sessions[i].Room.ID], i)
	}

	out := make([]domain.RoomState, 0, len(rooms))
	for _, room := range rooms {
		idx := byRoom[room.ID]
		state := domain.RoomState{Room: room, Phase: domain.RoomFree}

		// The owning session is the running one; when two overlap (conflict),
		// the earliest start owns the room.
		owner := -1
		for _, i := range idx {
			if !occupies(phases[i]) {
				continue
			}
			if owner < 0 || earlier(sessions[i], sessions[owner]) {
				owner = i
			}
		}

		// The next session today is the earliest one that has not started.
		next := -1
		for _, i := range idx {
			if phases[i] != domain.PhaseSoon && phases[i] != domain.PhaseUpcoming {
				continue
			}
			if next < 0 || earlier(sessions[i], sessions[next]) {
				next = i
			}
		}

		if owner >= 0 {
			s := sessions[owner]
			state.Phase = domain.RoomPhase(phases[owner])
			state.Current = &s
		} else if next >= 0 && phases[next] == domain.PhaseSoon {
			state.Phase = domain.RoomSoon
		}

		if next >= 0 {
			s := sessions[next]
			state.Next = &s
			// freeUntil answers "when is this free room taken next?" — it is
			// nil while the room is busy, and nil when nothing is left today.
			if owner < 0 {
				start := s.StartAt
				state.FreeUntil = &start
			}
		}

		out = append(out, state)
	}
	return out
}

// earlier orders two sessions of the same room deterministically.
func earlier(a, b domain.Session) bool {
	if !a.StartAt.Equal(b.StartAt) {
		return a.StartAt.Before(b.StartAt)
	}
	return a.ID < b.ID
}

// nowList is every running session, sorted by end time then room code.
func nowList(sessions []domain.Session, phases []domain.Phase) []domain.Session {
	out := make([]domain.Session, 0, len(sessions))
	for i := range sessions {
		if occupies(phases[i]) {
			out = append(out, sessions[i])
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if !a.EndAt.Equal(b.EndAt) {
			return a.EndAt.Before(b.EndAt)
		}
		if a.Room.Code != b.Room.Code {
			return a.Room.Code < b.Room.Code
		}
		return a.ID < b.ID
	})
	return out
}

// nextList is what starts within the horizon, sorted by start time.
//
// It holds the sessions in phase soon or upcoming that start no later than
// now+NextHorizon, plus the cancelled and moved ones whose *original slot*
// falls in the same window — a cancellation is only news while the class it
// replaced would still have been ahead of you.
func nextList(sessions []domain.Session, phases []domain.Phase, now time.Time, th Thresholds) []domain.Session {
	horizon := now.Add(th.NextHorizon)
	out := make([]domain.Session, 0, len(sessions))
	seen := make(map[string]bool, len(sessions))

	add := func(i int) {
		if seen[sessions[i].ID] {
			return
		}
		seen[sessions[i].ID] = true
		out = append(out, sessions[i])
	}

	for i := range sessions {
		p := phases[i]
		if (p == domain.PhaseSoon || p == domain.PhaseUpcoming) && !sessions[i].StartAt.After(horizon) {
			add(i)
			continue
		}
		status := sessions[i].Status
		if status != domain.StatusCancelled && status != domain.StatusMoved {
			continue
		}
		slot := sessions[i].SlotStart
		if slot.After(now) && !slot.After(horizon) {
			add(i)
		}
	}

	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if !a.StartAt.Equal(b.StartAt) {
			return a.StartAt.Before(b.StartAt)
		}
		if a.Room.Code != b.Room.Code {
			return a.Room.Code < b.Room.Code
		}
		return a.ID < b.ID
	})
	return out
}

// computeStats fills the header counters. roomsTotal / roomsBusy count only
// schedulable rooms — the canteen is drawn on the map but never "busy".
func computeStats(rooms []domain.RoomState, sessions []domain.Session, phases []domain.Phase) domain.Stats {
	st := domain.Stats{SessionsToday: len(sessions)}
	for _, r := range rooms {
		if !r.Room.Schedulable {
			continue
		}
		st.RoomsTotal++
		if r.Phase == domain.RoomLive || r.Phase == domain.RoomEnding {
			st.RoomsBusy++
		}
	}
	for _, p := range phases {
		if p == domain.PhaseDone {
			st.SessionsDone++
		}
	}
	return st
}

// nextTransitionAt is the earliest instant strictly after now at which any
// session crosses a phase boundary — the whole reason the scheduler can sleep
// instead of ticking (ARCHITECTURE §7.2). It is nil when the day holds no
// boundary ahead of now.
func nextTransitionAt(sessions []domain.Session, now time.Time, th Thresholds) *time.Time {
	var best time.Time
	found := false

	consider := func(t time.Time) {
		if !t.After(now) {
			return
		}
		if !found || t.Before(best) {
			best, found = t, true
		}
	}

	for _, s := range sessions {
		consider(s.StartAt.Add(-th.Soon))
		consider(s.StartAt)
		consider(s.EndAt.Add(-th.Ending))
		consider(s.EndAt)
	}

	if !found {
		return nil
	}
	return &best
}
