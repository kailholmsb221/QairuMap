package seed_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
	"github.com/kailholmes/campuslive/services/api/internal/engine"
	"github.com/kailholmes/campuslive/services/api/internal/mapspec"
	"github.com/kailholmes/campuslive/services/api/internal/seed"
)

func load(t *testing.T) *mapspec.Spec {
	t.Helper()
	spec, err := mapspec.LoadDefault("")
	require.NoError(t, err, "packages/map-data/building-a.json must be readable from the module directory")
	return spec
}

func generate(t *testing.T) *seed.Dataset {
	t.Helper()
	ds, err := seed.Generate(seed.Options{Spec: load(t), Today: domain.NewDate(2026, time.September, 7)})
	require.NoError(t, err)
	return ds
}

func TestGenerateStatics(t *testing.T) {
	t.Parallel()
	ds := generate(t)

	require.Equal(t, "A", ds.Building.Code)
	require.Equal(t, "Main Academic Building", ds.Building.Name)
	require.Equal(t, "Asia/Almaty", ds.Building.Timezone)
	require.Equal(t, 4, ds.Building.Floors)

	require.Len(t, ds.Floors, 4)
	require.Len(t, ds.Rooms, 89, "every space of building-a.json")
	require.Len(t, ds.Teachers, 40)
	require.Len(t, ds.Groups, 30)
	require.Len(t, ds.Courses, 50)
	require.Len(t, ds.Slots, 10)
	require.Len(t, ds.Announcements, 3)

	schedulable := 0
	for _, r := range ds.Rooms {
		if r.Schedulable {
			schedulable++
		}
	}
	require.Equal(t, 41, schedulable)

	// The slots are ten 50-minute lessons with 10-minute breaks, 08:00–17:50.
	require.Equal(t, "08:00", ds.Slots[0].StartsAt.String())
	require.Equal(t, "08:50", ds.Slots[0].EndsAt.String())
	require.Equal(t, "17:00", ds.Slots[9].StartsAt.String())
	require.Equal(t, "17:50", ds.Slots[9].EndsAt.String())

	require.Equal(t, "Fall 2026", ds.Semester.Name)
	require.Equal(t, "2026-08-24", ds.Semester.StartsOn.String())
	require.Equal(t, "2026-12-20", ds.Semester.EndsOn.String())
	require.Equal(t, domain.ParityOdd, ds.Semester.Week1Parity)

	// 8 Sep 2026 is week 3, odd — exactly what the design's header shows.
	n, p := engine.WeekInfo(ds.Semester, domain.NewDate(2026, time.September, 8))
	require.Equal(t, 3, n)
	require.Equal(t, domain.ParityOdd, p)
}

// The room ids must be the ones building-a.json carries, or the map and the
// database drift apart.
func TestGenerateReusesMapDataRoomIDs(t *testing.T) {
	t.Parallel()
	spec := load(t)
	ds := generate(t)

	byCode := map[string]string{}
	for _, r := range ds.Rooms {
		byCode[r.Code] = r.ID.String()
	}
	for _, f := range spec.Floors {
		for _, r := range f.Rooms {
			require.Equal(t, r.ID, byCode[r.Code], "room %s", r.Code)
		}
	}
}

func TestGenerateIsDeterministic(t *testing.T) {
	t.Parallel()
	spec := load(t)
	opts := seed.Options{Spec: spec, Today: domain.NewDate(2026, time.September, 7)}

	a, err := seed.Generate(opts)
	require.NoError(t, err)
	b, err := seed.Generate(opts)
	require.NoError(t, err)

	require.Equal(t, len(a.Lessons), len(b.Lessons))
	for i := range a.Lessons {
		require.Equal(t, a.Lessons[i], b.Lessons[i], "lesson %d", i)
	}
	require.Equal(t, a.Overrides, b.Overrides)
}

// The hero rows of docs/design/src/states.mjs must be in the data, or the demo
// does not match the design.
func TestGenerateHeroLessons(t *testing.T) {
	t.Parallel()
	ds := generate(t)

	teacherByID := map[string]string{}
	for _, x := range ds.Teachers {
		teacherByID[x.ID.String()] = x.ShortName
	}
	groupByID := map[string]string{}
	for _, g := range ds.Groups {
		groupByID[g.ID.String()] = g.Code
	}

	type want struct {
		course, teacher, room string
		slot, span            int
		groups                []string
	}
	wants := []want{
		{"CS201", "Akhmetov D.", "213", 3, 2, []string{"ПО2308", "ПО2309"}},
		{"CS110", "Nurgaliyeva A.", "101", 3, 1, []string{"ПО2401", "ПО2402"}},
		{"MA101", "Smirnov P.", "305", 3, 1, []string{"ИС2301"}},
		{"SE330", "Kim V.", "216", 3, 1, []string{"ПО2310"}},
		{"AI320", "Sadykova G.", "412", 3, 1, []string{"БДА2401"}},
		{"CB240", "Bekzhanov T.", "313", 3, 1, []string{"КБ2401"}},
		{"PH101", "Ivanova E.", "110", 3, 2, []string{"ВТ2401", "ВТ2402"}},
		{"CS250", "Orazbayev N.", "303", 4, 1, []string{"ИС2301", "ИС2302"}},
		{"MA101", "Smirnov P.", "101", 4, 1, []string{"ПО2401", "ПО2402"}},
		{"SE210", "Kairatova M.", "216", 4, 1, []string{"ПО2310"}},
		{"DS215", "Petrova O.", "412", 4, 1, []string{"БДА2401"}},
		{"PM200", "Zhumabekov S.", "205", 5, 1, []string{"ПО2308"}},
		{"CS405", "Akhmetov D.", "213", 7, 1, []string{"ПО2308"}},
	}

	for _, w := range wants {
		t.Run(fmt.Sprintf("%s in %s", w.course, w.room), func(t *testing.T) {
			var found bool
			for _, l := range ds.Lessons {
				if l.Weekday != 2 || l.CourseCode != w.course || l.RoomCode != w.room || l.SlotIdx != w.slot {
					continue
				}
				found = true
				require.Equal(t, w.teacher, teacherByID[l.TeacherID.String()])
				require.Equal(t, w.span, l.SlotSpan)
				require.Equal(t, domain.ParityAll, l.Parity)

				var codes []string
				for _, gid := range l.GroupIDs {
					codes = append(codes, groupByID[gid.String()])
				}
				require.ElementsMatch(t, w.groups, codes)
			}
			require.True(t, found, "hero lesson %s in %s at slot %d is missing", w.course, w.room, w.slot)
		})
	}
}

// The Assembly Hall gets exactly one weekly Open Lecture, Thursday 14:00,
// spanning two slots (ARCHITECTURE §13).
func TestGenerateOpenLecture(t *testing.T) {
	t.Parallel()
	ds := generate(t)

	var found int
	for _, l := range ds.Lessons {
		if l.CourseCode == "OL100" {
			found++
			require.Equal(t, "110", l.RoomCode)
			require.Equal(t, 4, l.Weekday)
			require.Equal(t, 7, l.SlotIdx, "slot 7 is 14:00")
			require.Equal(t, 2, l.SlotSpan)
		}
	}
	require.Equal(t, 1, found, "exactly one Open Lecture a week")
}

// Themed laboratories only ever teach their own subject.
func TestGenerateThemedLabs(t *testing.T) {
	t.Parallel()
	ds := generate(t)

	allowed := map[string]map[string]bool{
		"210": {"IOT310": true},
		"211": {"ST300": true},
		"112": {"RB210": true},
		"313": {"CB240": true, "CB310": true},
		"413": {"ML410": true, "AI320": true},
	}
	seen := map[string]int{}
	for _, l := range ds.Lessons {
		if ok, isThemed := allowed[l.RoomCode]; isThemed {
			require.True(t, ok[l.CourseCode], "room %s must not teach %s", l.RoomCode, l.CourseCode)
			seen[l.RoomCode]++
		}
	}
	for code := range allowed {
		require.Positive(t, seen[code], "themed lab %s has no lessons", code)
	}
}

// Placement rules from ARCHITECTURE §13.
func TestGeneratePlacementRules(t *testing.T) {
	t.Parallel()
	ds := generate(t)

	roomByID := map[string]domain.Room{}
	for _, r := range ds.Rooms {
		roomByID[r.ID.String()] = r
	}

	for _, l := range ds.Lessons {
		room := roomByID[l.RoomID.String()]
		require.True(t, room.Schedulable, "%s is not schedulable but hosts %s", room.Code, l.CourseCode)

		if l.Type == domain.LessonLab {
			require.Equal(t, domain.RoomLab, room.Type, "a lab lesson (%s) must be in a lab room, not %s", l.CourseCode, room.Code)
		}
		if l.Type == domain.LessonLecture && len(l.GroupIDs) >= 2 {
			require.Equal(t, domain.RoomLecture, room.Type,
				"a lecture for %d groups (%s) must be in a lecture hall, not %s", len(l.GroupIDs), l.CourseCode, room.Code)
		}
		require.LessOrEqual(t, len(l.GroupIDs), 4)
		require.Positive(t, len(l.GroupIDs))
		require.Contains(t, []int{1, 2}, l.SlotSpan)
		require.GreaterOrEqual(t, l.SlotIdx, 1)
		require.LessOrEqual(t, l.SlotIdx+l.SlotSpan-1, 10)
		require.GreaterOrEqual(t, l.Weekday, 1)
		require.LessOrEqual(t, l.Weekday, 5, "no weekend lessons")
	}
}

// Nobody is in two places at once.
func TestGenerateNoDoubleBooking(t *testing.T) {
	t.Parallel()
	ds := generate(t)

	type key struct {
		weekday, slot int
		who           string
		parity        domain.Parity
	}
	collides := func(a, b domain.Parity) bool {
		return (a != domain.ParityOdd || b != domain.ParityEven) && (a != domain.ParityEven || b != domain.ParityOdd)
	}

	seen := map[key][]domain.Parity{}
	check := func(weekday, slot int, who string, parity domain.Parity, what string) {
		k := key{weekday, slot, who, ""}
		for _, p := range seen[k] {
			require.False(t, collides(p, parity), "%s %s is double-booked on weekday %d slot %d", what, who, weekday, slot)
		}
		seen[k] = append(seen[k], parity)
	}

	groupByID := map[string]string{}
	for _, g := range ds.Groups {
		groupByID[g.ID.String()] = g.Code
	}

	for _, l := range ds.Lessons {
		for i := 0; i < l.SlotSpan; i++ {
			check(l.Weekday, l.SlotIdx+i, "room:"+l.RoomCode, l.Parity, "room")
			check(l.Weekday, l.SlotIdx+i, "teacher:"+l.TeacherID.String(), l.Parity, "teacher")
			for _, gid := range l.GroupIDs {
				check(l.Weekday, l.SlotIdx+i, "group:"+groupByID[gid.String()], l.Parity, "group")
			}
		}
	}
}

// ~70 % of the schedulable rooms are in use across the working day, with the
// mid-morning peak the design shows.
func TestGenerateOccupancy(t *testing.T) {
	t.Parallel()
	ds := generate(t)

	const schedulable = 41
	busy := map[[2]int]map[string]bool{}
	for _, l := range ds.Lessons {
		if l.Parity == domain.ParityEven {
			continue // count one representative (odd) week
		}
		for i := 0; i < l.SlotSpan; i++ {
			k := [2]int{l.Weekday, l.SlotIdx + i}
			if busy[k] == nil {
				busy[k] = map[string]bool{}
			}
			busy[k][l.RoomCode] = true
		}
	}

	total := 0
	for weekday := 1; weekday <= 5; weekday++ {
		line := ""
		for slot := 1; slot <= 10; slot++ {
			n := len(busy[[2]int{weekday, slot}])
			total += n
			line += fmt.Sprintf(" %2d", n)
		}
		t.Logf("weekday %d:%s", weekday, line)
	}
	ratio := float64(total) / float64(schedulable*5*10)
	t.Logf("occupancy across Mon–Fri 08:00–18:00: %.1f%% (%d of %d room-slots)", ratio*100, total, schedulable*5*10)
	require.Greater(t, ratio, 0.55, "the building should feel busy")
	require.Less(t, ratio, 0.85)

	// The hero instant: Tuesday slot 3 (10:00) must fill at least 20 rooms so
	// the board's NOW list is full.
	tuesday10 := len(busy[[2]int{2, 3}])
	t.Logf("Tuesday 10:00: %d of %d rooms busy", tuesday10, schedulable)
	require.GreaterOrEqual(t, tuesday10, 20)
}

// Every weekday of the seeded fortnight carries two cancellations, one move and
// one delay, and Tuesday carries the three the design shows.
func TestGenerateOverrides(t *testing.T) {
	t.Parallel()
	today := domain.NewDate(2026, time.September, 7) // Monday of week 3
	ds, err := seed.Generate(seed.Options{Spec: load(t), Today: today})
	require.NoError(t, err)

	byDate := map[string][]seed.Override{}
	for _, o := range ds.Overrides {
		byDate[o.Date.String()] = append(byDate[o.Date.String()], o)
	}

	// Weeks 3 and 4 of the semester: 7–11 Sep and 14–18 Sep 2026.
	for _, d := range []string{
		"2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11",
		"2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18",
	} {
		kinds := map[domain.OverrideKind]int{}
		for _, o := range byDate[d] {
			kinds[o.Kind]++
		}
		require.Equal(t, 2, kinds[domain.OverrideCancel], "%s cancellations", d)
		require.Equal(t, 1, kinds[domain.OverrideMove], "%s moves", d)
		require.Equal(t, 1, kinds[domain.OverrideDelay], "%s delays", d)
	}

	// No weekend overrides.
	require.Empty(t, byDate["2026-09-12"])
	require.Empty(t, byDate["2026-09-13"])

	lessonByID := map[string]seed.Lesson{}
	for _, l := range ds.Lessons {
		lessonByID[l.ID.String()] = l
	}
	roomByID := map[string]domain.Room{}
	for _, r := range ds.Rooms {
		roomByID[r.ID.String()] = r
	}

	var sawCancel, sawMove, sawDelay bool
	for _, o := range byDate["2026-09-08"] {
		require.NotNil(t, o.LessonID)
		l := lessonByID[o.LessonID.String()]
		switch o.Kind {
		case domain.OverrideCancel:
			if l.CourseCode == "SE210" && l.RoomCode == "216" && l.SlotIdx == 4 {
				sawCancel = true
			}
		case domain.OverrideMove:
			require.Equal(t, "DS215", l.CourseCode)
			require.Equal(t, "412", l.RoomCode)
			require.Equal(t, 4, l.SlotIdx)
			require.NotNil(t, o.NewRoomID)
			require.Equal(t, "414", roomByID[o.NewRoomID.String()].Code)
			sawMove = true
		case domain.OverrideDelay:
			require.Equal(t, "CB240", l.CourseCode)
			require.Equal(t, "313", l.RoomCode)
			require.NotNil(t, o.DelayMinutes)
			require.Equal(t, 15, *o.DelayMinutes)
			sawDelay = true
		}
	}
	require.True(t, sawCancel, "SE210 in 216 at 11:00 must be cancelled on Tuesday")
	require.True(t, sawMove, "DS215 must move 412 → 414 on Tuesday")
	require.True(t, sawDelay, "CB240 in 313 must be delayed 15 minutes on Tuesday")
}

func TestGenerateAnnouncementsCoverTheSemester(t *testing.T) {
	t.Parallel()
	ds := generate(t)

	require.Len(t, ds.Announcements, 3)
	for _, a := range ds.Announcements {
		require.Equal(t, "A", a.Building)
		require.NotEmpty(t, a.Text)
		require.Equal(t, domain.SeverityInfo, a.Severity)
		require.True(t, a.StartsAt.Before(ds.Semester.StartsOn.AddDays(1).Midnight(ds.Building.Location)))
		require.True(t, a.EndsAt.After(ds.Semester.EndsOn.Midnight(ds.Building.Location)))
	}
	require.Contains(t, ds.Announcements[0].Text, "Open Lecture")
	require.Contains(t, ds.Announcements[1].Text, "Library")
}

func TestGenerateWithoutSpecFails(t *testing.T) {
	t.Parallel()
	_, err := seed.Generate(seed.Options{})
	require.Error(t, err)
}
