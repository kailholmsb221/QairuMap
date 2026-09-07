package engine_test

import (
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
	"github.com/kailholmes/campuslive/services/api/internal/engine"
)

var update = flag.Bool("update", false, "rewrite the golden fixtures in testdata/")

// ns is the same UUID v5 namespace packages/map-data uses, so fixture ids read
// like production ones.
var ns = uuid.NewSHA1(uuid.NameSpaceURL, []byte("campuslive"))

func id(kind, key string) uuid.UUID { return uuid.NewSHA1(ns, []byte(kind+":"+key)) }

// almaty is the building time zone. Loaded from the embedded tzdata-free system
// database when available; the tests fall back to a fixed +05:00 zone (Asia/
// Almaty has had no DST since 2005) so they run in a bare container too.
func almaty() *time.Location {
	if loc, err := time.LoadLocation("Asia/Almaty"); err == nil {
		return loc
	}
	return time.FixedZone("+05", 5*60*60)
}

// ---------------------------------------------------------------- builders --

func slots() []domain.TimeSlot {
	out := make([]domain.TimeSlot, 0, 10)
	for i := 1; i <= 10; i++ {
		hour := 7 + i // slot 1 = 08:00 … slot 10 = 17:00
		out = append(out, domain.TimeSlot{
			ID:       id("slot", string(rune('0'+i))),
			Idx:      i,
			StartsAt: domain.NewTimeOfDay(hour, 0),
			EndsAt:   domain.NewTimeOfDay(hour, 50),
		})
	}
	return out
}

func slot(idx int) domain.TimeSlot { return slots()[idx-1] }

func room(code string, typ domain.RoomType, floor int, schedulable bool) domain.Room {
	cap := 30
	return domain.Room{
		ID:          id("room", code),
		Code:        code,
		Name:        "Room " + code,
		Type:        typ,
		Wing:        domain.WingSouth,
		Schedulable: schedulable,
		Capacity:    &cap,
		Floor:       floor,
		Geometry:    domain.Geometry{Path: "M 0 0 L 1 0 L 1 1 Z"},
	}
}

func teacher(short string) domain.Teacher {
	return domain.Teacher{
		ID:         id("teacher", short),
		FullName:   short + " Full",
		ShortName:  short,
		Department: "Dept. of Computer Science",
	}
}

func course(code, title string) domain.Course {
	return domain.Course{ID: id("course", code), Code: code, Title: title}
}

func building() domain.Building {
	return domain.Building{
		ID:       id("building", "A"),
		Code:     "A",
		Name:     "Main Academic Building",
		Timezone: "Asia/Almaty",
		Location: almaty(),
		Floors:   4,
	}
}

func semester() domain.Semester {
	return domain.Semester{
		ID:          id("semester", "fall2026"),
		Name:        "Fall 2026",
		StartsOn:    domain.NewDate(2026, time.August, 24),
		EndsOn:      domain.NewDate(2026, time.December, 20),
		Week1Parity: domain.ParityOdd,
	}
}

type lessonOpt func(*domain.Lesson)

func withParity(p domain.Parity) lessonOpt { return func(l *domain.Lesson) { l.Parity = p } }
func withSpan(n int) lessonOpt             { return func(l *domain.Lesson) { l.SlotSpan = n } }
func withType(t domain.LessonType) lessonOpt {
	return func(l *domain.Lesson) { l.Type = t }
}

func lesson(key, courseCode, title, teacherShort, roomCode string, roomType domain.RoomType, floor, weekday, slotIdx int, groups []string, opts ...lessonOpt) domain.Lesson {
	l := domain.Lesson{
		ID:       id("lesson", key),
		Course:   course(courseCode, title),
		Teacher:  teacher(teacherShort),
		Room:     room(roomCode, roomType, floor, true),
		Slot:     slot(slotIdx),
		SlotSpan: 1,
		Weekday:  weekday,
		Parity:   domain.ParityAll,
		Type:     domain.LessonPractice,
		Groups:   groups,
	}
	for _, o := range opts {
		o(&l)
	}
	return l
}

// at is a building-local instant on the given date.
func at(d domain.Date, hour, min int) time.Time { return d.At(almaty(), hour, min) }

// ------------------------------------------------------------------ golden --

// goldenSnapshot is the stable, human-diffable projection of a Snapshot used by
// the golden fixtures. It deliberately does not reuse the HTTP DTOs: a golden
// file must fail when the *engine* changes, not when the contract does.
type goldenSnapshot struct {
	Building         string          `json:"building"`
	At               string          `json:"at"`
	Date             string          `json:"date"`
	WeekNumber       int             `json:"weekNumber"`
	WeekParity       string          `json:"weekParity"`
	NextTransitionAt *string         `json:"nextTransitionAt"`
	Stats            domain.Stats    `json:"stats"`
	Rooms            []goldenRoom    `json:"rooms"`
	Now              []goldenSession `json:"now"`
	Next             []goldenSession `json:"next"`
}

type goldenRoom struct {
	Code      string  `json:"code"`
	Floor     int     `json:"floor"`
	Phase     string  `json:"phase"`
	Current   string  `json:"current"`
	Next      string  `json:"next"`
	FreeUntil *string `json:"freeUntil"`
}

type goldenSession struct {
	ID           string `json:"id"`
	Course       string `json:"course"`
	Title        string `json:"title"`
	Type         string `json:"type"`
	Teacher      string `json:"teacher"`
	Groups       string `json:"groups"`
	Room         string `json:"room"`
	Floor        int    `json:"floor"`
	StartAt      string `json:"startAt"`
	EndAt        string `json:"endAt"`
	Status       string `json:"status"`
	Phase        string `json:"phase"`
	Conflict     bool   `json:"conflict"`
	MovedFrom    string `json:"movedFromRoomCode,omitempty"`
	DelayMinutes int    `json:"delayMinutes,omitempty"`
	Note         string `json:"note,omitempty"`
}

func rfc(t time.Time) string { return t.UTC().Format(time.RFC3339) }

func rfcPtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := rfc(*t)
	return &s
}

func toGoldenSession(s domain.Session, phase domain.Phase) goldenSession {
	g := goldenSession{
		ID:        s.ID,
		Course:    s.Course.Code,
		Title:     s.Course.Title,
		Type:      string(s.Type),
		Teacher:   s.Teacher.ShortName,
		Room:      s.Room.Code,
		Floor:     s.Room.Floor,
		StartAt:   rfc(s.StartAt),
		EndAt:     rfc(s.EndAt),
		Status:    string(s.Status),
		Phase:     string(phase),
		Conflict:  s.Conflict,
		MovedFrom: s.MovedFromRoomCode,
		Note:      s.Note,
	}
	for i, code := range s.Groups {
		if i > 0 {
			g.Groups += ","
		}
		g.Groups += code
	}
	if s.DelayMinutes != nil {
		g.DelayMinutes = *s.DelayMinutes
	}
	return g
}

func toGolden(snap domain.Snapshot, th engine.Thresholds) goldenSnapshot {
	g := goldenSnapshot{
		Building:         snap.Building,
		At:               rfc(snap.At),
		Date:             snap.Date.String(),
		WeekNumber:       snap.WeekNumber,
		WeekParity:       string(snap.WeekParity),
		NextTransitionAt: rfcPtr(snap.NextTransitionAt),
		Stats:            snap.Stats,
		Rooms:            make([]goldenRoom, 0, len(snap.Rooms)),
		Now:              make([]goldenSession, 0, len(snap.Now)),
		Next:             make([]goldenSession, 0, len(snap.Next)),
	}
	for _, r := range snap.Rooms {
		gr := goldenRoom{Code: r.Room.Code, Floor: r.Room.Floor, Phase: string(r.Phase), FreeUntil: rfcPtr(r.FreeUntil)}
		if r.Current != nil {
			gr.Current = r.Current.ID
		}
		if r.Next != nil {
			gr.Next = r.Next.ID
		}
		g.Rooms = append(g.Rooms, gr)
	}
	for _, s := range snap.Now {
		g.Now = append(g.Now, toGoldenSession(s, engine.PhaseOf(s, snap.At, th)))
	}
	for _, s := range snap.Next {
		g.Next = append(g.Next, toGoldenSession(s, engine.PhaseOf(s, snap.At, th)))
	}
	return g
}

// assertGolden compares a snapshot with testdata/<name>.json, rewriting the
// file when `go test ./internal/engine -update` is passed.
func assertGolden(t *testing.T, name string, snap domain.Snapshot, th engine.Thresholds) {
	t.Helper()

	got, err := json.MarshalIndent(toGolden(snap, th), "", "  ")
	require.NoError(t, err)
	got = append(got, '\n')

	path := filepath.Join("testdata", name+".json")
	if *update {
		require.NoError(t, os.MkdirAll("testdata", 0o755))
		require.NoError(t, os.WriteFile(path, got, 0o644))
		return
	}

	want, err := os.ReadFile(path) //nolint:gosec // fixed test path
	require.NoError(t, err, "golden fixture missing; rerun with -update")
	require.JSONEq(t, string(want), string(got), "golden fixture %s is stale; rerun with -update", path)
}
