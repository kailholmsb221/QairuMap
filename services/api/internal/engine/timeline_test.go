package engine_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
	"github.com/kailholmes/campuslive/services/api/internal/engine"
)

// tuesday is 8 Sep 2026 — week 3, odd, the day the design's hero screen shows.
var tuesday = domain.NewDate(2026, time.September, 8)

func dayInput(date domain.Date, lessons []domain.Lesson, overrides []domain.Override) engine.DayInput {
	return engine.DayInput{
		Building:  building(),
		Semester:  semester(),
		Date:      date,
		Lessons:   lessons,
		Overrides: overrides,
		Slots:     slots(),
	}
}

func TestBuildDayTimelineSelectsWeekdayAndParity(t *testing.T) {
	t.Parallel()

	lessons := []domain.Lesson{
		lesson("all-tue", "CS201", "Databases", "Akhmetov D.", "213", domain.RoomLecture, 2, 2, 3, []string{"ПО2308"}),
		lesson("odd-tue", "MA101", "Discrete Math", "Smirnov P.", "305", domain.RoomSeminar, 3, 2, 3, []string{"ИС2301"}, withParity(domain.ParityOdd)),
		lesson("even-tue", "PH101", "Physics", "Ivanova E.", "110", domain.RoomLecture, 1, 2, 3, []string{"ВТ2401"}, withParity(domain.ParityEven)),
		lesson("all-wed", "SE330", "Web Development", "Kim V.", "216", domain.RoomLab, 2, 3, 3, []string{"ПО2310"}),
	}

	// Week 3 is odd: `all` and `odd` lessons run, `even` ones do not.
	odd := engine.BuildDayTimeline(dayInput(tuesday, lessons, nil))
	require.Len(t, odd, 2)
	require.Equal(t, []string{"110", "213", "305"}[1], odd[0].Room.Code) // sorted by start then room
	codes := []string{odd[0].Room.Code, odd[1].Room.Code}
	require.ElementsMatch(t, []string{"213", "305"}, codes)

	// Week 4 (15 Sep) is even: the odd lesson drops out, the even one appears.
	even := engine.BuildDayTimeline(dayInput(tuesday.AddDays(7), lessons, nil))
	require.Len(t, even, 2)
	require.ElementsMatch(t, []string{"213", "110"}, []string{even[0].Room.Code, even[1].Room.Code})

	// Wednesday only has the Wednesday lesson.
	wed := engine.BuildDayTimeline(dayInput(tuesday.AddDays(1), lessons, nil))
	require.Len(t, wed, 1)
	require.Equal(t, "216", wed[0].Room.Code)
}

func TestRetiredRoomsKeepTemplatesButDoNotMaterialiseSessions(t *testing.T) {
	t.Parallel()
	closed := lesson("retired-cr", "CS201", "Databases", "Teacher", "CR", domain.RoomSeminar, 1, 2, 3, []string{"Group"})
	closed.Room.Schedulable = false
	active := lesson("active-101", "CS201", "Databases", "Teacher", "101", domain.RoomLab, 1, 2, 4, []string{"Group"})
	input := dayInput(tuesday, []domain.Lesson{closed, active}, nil)
	sessions := engine.BuildDayTimeline(input)
	require.Len(t, input.Lessons, 2, "existing templates must not be deleted")
	require.Len(t, sessions, 1)
	require.Equal(t, "101", sessions[0].Room.Code)

	input.Overrides = []domain.Override{{Kind: domain.OverrideMove, Date: tuesday, LessonID: &active.ID, NewRoom: &closed.Room}}
	require.Empty(t, engine.BuildDayTimeline(input), "a move cannot put a lesson in a retired room")
	input.Overrides = []domain.Override{{Kind: domain.OverrideMove, Date: tuesday, LessonID: &closed.ID, NewRoom: &active.Room}}
	require.Len(t, engine.BuildDayTimeline(input), 2, "an explicit move to a teaching room can recover an old template")
	input = dayInput(tuesday, nil, []domain.Override{{Kind: domain.OverrideExtra, Date: tuesday, Slot: &closed.Slot, NewRoom: &closed.Room}})
	require.Empty(t, engine.BuildDayTimeline(input), "one-off lessons cannot bypass retirement")
}

func TestBuildDayTimelineSessionIdentityAndTimes(t *testing.T) {
	t.Parallel()

	l := lesson("hero", "CS201", "Databases", "Akhmetov D.", "213", domain.RoomLecture, 2, 2, 3, []string{"ПО2308", "ПО2309"}, withSpan(2), withType(domain.LessonLecture))
	got := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{l}, nil))
	require.Len(t, got, 1)
	s := got[0]

	require.Equal(t, l.ID.String()+":2026-09-08", s.ID)
	require.NotNil(t, s.LessonID)
	require.Equal(t, l.ID, *s.LessonID)
	require.Nil(t, s.OverrideID)
	// slot 3 spans slots 3 and 4 → 10:00–11:50 local (05:00–06:50 UTC).
	require.Equal(t, "2026-09-08T05:00:00Z", rfc(s.StartAt))
	require.Equal(t, "2026-09-08T06:50:00Z", rfc(s.EndAt))
	require.Equal(t, s.StartAt, s.SlotStart)
	require.Equal(t, domain.StatusScheduled, s.Status)
	require.Equal(t, domain.LessonLecture, s.Type)
	require.Equal(t, []string{"ПО2308", "ПО2309"}, s.Groups)
	require.False(t, s.Conflict)
}

func TestBuildDayTimelineSpanBeyondLastSlotFallsBack(t *testing.T) {
	t.Parallel()

	// Slot 10 (17:00–17:50) with span 2 has no slot 11 to end on.
	l := lesson("tail", "CS201", "Databases", "Akhmetov D.", "213", domain.RoomLecture, 2, 2, 10, nil, withSpan(2))
	got := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{l}, nil))
	require.Len(t, got, 1)
	require.Equal(t, "2026-09-08T12:50:00Z", rfc(got[0].EndAt))
}

func TestBuildDayTimelineZeroSpanIsOneSlot(t *testing.T) {
	t.Parallel()

	l := lesson("zero", "CS201", "Databases", "Akhmetov D.", "213", domain.RoomLecture, 2, 2, 3, nil, withSpan(0))
	got := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{l}, nil))
	require.Len(t, got, 1)
	require.Equal(t, "2026-09-08T05:50:00Z", rfc(got[0].EndAt))
}

func TestBuildDayTimelineNilLocationFallsBackToUTC(t *testing.T) {
	t.Parallel()

	in := dayInput(tuesday, []domain.Lesson{
		lesson("utc", "CS201", "Databases", "Akhmetov D.", "213", domain.RoomLecture, 2, 2, 3, nil),
	}, nil)
	in.Building.Location = nil

	got := engine.BuildDayTimeline(in)
	require.Len(t, got, 1)
	require.Equal(t, "2026-09-08T10:00:00Z", rfc(got[0].StartAt))
}

// A slot that wraps past midnight must still end after it starts.
func TestBuildDayTimelineMidnightCrossing(t *testing.T) {
	t.Parallel()

	night := domain.TimeSlot{
		ID:       id("slot", "night"),
		Idx:      11,
		StartsAt: domain.NewTimeOfDay(23, 30),
		EndsAt:   domain.NewTimeOfDay(0, 30),
	}
	l := lesson("night", "EN205", "Academic Writing", "Petrova O.", "219", domain.RoomLab, 2, 2, 1, nil)
	l.Slot = night

	in := dayInput(tuesday, []domain.Lesson{l}, nil)
	in.Slots = append(in.Slots, night)

	got := engine.BuildDayTimeline(in)
	require.Len(t, got, 1)
	// 23:30 local on Tue 8 Sep = 18:30 UTC; 00:30 local on Wed = 19:30 UTC.
	require.Equal(t, "2026-09-08T18:30:00Z", rfc(got[0].StartAt))
	require.Equal(t, "2026-09-08T19:30:00Z", rfc(got[0].EndAt))
	require.True(t, got[0].EndAt.After(got[0].StartAt))
}

// ---------------------------------------------------------------- overrides --

func override(key string, lessonID *uuid.UUID, date domain.Date, kind domain.OverrideKind, mutate func(*domain.Override)) domain.Override {
	ov := domain.Override{
		ID:        id("override", key),
		LessonID:  lessonID,
		Date:      date,
		Kind:      kind,
		CreatedAt: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC),
	}
	if mutate != nil {
		mutate(&ov)
	}
	return ov
}

func TestBuildDayTimelineOverrideKinds(t *testing.T) {
	t.Parallel()

	l := lesson("target", "SE210", "Software Design", "Kairatova M.", "216", domain.RoomLab, 2, 2, 4, []string{"ПО2310"})
	lid := l.ID
	newRoom := room("414", domain.RoomSeminar, 4, true)
	newTeacher := teacher("Alimov R.")
	delay := 15

	tests := []struct {
		name   string
		ov     domain.Override
		verify func(t *testing.T, s domain.Session)
	}{
		{
			name: "cancel",
			ov:   override("cancel", &lid, tuesday, domain.OverrideCancel, nil),
			verify: func(t *testing.T, s domain.Session) {
				require.Equal(t, domain.StatusCancelled, s.Status)
				require.Equal(t, "216", s.Room.Code, "a cancelled session keeps its room in the row")
				require.Equal(t, "2026-09-08T06:00:00Z", rfc(s.StartAt))
			},
		},
		{
			name: "move",
			ov: override("move", &lid, tuesday, domain.OverrideMove, func(o *domain.Override) {
				o.NewRoom = &newRoom
			}),
			verify: func(t *testing.T, s domain.Session) {
				require.Equal(t, domain.StatusMoved, s.Status)
				require.Equal(t, "414", s.Room.Code, "the effective room is the new one")
				require.Equal(t, 4, s.Room.Floor)
				require.Equal(t, "216", s.MovedFromRoomCode)
			},
		},
		{
			name: "delay",
			ov: override("delay", &lid, tuesday, domain.OverrideDelay, func(o *domain.Override) {
				o.DelayMinutes = &delay
			}),
			verify: func(t *testing.T, s domain.Session) {
				require.Equal(t, domain.StatusDelayed, s.Status)
				require.Equal(t, "2026-09-08T06:15:00Z", rfc(s.StartAt))
				require.Equal(t, "2026-09-08T07:05:00Z", rfc(s.EndAt))
				require.Equal(t, "2026-09-08T06:00:00Z", rfc(s.SlotStart), "the untouched slot start survives")
				require.NotNil(t, s.DelayMinutes)
				require.Equal(t, 15, *s.DelayMinutes)
			},
		},
		{
			name: "reassign_teacher",
			ov: override("reassign", &lid, tuesday, domain.OverrideReassignTeacher, func(o *domain.Override) {
				o.NewTeacher = &newTeacher
			}),
			verify: func(t *testing.T, s domain.Session) {
				require.Equal(t, "Alimov R.", s.Teacher.ShortName)
				require.Equal(t, domain.StatusScheduled, s.Status, "a swapped teacher is not a status change")
			},
		},
		{
			name: "note is carried onto the session",
			ov: override("note", &lid, tuesday, domain.OverrideCancel, func(o *domain.Override) {
				o.Note = "lecturer ill"
			}),
			verify: func(t *testing.T, s domain.Session) {
				require.Equal(t, "lecturer ill", s.Note)
			},
		},
		{
			name: "move without a new room is ignored",
			ov:   override("bad-move", &lid, tuesday, domain.OverrideMove, nil),
			verify: func(t *testing.T, s domain.Session) {
				require.Equal(t, domain.StatusScheduled, s.Status)
				require.Equal(t, "216", s.Room.Code)
			},
		},
		{
			name: "delay without minutes is ignored",
			ov:   override("bad-delay", &lid, tuesday, domain.OverrideDelay, nil),
			verify: func(t *testing.T, s domain.Session) {
				require.Equal(t, domain.StatusScheduled, s.Status)
				require.Equal(t, "2026-09-08T06:00:00Z", rfc(s.StartAt))
			},
		},
		{
			name: "reassign without a teacher is ignored",
			ov:   override("bad-reassign", &lid, tuesday, domain.OverrideReassignTeacher, nil),
			verify: func(t *testing.T, s domain.Session) {
				require.Equal(t, "Kairatova M.", s.Teacher.ShortName)
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{l}, []domain.Override{tc.ov}))
			require.Len(t, got, 1)
			tc.verify(t, got[0])
		})
	}
}

func TestBuildDayTimelineOverrideOnAnotherDateIsIgnored(t *testing.T) {
	t.Parallel()

	l := lesson("target", "SE210", "Software Design", "Kairatova M.", "216", domain.RoomLab, 2, 2, 4, nil)
	lid := l.ID
	ov := override("cancel", &lid, tuesday.AddDays(7), domain.OverrideCancel, nil)

	got := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{l}, []domain.Override{ov}))
	require.Len(t, got, 1)
	require.Equal(t, domain.StatusScheduled, got[0].Status)
}

func TestBuildDayTimelineOverrideWithoutLessonIsIgnored(t *testing.T) {
	t.Parallel()

	l := lesson("target", "SE210", "Software Design", "Kairatova M.", "216", domain.RoomLab, 2, 2, 4, nil)
	ov := override("orphan", nil, tuesday, domain.OverrideCancel, nil)

	got := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{l}, []domain.Override{ov}))
	require.Len(t, got, 1)
	require.Equal(t, domain.StatusScheduled, got[0].Status)
}

// Several overrides may target the same session. They apply in creation order
// and the status follows the precedence cancelled > moved > delayed.
func TestBuildDayTimelineStackedOverrides(t *testing.T) {
	t.Parallel()

	l := lesson("target", "SE210", "Software Design", "Kairatova M.", "216", domain.RoomLab, 2, 2, 4, nil)
	lid := l.ID
	newRoom := room("414", domain.RoomSeminar, 4, true)
	d10, d5 := 10, 5

	t.Run("move then delay", func(t *testing.T) {
		t.Parallel()
		got := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{l}, []domain.Override{
			override("m", &lid, tuesday, domain.OverrideMove, func(o *domain.Override) {
				o.NewRoom = &newRoom
				o.CreatedAt = time.Date(2026, 9, 1, 8, 0, 0, 0, time.UTC)
			}),
			override("d", &lid, tuesday, domain.OverrideDelay, func(o *domain.Override) {
				o.DelayMinutes = &d10
				o.CreatedAt = time.Date(2026, 9, 1, 9, 0, 0, 0, time.UTC)
			}),
		}))
		require.Len(t, got, 1)
		require.Equal(t, domain.StatusMoved, got[0].Status, "moved outranks delayed")
		require.Equal(t, "414", got[0].Room.Code)
		require.Equal(t, "2026-09-08T06:10:00Z", rfc(got[0].StartAt))
	})

	t.Run("cancel wins over everything", func(t *testing.T) {
		t.Parallel()
		got := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{l}, []domain.Override{
			override("m", &lid, tuesday, domain.OverrideMove, func(o *domain.Override) { o.NewRoom = &newRoom }),
			override("c", &lid, tuesday, domain.OverrideCancel, nil),
		}))
		require.Len(t, got, 1)
		require.Equal(t, domain.StatusCancelled, got[0].Status)
	})

	t.Run("two delays accumulate", func(t *testing.T) {
		t.Parallel()
		got := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{l}, []domain.Override{
			override("d1", &lid, tuesday, domain.OverrideDelay, func(o *domain.Override) {
				o.DelayMinutes = &d10
				o.CreatedAt = time.Date(2026, 9, 1, 8, 0, 0, 0, time.UTC)
			}),
			override("d2", &lid, tuesday, domain.OverrideDelay, func(o *domain.Override) {
				o.DelayMinutes = &d5
				o.CreatedAt = time.Date(2026, 9, 1, 9, 0, 0, 0, time.UTC)
			}),
		}))
		require.Len(t, got, 1)
		require.NotNil(t, got[0].DelayMinutes)
		require.Equal(t, 15, *got[0].DelayMinutes)
		require.Equal(t, "2026-09-08T06:15:00Z", rfc(got[0].StartAt))
	})

	t.Run("two moves keep the original room as movedFrom", func(t *testing.T) {
		t.Parallel()
		third := room("310", domain.RoomSeminar, 3, true)
		got := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{l}, []domain.Override{
			override("m1", &lid, tuesday, domain.OverrideMove, func(o *domain.Override) {
				o.NewRoom = &newRoom
				o.CreatedAt = time.Date(2026, 9, 1, 8, 0, 0, 0, time.UTC)
			}),
			override("m2", &lid, tuesday, domain.OverrideMove, func(o *domain.Override) {
				o.NewRoom = &third
				o.CreatedAt = time.Date(2026, 9, 1, 9, 0, 0, 0, time.UTC)
			}),
		}))
		require.Len(t, got, 1)
		require.Equal(t, "310", got[0].Room.Code)
		require.Equal(t, "216", got[0].MovedFromRoomCode)
	})

	t.Run("same creation time falls back to id order", func(t *testing.T) {
		t.Parallel()
		same := time.Date(2026, 9, 1, 8, 0, 0, 0, time.UTC)
		got := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{l}, []domain.Override{
			override("z", &lid, tuesday, domain.OverrideDelay, func(o *domain.Override) {
				o.DelayMinutes = &d10
				o.CreatedAt = same
			}),
			override("a", &lid, tuesday, domain.OverrideMove, func(o *domain.Override) {
				o.NewRoom = &newRoom
				o.CreatedAt = same
			}),
		}))
		require.Len(t, got, 1)
		require.Equal(t, domain.StatusMoved, got[0].Status)
		require.Equal(t, "2026-09-08T06:10:00Z", rfc(got[0].StartAt))
	})
}

func TestBuildDayTimelineExtraSession(t *testing.T) {
	t.Parallel()

	extraRoom := room("110", domain.RoomLecture, 1, true)
	guest := teacher("Guest speaker")
	ol := course("OL100", "Open Lecture")
	s10 := slot(7)

	ov := override("extra", nil, tuesday, domain.OverrideExtra, func(o *domain.Override) {
		o.NewRoom = &extraRoom
		o.NewTeacher = &guest
		o.Course = &ol
		o.Slot = &s10
		o.Groups = []string{"ПО2308", "ПО2309"}
		o.Note = "guest speaker from Astana Hub"
	})

	got := engine.BuildDayTimeline(dayInput(tuesday, nil, []domain.Override{ov}))
	require.Len(t, got, 1)
	s := got[0]

	require.Equal(t, "x:"+ov.ID.String(), s.ID)
	require.Nil(t, s.LessonID)
	require.NotNil(t, s.OverrideID)
	require.Equal(t, ov.ID, *s.OverrideID)
	require.Equal(t, "OL100", s.Course.Code)
	require.Equal(t, "Guest speaker", s.Teacher.ShortName)
	require.Equal(t, "110", s.Room.Code)
	require.Equal(t, domain.LessonPractice, s.Type)
	require.Equal(t, []string{"ПО2308", "ПО2309"}, s.Groups)
	require.Equal(t, "2026-09-08T09:00:00Z", rfc(s.StartAt))
	require.Equal(t, "2026-09-08T09:50:00Z", rfc(s.EndAt))
	require.Equal(t, "guest speaker from Astana Hub", s.Note)
	require.Equal(t, domain.StatusScheduled, s.Status)
}

func TestBuildDayTimelineExtraWithoutRoomOrSlotIsIgnored(t *testing.T) {
	t.Parallel()

	extraRoom := room("110", domain.RoomLecture, 1, true)
	s7 := slot(7)

	noRoom := override("no-room", nil, tuesday, domain.OverrideExtra, func(o *domain.Override) { o.Slot = &s7 })
	noSlot := override("no-slot", nil, tuesday, domain.OverrideExtra, func(o *domain.Override) { o.NewRoom = &extraRoom })
	otherDay := override("other-day", nil, tuesday.AddDays(1), domain.OverrideExtra, func(o *domain.Override) {
		o.NewRoom = &extraRoom
		o.Slot = &s7
	})

	got := engine.BuildDayTimeline(dayInput(tuesday, nil, []domain.Override{noRoom, noSlot, otherDay}))
	require.Empty(t, got)
}

func TestBuildDayTimelineExtraWithoutCourseOrTeacher(t *testing.T) {
	t.Parallel()

	extraRoom := room("110", domain.RoomLecture, 1, true)
	s7 := slot(7)
	ov := override("bare", nil, tuesday, domain.OverrideExtra, func(o *domain.Override) {
		o.NewRoom = &extraRoom
		o.Slot = &s7
	})

	got := engine.BuildDayTimeline(dayInput(tuesday, nil, []domain.Override{ov}))
	require.Len(t, got, 1)
	require.Empty(t, got[0].Course.Code)
	require.Empty(t, got[0].Teacher.ShortName)
}

// ---------------------------------------------------------------- conflicts --

func TestBuildDayTimelineConflicts(t *testing.T) {
	t.Parallel()

	// Two lessons land in room 213 at overlapping times.
	a := lesson("a", "CS201", "Databases", "Akhmetov D.", "213", domain.RoomLecture, 2, 2, 3, nil, withSpan(2)) // 10:00–11:50
	b := lesson("b", "CS405", "Distributed Systems", "Orazbayev N.", "213", domain.RoomLecture, 2, 2, 4, nil)   // 11:00–11:50
	// A third lesson in another room at the same time must stay clean.
	c := lesson("c", "MA101", "Discrete Math", "Smirnov P.", "305", domain.RoomSeminar, 3, 2, 4, nil)

	got := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{a, b, c}, nil))
	require.Len(t, got, 3)

	for _, s := range got {
		switch s.Course.Code {
		case "CS201", "CS405":
			require.True(t, s.Conflict, "%s should be flagged", s.Course.Code)
		case "MA101":
			require.False(t, s.Conflict)
		}
	}
}

func TestBuildDayTimelineTouchingSessionsDoNotConflict(t *testing.T) {
	t.Parallel()

	// 10:00–10:50 then 11:00–11:50: no overlap. Even back-to-back intervals
	// [start,end) never overlap at the shared instant.
	a := lesson("a", "CS201", "Databases", "Akhmetov D.", "213", domain.RoomLecture, 2, 2, 3, nil)
	b := lesson("b", "CS405", "Distributed Systems", "Akhmetov D.", "213", domain.RoomLecture, 2, 2, 4, nil)

	got := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{a, b}, nil))
	require.Len(t, got, 2)
	require.False(t, got[0].Conflict)
	require.False(t, got[1].Conflict)
}

func TestBuildDayTimelineCancelledSessionsNeverConflict(t *testing.T) {
	t.Parallel()

	a := lesson("a", "CS201", "Databases", "Akhmetov D.", "213", domain.RoomLecture, 2, 2, 3, nil, withSpan(2))
	b := lesson("b", "CS405", "Distributed Systems", "Orazbayev N.", "213", domain.RoomLecture, 2, 2, 4, nil)
	bid := b.ID

	got := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{a, b}, []domain.Override{
		override("cancel-b", &bid, tuesday, domain.OverrideCancel, nil),
	}))
	require.Len(t, got, 2)
	for _, s := range got {
		require.False(t, s.Conflict, "%s", s.Course.Code)
	}
}

// A move creates the conflict in the *destination* room and clears the origin.
func TestBuildDayTimelineMoveCreatesConflictInDestination(t *testing.T) {
	t.Parallel()

	a := lesson("a", "DS215", "Statistics", "Petrova O.", "412", domain.RoomLab, 4, 2, 4, nil)
	b := lesson("b", "MA201", "Linear Algebra", "Smirnov P.", "414", domain.RoomSeminar, 4, 2, 4, nil)
	aid := a.ID
	dest := room("414", domain.RoomSeminar, 4, true)

	got := engine.BuildDayTimeline(dayInput(tuesday, []domain.Lesson{a, b}, []domain.Override{
		override("move-a", &aid, tuesday, domain.OverrideMove, func(o *domain.Override) { o.NewRoom = &dest }),
	}))
	require.Len(t, got, 2)
	for _, s := range got {
		require.Equal(t, "414", s.Room.Code)
		require.True(t, s.Conflict, "%s", s.Course.Code)
	}
}

func TestBuildDayTimelineIsSortedAndDeterministic(t *testing.T) {
	t.Parallel()

	lessons := []domain.Lesson{
		lesson("late", "CS405", "Distributed Systems", "Akhmetov D.", "213", domain.RoomLecture, 2, 2, 7, nil),
		lesson("early-b", "MA101", "Discrete Math", "Smirnov P.", "305", domain.RoomSeminar, 3, 2, 3, nil),
		lesson("early-a", "CS110", "Programming I", "Nurgaliyeva A.", "101", domain.RoomLecture, 1, 2, 3, nil),
	}

	first := engine.BuildDayTimeline(dayInput(tuesday, lessons, nil))
	require.Len(t, first, 3)
	require.Equal(t, []string{"101", "305", "213"}, []string{first[0].Room.Code, first[1].Room.Code, first[2].Room.Code})

	// Feeding the templates in a different order yields the same timeline.
	shuffled := []domain.Lesson{lessons[1], lessons[2], lessons[0]}
	second := engine.BuildDayTimeline(dayInput(tuesday, shuffled, nil))
	require.Equal(t, first, second)
}

func TestBuildDayTimelineEmptyDay(t *testing.T) {
	t.Parallel()

	// Sunday: nothing is scheduled.
	got := engine.BuildDayTimeline(dayInput(domain.NewDate(2026, time.September, 13), []domain.Lesson{
		lesson("a", "CS201", "Databases", "Akhmetov D.", "213", domain.RoomLecture, 2, 2, 3, nil),
	}, nil))
	require.Empty(t, got)
}
