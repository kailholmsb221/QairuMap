package engine_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
	"github.com/kailholmes/campuslive/services/api/internal/engine"
)

// heroRooms mirrors the rooms the design's hero screen touches, plus one
// non-schedulable space so the stats can be checked.
func heroRooms() []domain.Room {
	return []domain.Room{
		room("101", domain.RoomLecture, 1, true),
		room("110", domain.RoomLecture, 1, true),
		room("113", domain.RoomCoworking, 1, false), // Library — drawn, never busy
		room("205", domain.RoomSeminar, 2, true),
		room("213", domain.RoomLecture, 2, true),
		room("216", domain.RoomLab, 2, true),
		room("303", domain.RoomSeminar, 3, true),
		room("305", domain.RoomSeminar, 3, true),
		room("313", domain.RoomLab, 3, true),
		room("412", domain.RoomLab, 4, true),
		room("414", domain.RoomSeminar, 4, true),
	}
}

// heroLessons and heroOverrides reproduce the Tuesday the design was drawn
// against (docs/design/src/states.mjs, HERO / FOCUS2 / TRAVEL).
func heroLessons() []domain.Lesson {
	return []domain.Lesson{
		lesson("cs201", "CS201", "Databases", "Akhmetov D.", "213", domain.RoomLecture, 2, 2, 3,
			[]string{"ПО2308", "ПО2309"}, withSpan(2), withType(domain.LessonLecture)),
		lesson("cs110", "CS110", "Programming I", "Nurgaliyeva A.", "101", domain.RoomLecture, 1, 2, 3,
			[]string{"ПО2401", "ПО2402"}, withType(domain.LessonLecture)),
		lesson("ma101-305", "MA101", "Discrete Math", "Smirnov P.", "305", domain.RoomSeminar, 3, 2, 3,
			[]string{"ИС2301"}),
		lesson("se330", "SE330", "Web Development", "Kim V.", "216", domain.RoomLab, 2, 2, 3,
			[]string{"ПО2310"}, withType(domain.LessonLab)),
		lesson("ai320", "AI320", "Machine Learning", "Sadykova G.", "412", domain.RoomLab, 4, 2, 3,
			[]string{"БДА2401"}, withType(domain.LessonLab)),
		lesson("cb240", "CB240", "Network Security", "Bekzhanov T.", "313", domain.RoomLab, 3, 2, 3,
			[]string{"КБ2401"}, withType(domain.LessonLab)),
		lesson("ph101", "PH101", "Physics", "Ivanova E.", "110", domain.RoomLecture, 1, 2, 3,
			[]string{"ВТ2401", "ВТ2402"}, withSpan(2), withType(domain.LessonLecture)),
		lesson("cs250", "CS250", "Algorithms", "Orazbayev N.", "303", domain.RoomSeminar, 3, 2, 4,
			[]string{"ИС2301", "ИС2302"}),
		lesson("ma101-101", "MA101", "Discrete Math", "Smirnov P.", "101", domain.RoomLecture, 1, 2, 4,
			[]string{"ПО2401", "ПО2402"}, withType(domain.LessonLecture)),
		lesson("se210", "SE210", "Software Design", "Kairatova M.", "216", domain.RoomLab, 2, 2, 4,
			[]string{"ПО2310"}),
		lesson("ds215", "DS215", "Statistics", "Petrova O.", "412", domain.RoomLab, 4, 2, 4,
			[]string{"БДА2401"}),
		lesson("pm200", "PM200", "Project Management", "Zhumabekov S.", "205", domain.RoomSeminar, 2, 2, 5,
			[]string{"ПО2308"}),
		lesson("cs405", "CS405", "Distributed Systems", "Akhmetov D.", "213", domain.RoomLecture, 2, 2, 7,
			[]string{"ПО2308"}, withType(domain.LessonLecture)),
	}
}

func heroOverrides() []domain.Override {
	byKey := map[string]domain.Lesson{}
	for _, l := range heroLessons() {
		byKey[l.Course.Code] = l
	}

	se210 := byKey["SE210"].ID
	ds215 := byKey["DS215"].ID
	cb240 := byKey["CB240"].ID
	dest := room("414", domain.RoomSeminar, 4, true)
	fifteen := 15

	return []domain.Override{
		override("hero-cancel", &se210, tuesday, domain.OverrideCancel, nil),
		override("hero-move", &ds215, tuesday, domain.OverrideMove, func(o *domain.Override) { o.NewRoom = &dest }),
		override("hero-delay", &cb240, tuesday, domain.OverrideDelay, func(o *domain.Override) { o.DelayMinutes = &fifteen }),
	}
}

func heroDay(t *testing.T) (engine.DayContext, []domain.Session) {
	t.Helper()
	dc := engine.DayContext{
		Building: building(),
		Semester: semester(),
		Date:     tuesday,
		Rooms:    heroRooms(),
	}
	sessions := engine.BuildDayTimeline(dayInput(tuesday, heroLessons(), heroOverrides()))
	require.Len(t, sessions, 13)
	return dc, sessions
}

// ------------------------------------------------------------------ golden --

func TestComputeSnapshotGolden(t *testing.T) {
	t.Parallel()

	dc, sessions := heroDay(t)
	th := engine.DefaultThresholds()

	cases := []struct {
		name string
		hour int
		min  int
	}{
		{"hero-0700-before-hours", 7, 0},
		{"hero-1047", 10, 47},
		{"hero-1108", 11, 8},
		{"hero-1405", 14, 5},
		{"hero-2130-after-hours", 21, 30},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			snap := engine.ComputeSnapshot(dc, sessions, at(tuesday, tc.hour, tc.min), th)
			assertGolden(t, tc.name, snap, th)
		})
	}
}

// ------------------------------------------------------- the hero instant --

func TestComputeSnapshotHeroInstant(t *testing.T) {
	t.Parallel()

	dc, sessions := heroDay(t)
	th := engine.DefaultThresholds()
	snap := engine.ComputeSnapshot(dc, sessions, at(tuesday, 10, 47), th)

	require.Equal(t, "A", snap.Building)
	require.Equal(t, "2026-09-08", snap.Date.String())
	require.Equal(t, 3, snap.WeekNumber)
	require.Equal(t, domain.ParityOdd, snap.WeekParity)

	// The whole building at 10:47 on the design's hero Tuesday.
	require.Equal(t, domain.Stats{RoomsTotal: 10, RoomsBusy: 7, SessionsToday: 13, SessionsDone: 0}, snap.Stats)

	// NOW is sorted by end time, then by room code.
	require.Equal(t, []string{"101", "216", "305", "412", "313", "110", "213"}, roomCodes(snap.Now))
	for _, s := range snap.Now {
		p := engine.PhaseOf(s, snap.At, th)
		require.Contains(t, []domain.Phase{domain.PhaseLive, domain.PhaseEnding}, p)
	}

	// NEXT is sorted by start time, then by room code, and holds the cancelled
	// and the moved row as well as the two ordinary upcoming ones.
	require.Equal(t, []string{"101", "216", "303", "414", "205"}, roomCodes(snap.Next))
	next := byRoom(snap.Next)
	require.Equal(t, domain.StatusCancelled, next["216"].Status)
	require.Equal(t, domain.StatusMoved, next["414"].Status)
	require.Equal(t, "412", next["414"].MovedFromRoomCode)

	// CS405 at 14:00 is more than 90 minutes out.
	require.NotContains(t, roomCodes(snap.Next), "213")

	// The delayed lesson is running late but running.
	nowByRoom := byRoom(snap.Now)
	delayed := nowByRoom["313"]
	require.Equal(t, domain.StatusDelayed, delayed.Status)
	require.NotNil(t, delayed.DelayMinutes)
	require.Equal(t, 15, *delayed.DelayMinutes)
	require.Equal(t, "2026-09-08T06:05:00Z", rfc(delayed.EndAt))
	require.Equal(t, domain.PhaseLive, engine.PhaseOf(delayed, snap.At, th))

	// The next boundary is 10:50 — CS110/MA101/SE330/AI320 end, and CS250 and
	// MA101 at 11:00 enter their soon window at the same instant.
	require.NotNil(t, snap.NextTransitionAt)
	require.Equal(t, "2026-09-08T05:50:00Z", rfc(*snap.NextTransitionAt))
}

func TestComputeSnapshotRoomStatesAtHeroInstant(t *testing.T) {
	t.Parallel()

	dc, sessions := heroDay(t)
	snap := engine.ComputeSnapshot(dc, sessions, at(tuesday, 10, 47), engine.DefaultThresholds())
	rooms := roomStatesByCode(snap.Rooms)

	require.Len(t, snap.Rooms, len(heroRooms()), "every room of the building is reported")

	t.Run("busy room", func(t *testing.T) {
		r := rooms["213"]
		require.Equal(t, domain.RoomLive, r.Phase)
		require.NotNil(t, r.Current)
		require.Equal(t, "CS201", r.Current.Course.Code)
		require.NotNil(t, r.Next, "CS405 at 14:00 is still today")
		require.Equal(t, "CS405", r.Next.Course.Code)
		require.Nil(t, r.FreeUntil, "a busy room has no freeUntil")
	})

	t.Run("ending room", func(t *testing.T) {
		r := rooms["101"]
		require.Equal(t, domain.RoomEnding, r.Phase)
		require.Equal(t, "CS110", r.Current.Course.Code)
		require.Equal(t, "MA101", r.Next.Course.Code)
		require.Nil(t, r.FreeUntil)
	})

	t.Run("free room whose next lesson was cancelled", func(t *testing.T) {
		r := rooms["216"]
		require.Equal(t, domain.RoomEnding, r.Phase, "SE330 is still finishing")
		require.Nil(t, r.Next, "the cancelled SE210 does not take the room")
		require.Nil(t, r.FreeUntil)
	})

	t.Run("free room a class was moved into", func(t *testing.T) {
		r := rooms["414"]
		require.Equal(t, domain.RoomFree, r.Phase)
		require.Nil(t, r.Current)
		require.NotNil(t, r.Next)
		require.Equal(t, "DS215", r.Next.Course.Code)
		require.NotNil(t, r.FreeUntil)
		require.Equal(t, "2026-09-08T06:00:00Z", rfc(*r.FreeUntil))
	})

	t.Run("room a class was moved out of", func(t *testing.T) {
		r := rooms["412"]
		require.Equal(t, domain.RoomEnding, r.Phase, "AI320 is still finishing here")
		require.Nil(t, r.Next, "DS215 now belongs to 414, not to 412")
	})

	t.Run("free room with a later class", func(t *testing.T) {
		r := rooms["205"]
		require.Equal(t, domain.RoomFree, r.Phase)
		require.Nil(t, r.Current)
		require.Equal(t, "PM200", r.Next.Course.Code)
		require.Equal(t, "2026-09-08T07:00:00Z", rfc(*r.FreeUntil))
	})

	t.Run("non-schedulable room", func(t *testing.T) {
		r := rooms["113"]
		require.Equal(t, domain.RoomFree, r.Phase)
		require.Nil(t, r.Current)
		require.Nil(t, r.Next)
		require.Nil(t, r.FreeUntil)
	})
}

// Three minutes later, 303 has entered its soon window: the room reads `soon`
// but is still free, and freeUntil points at the class about to start.
func TestComputeSnapshotSoonRoom(t *testing.T) {
	t.Parallel()

	dc, sessions := heroDay(t)
	snap := engine.ComputeSnapshot(dc, sessions, at(tuesday, 10, 50), engine.DefaultThresholds())
	r := roomStatesByCode(snap.Rooms)["303"]

	require.Equal(t, domain.RoomSoon, r.Phase)
	require.Nil(t, r.Current)
	require.NotNil(t, r.Next)
	require.Equal(t, "CS250", r.Next.Course.Code)
	require.NotNil(t, r.FreeUntil)
	require.Equal(t, "2026-09-08T06:00:00Z", rfc(*r.FreeUntil))
}

func TestComputeSnapshotAfterHours(t *testing.T) {
	t.Parallel()

	dc, sessions := heroDay(t)
	snap := engine.ComputeSnapshot(dc, sessions, at(tuesday, 21, 30), engine.DefaultThresholds())

	require.Empty(t, snap.Now)
	require.Empty(t, snap.Next)
	require.Nil(t, snap.NextTransitionAt, "nothing is left to happen today")
	require.Equal(t, 13, snap.Stats.SessionsToday)
	require.Equal(t, 12, snap.Stats.SessionsDone, "the cancelled one never runs, so it never finishes")
	require.Zero(t, snap.Stats.RoomsBusy)

	for _, r := range snap.Rooms {
		require.Equal(t, domain.RoomFree, r.Phase, "room %s", r.Room.Code)
		require.Nil(t, r.Current)
		require.Nil(t, r.Next)
		require.Nil(t, r.FreeUntil)
	}
}

func TestComputeSnapshotBeforeHours(t *testing.T) {
	t.Parallel()

	dc, sessions := heroDay(t)
	snap := engine.ComputeSnapshot(dc, sessions, at(tuesday, 7, 0), engine.DefaultThresholds())

	require.Empty(t, snap.Now)
	require.Empty(t, snap.Next, "the first class is at 10:00, well beyond the 90-minute horizon")
	require.Zero(t, snap.Stats.SessionsDone)
	require.NotNil(t, snap.NextTransitionAt)
	require.Equal(t, "2026-09-08T04:50:00Z", rfc(*snap.NextTransitionAt), "10:00 minus the 10-minute soon window")
}

func TestComputeSnapshotEmptyDay(t *testing.T) {
	t.Parallel()

	dc := engine.DayContext{Building: building(), Semester: semester(), Date: tuesday, Rooms: heroRooms()}
	snap := engine.ComputeSnapshot(dc, nil, at(tuesday, 10, 47), engine.DefaultThresholds())

	require.Empty(t, snap.Now)
	require.Empty(t, snap.Next)
	require.Nil(t, snap.NextTransitionAt)
	require.Equal(t, domain.Stats{RoomsTotal: 10}, snap.Stats)
	require.Len(t, snap.Rooms, len(heroRooms()))
}

// A conflict does not lose a class: both rows are flagged and the earlier start
// owns the room.
func TestComputeSnapshotConflictOwnership(t *testing.T) {
	t.Parallel()

	early := lesson("early", "CS201", "Databases", "Akhmetov D.", "213", domain.RoomLecture, 2, 2, 3, nil, withSpan(2))
	late := lesson("late", "CS405", "Distributed Systems", "Orazbayev N.", "213", domain.RoomLecture, 2, 2, 4, nil)

	dc := engine.DayContext{Building: building(), Semester: semester(), Date: tuesday, Rooms: []domain.Room{room("213", domain.RoomLecture, 2, true)}}
	sessions := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{early, late}, nil))
	snap := engine.ComputeSnapshot(dc, sessions, at(tuesday, 11, 20), engine.DefaultThresholds())

	require.Len(t, snap.Now, 2, "both overlapping classes are on the board")
	for _, s := range snap.Now {
		require.True(t, s.Conflict)
	}
	require.Len(t, snap.Rooms, 1)
	require.NotNil(t, snap.Rooms[0].Current)
	require.Equal(t, "CS201", snap.Rooms[0].Current.Course.Code, "the earlier start owns the room")
	require.Equal(t, 1, snap.Stats.RoomsBusy, "one room, busy once")
}

// A cancelled session shows on the board but never colours its room.
func TestComputeSnapshotCancelledDoesNotOccupyRoom(t *testing.T) {
	t.Parallel()

	l := lesson("only", "SE210", "Software Design", "Kairatova M.", "216", domain.RoomLab, 2, 2, 3, nil)
	lid := l.ID

	dc := engine.DayContext{Building: building(), Semester: semester(), Date: tuesday, Rooms: []domain.Room{room("216", domain.RoomLab, 2, true)}}
	sessions := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{l}, []domain.Override{
		override("c", &lid, tuesday, domain.OverrideCancel, nil),
	}))

	th := engine.DefaultThresholds()

	// While it would be running the room is free and the board's NOW is empty.
	mid := engine.ComputeSnapshot(dc, sessions, at(tuesday, 10, 20), th)
	require.Empty(t, mid.Now)
	require.Equal(t, domain.RoomFree, mid.Rooms[0].Phase)
	require.Nil(t, mid.Rooms[0].Current)
	require.Zero(t, mid.Stats.RoomsBusy)
	require.Zero(t, mid.Stats.SessionsDone, "a cancelled session is never done")

	// Before its slot it still appears in NEXT, so the board can say CANCELLED.
	before := engine.ComputeSnapshot(dc, sessions, at(tuesday, 9, 30), th)
	require.Len(t, before.Next, 1)
	require.Equal(t, domain.StatusCancelled, before.Next[0].Status)

	// Once the slot has passed it drops out again.
	after := engine.ComputeSnapshot(dc, sessions, at(tuesday, 10, 20), th)
	require.Empty(t, after.Next)
}

// The cancelled/moved window is open at (now, now+horizon]: exclusive at now,
// inclusive at the horizon.
func TestComputeSnapshotCancelledNextWindowEdges(t *testing.T) {
	t.Parallel()

	l := lesson("only", "SE210", "Software Design", "Kairatova M.", "216", domain.RoomLab, 2, 2, 4, nil) // 11:00
	lid := l.ID
	dc := engine.DayContext{Building: building(), Semester: semester(), Date: tuesday, Rooms: []domain.Room{room("216", domain.RoomLab, 2, true)}}
	sessions := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{l}, []domain.Override{
		override("c", &lid, tuesday, domain.OverrideCancel, nil),
	}))
	th := engine.DefaultThresholds()

	// now + 90m == 11:00 exactly → included.
	require.Len(t, engine.ComputeSnapshot(dc, sessions, at(tuesday, 9, 30), th).Next, 1)
	// One minute earlier the slot is beyond the horizon → excluded.
	require.Empty(t, engine.ComputeSnapshot(dc, sessions, at(tuesday, 9, 29), th).Next)
	// One second before the slot → still included.
	require.Len(t, engine.ComputeSnapshot(dc, sessions, at(tuesday, 11, 0).Add(-time.Second), th).Next, 1)
	// Exactly at the slot start → gone.
	require.Empty(t, engine.ComputeSnapshot(dc, sessions, at(tuesday, 11, 0), th).Next)
}

func TestComputeSnapshotNextHorizonEdge(t *testing.T) {
	t.Parallel()

	l := lesson("only", "PM200", "Project Management", "Zhumabekov S.", "205", domain.RoomSeminar, 2, 2, 5, nil) // 12:00
	dc := engine.DayContext{Building: building(), Semester: semester(), Date: tuesday, Rooms: []domain.Room{room("205", domain.RoomSeminar, 2, true)}}
	sessions := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{l}, nil))
	th := engine.DefaultThresholds()

	require.Empty(t, engine.ComputeSnapshot(dc, sessions, at(tuesday, 10, 29), th).Next, "91 minutes out")
	require.Len(t, engine.ComputeSnapshot(dc, sessions, at(tuesday, 10, 30), th).Next, 1, "exactly 90 minutes out")
}

// An extra session behaves like any other on the board and in room states.
func TestComputeSnapshotExtraSession(t *testing.T) {
	t.Parallel()

	extraRoom := room("110", domain.RoomLecture, 1, true)
	guest := teacher("Guest speaker")
	ol := course("OL100", "Open Lecture")
	s7 := slot(7)
	ov := override("extra", nil, tuesday, domain.OverrideExtra, func(o *domain.Override) {
		o.NewRoom = &extraRoom
		o.NewTeacher = &guest
		o.Course = &ol
		o.Slot = &s7
		o.Groups = []string{"all groups"}
	})

	dc := engine.DayContext{Building: building(), Semester: semester(), Date: tuesday, Rooms: []domain.Room{extraRoom}}
	sessions := engine.BuildDayTimeline(dayInput(tuesday, nil, []domain.Override{ov}))
	snap := engine.ComputeSnapshot(dc, sessions, at(tuesday, 14, 20), engine.DefaultThresholds())

	require.Len(t, snap.Now, 1)
	require.Equal(t, "OL100", snap.Now[0].Course.Code)
	require.Equal(t, domain.RoomLive, snap.Rooms[0].Phase)
	require.Equal(t, 1, snap.Stats.RoomsBusy)
}

// The board is stated in absolute instants, so a snapshot taken just after
// local midnight still reports the right local date even though UTC is still on
// the previous day.
func TestComputeSnapshotLocalDateAcrossUTCMidnight(t *testing.T) {
	t.Parallel()

	dc, sessions := heroDay(t)
	// 00:30 local on Wed 9 Sep = 19:30 UTC on Tue 8 Sep.
	wed := tuesday.AddDays(1)
	now := at(wed, 0, 30)
	require.Equal(t, "2026-09-08T19:30:00Z", rfc(now))

	snap := engine.ComputeSnapshot(dc, sessions, now, engine.DefaultThresholds())
	require.Equal(t, "2026-09-08", snap.Date.String(), "the snapshot describes the day it was built for")
	require.Equal(t, "2026-09-09", domain.DateIn(now, building().Location).String())
	require.Empty(t, snap.Now)
}

// ----------------------------------------------------------------- helpers --

func roomCodes(sessions []domain.Session) []string {
	out := make([]string, 0, len(sessions))
	for _, s := range sessions {
		out = append(out, s.Room.Code)
	}
	return out
}

func byRoom(sessions []domain.Session) map[string]domain.Session {
	out := make(map[string]domain.Session, len(sessions))
	for _, s := range sessions {
		out[s.Room.Code] = s
	}
	return out
}

func roomStatesByCode(states []domain.RoomState) map[string]domain.RoomState {
	out := make(map[string]domain.RoomState, len(states))
	for _, s := range states {
		out[s.Room.Code] = s
	}
	return out
}
