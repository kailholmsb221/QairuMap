// Package domain holds the pure data types the whole service is written
// against. It has no dependencies beyond the standard library and
// github.com/google/uuid: no database, no HTTP, no clock.
package domain

import (
	"time"

	"github.com/google/uuid"
)

// RoomType mirrors the `room_type` enum and the contract's RoomType.
type RoomType string

// Room types.
const (
	RoomLecture   RoomType = "lecture"
	RoomSeminar   RoomType = "seminar"
	RoomLab       RoomType = "lab"
	RoomCoworking RoomType = "coworking"
	RoomAdmin     RoomType = "admin"
	RoomService   RoomType = "service"
	RoomVoid      RoomType = "void"
)

// Wing mirrors the `wing` enum.
type Wing string

// Wings.
const (
	WingNorth Wing = "north"
	WingSouth Wing = "south"
	WingCore  Wing = "core"
)

// LessonType mirrors the `lesson_type` enum.
type LessonType string

// Lesson types.
const (
	LessonLecture  LessonType = "lecture"
	LessonPractice LessonType = "practice"
	LessonLab      LessonType = "lab"
)

// Parity mirrors the `week_parity` enum on lessons and the semester's
// `week1_parity`. `ParityAll` is only ever used on a lesson.
type Parity string

// Parities.
const (
	ParityAll  Parity = "all"
	ParityOdd  Parity = "odd"
	ParityEven Parity = "even"
)

// Other returns the opposite parity of odd/even; ParityAll maps to itself.
func (p Parity) Other() Parity {
	switch p {
	case ParityOdd:
		return ParityEven
	case ParityEven:
		return ParityOdd
	default:
		return p
	}
}

// SessionStatus is what happened to a session as data, independent of the wall
// clock (contract: SessionStatus).
type SessionStatus string

// Session statuses.
const (
	StatusScheduled SessionStatus = "scheduled"
	StatusCancelled SessionStatus = "cancelled"
	StatusMoved     SessionStatus = "moved"
	StatusDelayed   SessionStatus = "delayed"
)

// Phase is where a session sits relative to "now" (contract: Phase).
type Phase string

// Phases.
const (
	PhaseUpcoming  Phase = "upcoming"
	PhaseSoon      Phase = "soon"
	PhaseLive      Phase = "live"
	PhaseEnding    Phase = "ending"
	PhaseDone      Phase = "done"
	PhaseCancelled Phase = "cancelled"
)

// RoomPhase is the state of a room (contract: RoomPhase).
type RoomPhase string

// Room phases.
const (
	RoomFree   RoomPhase = "free"
	RoomSoon   RoomPhase = "soon"
	RoomLive   RoomPhase = "live"
	RoomEnding RoomPhase = "ending"
)

// OverrideKind mirrors the `override_kind` enum.
type OverrideKind string

// Override kinds.
const (
	OverrideCancel          OverrideKind = "cancel"
	OverrideMove            OverrideKind = "move"
	OverrideDelay           OverrideKind = "delay"
	OverrideReassignTeacher OverrideKind = "reassign_teacher"
	OverrideExtra           OverrideKind = "extra"
)

// Severity is the visual weight of a ticker announcement.
type Severity string

// Severities.
const (
	SeverityInfo    Severity = "info"
	SeverityWarning Severity = "warning"
	SeverityAlert   Severity = "alert"
)

// Building is one building of the campus.
type Building struct {
	ID       uuid.UUID
	Code     string
	Name     string
	Timezone string
	// Location is Timezone already loaded; the engine resolves every local slot
	// time through it.
	Location *time.Location
	Floors   int
}

// Floor is one floor plate.
type Floor struct {
	ID      uuid.UUID
	Number  int
	PlanKey string
}

// Geometry is the `rooms.geometry` jsonb payload. Field order and JSON names
// match packages/map-data/building-a.json.
type Geometry struct {
	Path  string `json:"path"`
	BBox  BBox   `json:"bbox"`
	Label Point  `json:"label"`
}

// BBox is an axis-aligned bounding box in the floor's viewBox coordinates.
type BBox struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

// Point is a point in the floor's viewBox coordinates.
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Room is one space on a floor.
type Room struct {
	ID          uuid.UUID
	Code        string
	Name        string
	Type        RoomType
	Wing        Wing
	Schedulable bool
	Capacity    *int
	Floor       int
	FloorID     uuid.UUID
	Geometry    Geometry
}

// Teacher is a member of staff.
type Teacher struct {
	ID         uuid.UUID
	FullName   string
	ShortName  string
	Department string
}

// Group is a student group.
type Group struct {
	ID         uuid.UUID
	Code       string
	Program    string
	CourseYear int
}

// GroupRef is a student group reduced to what a lesson row shows: who it is
// and how to address it. The admin API hands these back with every lesson.
type GroupRef struct {
	ID   uuid.UUID
	Code string
}

// Course is a subject.
type Course struct {
	ID         uuid.UUID
	Code       string
	Title      string
	Department string
}

// Semester carries the boundaries the week number and parity are counted from.
type Semester struct {
	ID          uuid.UUID
	Name        string
	StartsOn    Date
	EndsOn      Date
	Week1Parity Parity
}

// TimeSlot is lesson slot N of a building, as a local time of day.
type TimeSlot struct {
	ID       uuid.UUID
	Idx      int
	StartsAt TimeOfDay
	EndsAt   TimeOfDay
}

// Lesson is a recurring schedule template, already joined with everything the
// engine needs to materialise it.
type Lesson struct {
	ID       uuid.UUID
	Course   Course
	Teacher  Teacher
	Room     Room
	Slot     TimeSlot
	SlotSpan int
	Weekday  int // 1 = Monday
	Parity   Parity
	Type     LessonType
	Groups   []string
}

// Override is a point change applied to one local date.
type Override struct {
	ID         uuid.UUID
	LessonID   *uuid.UUID
	Date       Date
	Kind       OverrideKind
	NewRoom    *Room
	NewTeacher *Teacher
	// DelayMinutes is set for `delay`.
	DelayMinutes *int
	// Course and Slot are set for `extra`.
	Course    *Course
	Slot      *TimeSlot
	Groups    []string
	Note      string
	CreatedAt time.Time
}

// Session is a materialised lesson on a concrete date. It is never stored: the
// engine builds it from Lesson + Override on every rebuild.
type Session struct {
	// ID is "{lessonId}:{date}", or "x:{overrideId}" for an extra session.
	ID         string
	LessonID   *uuid.UUID
	OverrideID *uuid.UUID
	Course     Course
	Teacher    Teacher
	Groups     []string
	// Room is the *effective* room — the new one after a move.
	Room    Room
	Type    LessonType
	StartAt time.Time
	EndAt   time.Time
	// SlotStart is the untouched template start (before any delay). NEXT keeps
	// cancelled and moved rows visible on their original slot.
	SlotStart         time.Time
	Status            SessionStatus
	Conflict          bool
	MovedFromRoomCode string
	DelayMinutes      *int
	Note              string
}

// RoomState is the live state of one room.
type RoomState struct {
	Room      Room
	Phase     RoomPhase
	Current   *Session
	Next      *Session
	FreeUntil *time.Time
}

// Stats are the header and legend counters.
type Stats struct {
	RoomsTotal    int
	RoomsBusy     int
	SessionsToday int
	SessionsDone  int
}

// Snapshot is the complete board state at an instant.
type Snapshot struct {
	Building         string
	At               time.Time
	Date             Date
	WeekNumber       int
	WeekParity       Parity
	NextTransitionAt *time.Time
	Stats            Stats
	Rooms            []RoomState
	Now              []Session
	Next             []Session
}

// Announcement is a ticker line.
type Announcement struct {
	ID       uuid.UUID
	Building string
	Text     string
	Severity Severity
	StartsAt time.Time
	EndsAt   time.Time
}
