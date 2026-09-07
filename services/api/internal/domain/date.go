package domain

import (
	"fmt"
	"time"
)

// Date is a calendar date without a time zone. Every `date` in the contract is a
// *local building date*; it only becomes an instant once resolved through
// Building.Location.
type Date struct {
	Year  int
	Month time.Month
	Day   int
}

// NewDate builds a Date from its parts.
func NewDate(year int, month time.Month, day int) Date {
	return Date{Year: year, Month: month, Day: day}
}

// DateOf takes the calendar date of t as observed in t's own location.
func DateOf(t time.Time) Date {
	y, m, d := t.Date()
	return Date{Year: y, Month: m, Day: d}
}

// DateIn takes the calendar date of t as observed in loc.
func DateIn(t time.Time, loc *time.Location) Date {
	return DateOf(t.In(loc))
}

// ParseDate parses a `YYYY-MM-DD` string.
func ParseDate(s string) (Date, error) {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return Date{}, fmt.Errorf("parse date %q: %w", s, err)
	}
	return DateOf(t), nil
}

// String renders the date as `YYYY-MM-DD`.
func (d Date) String() string {
	return fmt.Sprintf("%04d-%02d-%02d", d.Year, int(d.Month), d.Day)
}

// Midnight is 00:00 of this date in loc.
func (d Date) Midnight(loc *time.Location) time.Time {
	return time.Date(d.Year, d.Month, d.Day, 0, 0, 0, 0, loc)
}

// At resolves a local wall-clock time-of-day on this date in loc.
func (d Date) At(loc *time.Location, hour, min int) time.Time {
	return time.Date(d.Year, d.Month, d.Day, hour, min, 0, 0, loc)
}

// AddDays returns the date n days later (n may be negative).
func (d Date) AddDays(n int) Date {
	return DateOf(d.Midnight(time.UTC).AddDate(0, 0, n))
}

// Weekday reports the day of the week.
func (d Date) Weekday() time.Weekday { return d.Midnight(time.UTC).Weekday() }

// ISOWeekday reports the day of the week as 1 = Monday … 7 = Sunday, the
// convention used by `lessons.weekday`.
func (d Date) ISOWeekday() int {
	w := int(d.Weekday())
	if w == 0 {
		return 7
	}
	return w
}

// Equal reports whether the two dates are the same calendar day.
func (d Date) Equal(o Date) bool { return d == o }

// Before reports whether d is strictly earlier than o.
func (d Date) Before(o Date) bool {
	return d.Midnight(time.UTC).Before(o.Midnight(time.UTC))
}

// After reports whether d is strictly later than o.
func (d Date) After(o Date) bool { return o.Before(d) }

// DaysSince counts whole days from o to d.
func (d Date) DaysSince(o Date) int {
	return int(d.Midnight(time.UTC).Sub(o.Midnight(time.UTC)).Hours() / 24)
}

// TimeOfDay is a wall-clock time of day, local to a building.
type TimeOfDay struct {
	Hour   int
	Minute int
}

// NewTimeOfDay builds a TimeOfDay.
func NewTimeOfDay(hour, minute int) TimeOfDay { return TimeOfDay{Hour: hour, Minute: minute} }

// String renders the time of day as `HH:MM`.
func (t TimeOfDay) String() string { return fmt.Sprintf("%02d:%02d", t.Hour, t.Minute) }

// On resolves this time of day on date in loc.
func (t TimeOfDay) On(date Date, loc *time.Location) time.Time {
	return date.At(loc, t.Hour, t.Minute)
}
