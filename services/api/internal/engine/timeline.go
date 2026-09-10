// Package engine materialises a day of lessons and computes the board
// snapshot. It performs no I/O whatsoever: every function is a pure
// transformation of domain values, which is what makes the whole status model
// testable with table-driven tests and golden fixtures (ARCHITECTURE §7).
package engine

import (
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
)

// DayInput is everything BuildDayTimeline needs to materialise one local date.
type DayInput struct {
	Building  domain.Building
	Semester  domain.Semester
	Date      domain.Date
	Lessons   []domain.Lesson
	Overrides []domain.Override
	Slots     []domain.TimeSlot
}

// BuildDayTimeline materialises one local building date (ARCHITECTURE §7.1).
//
// It selects the lesson templates that run on this weekday with a matching week
// parity, resolves their local slot times to absolute instants, applies the
// point overrides recorded for the date, appends `extra` sessions, flags
// conflicts and returns the sessions sorted by start.
//
// Sessions are never stored; this runs on every rebuild.
func BuildDayTimeline(in DayInput) []domain.Session {
	_, parity := WeekInfo(in.Semester, in.Date)
	weekday := in.Date.ISOWeekday()
	loc := in.Building.Location
	if loc == nil {
		loc = time.UTC
	}

	slotByIdx := make(map[int]domain.TimeSlot, len(in.Slots))
	for _, s := range in.Slots {
		slotByIdx[s.Idx] = s
	}

	byLesson := overridesByLesson(in.Overrides, in.Date)

	sessions := make([]domain.Session, 0, len(in.Lessons))
	for _, lesson := range in.Lessons {
		if lesson.Weekday != weekday || !matchesParity(lesson.Parity, parity) {
			continue
		}

		start := localToUTC(in.Date, lesson.Slot.StartsAt, loc)
		end := nextMidnightSafe(start, localToUTC(in.Date, endOfSpan(lesson.Slot, lesson.SlotSpan, slotByIdx), loc))

		lessonID := lesson.ID
		s := domain.Session{
			ID:        lesson.ID.String() + ":" + in.Date.String(),
			LessonID:  &lessonID,
			Course:    lesson.Course,
			Teacher:   lesson.Teacher,
			Groups:    append([]string(nil), lesson.Groups...),
			Room:      lesson.Room,
			Type:      lesson.Type,
			StartAt:   start,
			EndAt:     end,
			SlotStart: start,
			Status:    domain.StatusScheduled,
		}
		applyOverrides(&s, byLesson[lesson.ID])
		if !s.Room.Schedulable {
			continue
		}
		sessions = append(sessions, s)
	}

	// `extra` overrides are one-off sessions with no lesson template.
	for _, ov := range in.Overrides {
		if ov.Kind != domain.OverrideExtra || !ov.Date.Equal(in.Date) || ov.Slot == nil || ov.NewRoom == nil {
			continue
		}
		if !ov.NewRoom.Schedulable {
			continue
		}
		start := localToUTC(in.Date, ov.Slot.StartsAt, loc)
		end := nextMidnightSafe(start, localToUTC(in.Date, ov.Slot.EndsAt, loc))

		course := domain.Course{}
		if ov.Course != nil {
			course = *ov.Course
		}
		teacher := domain.Teacher{}
		if ov.NewTeacher != nil {
			teacher = *ov.NewTeacher
		}
		overrideID := ov.ID
		sessions = append(sessions, domain.Session{
			ID:         "x:" + ov.ID.String(),
			OverrideID: &overrideID,
			Course:     course,
			Teacher:    teacher,
			Groups:     append([]string(nil), ov.Groups...),
			Room:       *ov.NewRoom,
			Type:       domain.LessonPractice,
			StartAt:    start,
			EndAt:      end,
			SlotStart:  start,
			Status:     domain.StatusScheduled,
			Note:       ov.Note,
		})
	}

	markConflicts(sessions)
	sortSessions(sessions)
	return sessions
}

// endOfSpan returns the local end time of a lesson that occupies slotSpan
// consecutive slots starting at first. A missing follow-on slot degrades
// gracefully to the first slot's end.
func endOfSpan(first domain.TimeSlot, span int, byIdx map[int]domain.TimeSlot) domain.TimeOfDay {
	if span < 1 {
		span = 1
	}
	last, ok := byIdx[first.Idx+span-1]
	if !ok {
		return first.EndsAt
	}
	return last.EndsAt
}

// nextMidnightSafe pushes a slot end past midnight when the slot wraps the day
// boundary (a 23:30–00:30 evening class), so that end is always after start.
func nextMidnightSafe(start, end time.Time) time.Time {
	if end.After(start) {
		return end
	}
	return end.AddDate(0, 0, 1)
}

// overridesByLesson groups the overrides that target a lesson template on date,
// in a deterministic application order (created_at, then id).
func overridesByLesson(overrides []domain.Override, date domain.Date) map[uuid.UUID][]domain.Override {
	out := make(map[uuid.UUID][]domain.Override)
	for _, ov := range overrides {
		if ov.LessonID == nil || ov.Kind == domain.OverrideExtra || !ov.Date.Equal(date) {
			continue
		}
		out[*ov.LessonID] = append(out[*ov.LessonID], ov)
	}
	for k := range out {
		list := out[k]
		sort.SliceStable(list, func(i, j int) bool {
			if !list[i].CreatedAt.Equal(list[j].CreatedAt) {
				return list[i].CreatedAt.Before(list[j].CreatedAt)
			}
			return list[i].ID.String() < list[j].ID.String()
		})
		out[k] = list
	}
	return out
}

// applyOverrides folds every override recorded for this session into it.
//
// Several overrides may target the same session; they are applied in creation
// order and the resulting `status` follows the precedence cancelled > moved >
// delayed, because the contract's SessionStatus holds only one value.
func applyOverrides(s *domain.Session, overrides []domain.Override) {
	var cancelled, moved, delayed bool

	for _, ov := range overrides {
		switch ov.Kind {
		case domain.OverrideCancel:
			cancelled = true

		case domain.OverrideMove:
			if ov.NewRoom == nil {
				continue
			}
			if !moved {
				s.MovedFromRoomCode = s.Room.Code
			}
			s.Room = *ov.NewRoom
			moved = true

		case domain.OverrideDelay:
			if ov.DelayMinutes == nil {
				continue
			}
			d := time.Duration(*ov.DelayMinutes) * time.Minute
			s.StartAt = s.StartAt.Add(d)
			s.EndAt = s.EndAt.Add(d)
			total := *ov.DelayMinutes
			if s.DelayMinutes != nil {
				total += *s.DelayMinutes
			}
			s.DelayMinutes = &total
			delayed = true

		case domain.OverrideReassignTeacher:
			if ov.NewTeacher == nil {
				continue
			}
			s.Teacher = *ov.NewTeacher

		case domain.OverrideExtra:
			// Handled separately: an extra override has no lesson template.
			continue
		}

		if ov.Note != "" {
			s.Note = ov.Note
		}
	}

	switch {
	case cancelled:
		s.Status = domain.StatusCancelled
	case moved:
		s.Status = domain.StatusMoved
	case delayed:
		s.Status = domain.StatusDelayed
	}
}

// markConflicts flags every pair of sessions that overlap in the same effective
// room. Cancelled sessions do not occupy a room and never conflict.
func markConflicts(sessions []domain.Session) {
	byRoom := make(map[uuid.UUID][]int)
	for i := range sessions {
		if sessions[i].Status == domain.StatusCancelled {
			continue
		}
		byRoom[sessions[i].Room.ID] = append(byRoom[sessions[i].Room.ID], i)
	}
	for _, idx := range byRoom {
		for a := 0; a < len(idx); a++ {
			for b := a + 1; b < len(idx); b++ {
				i, j := sessions[idx[a]], sessions[idx[b]]
				if i.StartAt.Before(j.EndAt) && j.StartAt.Before(i.EndAt) {
					sessions[idx[a]].Conflict = true
					sessions[idx[b]].Conflict = true
				}
			}
		}
	}
}

// sortSessions orders a timeline by start, then room, then id, so that two
// rebuilds of the same day are byte-identical.
func sortSessions(sessions []domain.Session) {
	sort.SliceStable(sessions, func(i, j int) bool {
		a, b := sessions[i], sessions[j]
		if !a.StartAt.Equal(b.StartAt) {
			return a.StartAt.Before(b.StartAt)
		}
		if a.Room.Code != b.Room.Code {
			return a.Room.Code < b.Room.Code
		}
		return a.ID < b.ID
	})
}
