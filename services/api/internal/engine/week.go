package engine

import (
	"time"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
)

// WeekInfo returns the 1-based teaching week number of date and the parity of
// that week (ARCHITECTURE §5).
//
// Week 1 starts on the Monday of `semester.starts_on` — so a semester that
// begins mid-week still has a whole week 1 — and week 1 carries
// `semester.week1_parity`; parity then alternates.
//
// Dates before week 1 get week numbers ≤ 0 and the parity that continues the
// same alternation backwards, so `?date=` for a day just outside the semester
// still yields a well-defined answer instead of an error.
func WeekInfo(sem domain.Semester, date domain.Date) (weekNumber int, parity domain.Parity) {
	week1Monday := mondayOf(sem.StartsOn)
	days := date.DaysSince(week1Monday)

	// floorDiv so that days = -1 lands in week 0, not week 1.
	weekNumber = floorDiv(days, 7) + 1

	p := sem.Week1Parity
	if p != domain.ParityOdd && p != domain.ParityEven {
		p = domain.ParityOdd
	}
	// Week 1, 3, 5 … carry week1_parity; even week numbers carry the other one.
	if mod2(weekNumber) == 0 {
		p = p.Other()
	}
	return weekNumber, p
}

// mondayOf returns the Monday of the ISO week containing d.
func mondayOf(d domain.Date) domain.Date {
	return d.AddDays(-(d.ISOWeekday() - 1))
}

// floorDiv divides rounding towards negative infinity.
func floorDiv(a, b int) int {
	q := a / b
	if (a%b != 0) && ((a < 0) != (b < 0)) {
		q--
	}
	return q
}

// mod2 is a non-negative modulo 2.
func mod2(n int) int {
	m := n % 2
	if m < 0 {
		m += 2
	}
	return m
}

// matchesParity reports whether a lesson template runs in a week of the given
// parity.
func matchesParity(lesson domain.Parity, week domain.Parity) bool {
	return lesson == domain.ParityAll || lesson == week
}

// localToUTC resolves a building-local time of day on date to an absolute
// instant. Named after the pseudo-code in ARCHITECTURE §7.1; the returned
// time.Time carries the building location, and callers serialise it as UTC.
func localToUTC(date domain.Date, tod domain.TimeOfDay, loc *time.Location) time.Time {
	if loc == nil {
		loc = time.UTC
	}
	return tod.On(date, loc)
}
