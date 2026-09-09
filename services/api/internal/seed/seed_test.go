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

// The thirteen rooms that can hold a class — docs/BUILDING.md.
var schedulableCodes = []string{
	"100", "101", "CR",
	"200", "201", "204", "AI-LAB", "219", "222", "223", "224", "226", "226A",
}

// The five subjects that exist in the whole university.
var courseCodes = []string{"AIF1303", "FC1301", "HK1105", "ICT1103", "IP1302"}

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
	require.Equal(t, seed.BuildingName, ds.Building.Name)
	require.Equal(t, "Asia/Almaty", ds.Building.Timezone)
	require.Equal(t, 2, ds.Building.Floors, "the real building has two floors")

	require.Len(t, ds.Floors, 2)
	require.Len(t, ds.Rooms, 54, "every space of building-a.json")
	require.Len(t, ds.Teachers, seed.TeacherCount)
	require.Len(t, ds.Groups, seed.GroupCount)
	require.Len(t, ds.Courses, len(courseCodes))
	require.Len(t, ds.Slots, 10)
	require.Len(t, ds.Announcements, 3)

	var schedulable []string
	for _, r := range ds.Rooms {
		if r.Schedulable {
			schedulable = append(schedulable, r.Code)
		}
	}
	require.ElementsMatch(t, schedulableCodes, schedulable)

	// The slots are ten 50-minute lessons with 10-minute breaks, 08:00–17:50.
	require.Equal(t, "08:00", ds.Slots[0].StartsAt.String())
	require.Equal(t, "08:50", ds.Slots[0].EndsAt.String())
	require.Equal(t, "17:00", ds.Slots[9].StartsAt.String())
	require.Equal(t, "17:50", ds.Slots[9].EndsAt.String())

	require.Equal(t, seed.SemesterName, ds.Semester.Name)
	require.Equal(t, "2026-08-24", ds.Semester.StartsOn.String())
	require.Equal(t, "2026-12-20", ds.Semester.EndsOn.String())
	require.Equal(t, domain.ParityOdd, ds.Semester.Week1Parity)

	// 8 Sep 2026 is week 3, odd — what the board header shows on the demo clock.
	n, p := engine.WeekInfo(ds.Semester, domain.NewDate(2026, time.September, 8))
	require.Equal(t, 3, n)
	require.Equal(t, domain.ParityOdd, p)
}

// Teachers and groups are the placeholders the admin panel renames.
func TestGeneratePlaceholderRoster(t *testing.T) {
	t.Parallel()
	ds := generate(t)

	for i, x := range ds.Teachers {
		want := fmt.Sprintf("Преподаватель %d", i+1)
		require.Equal(t, want, x.ShortName)
		require.Equal(t, want, x.FullName)
	}
	for i, g := range ds.Groups {
		require.Equal(t, fmt.Sprintf("Группа %d", i+1), g.Code)
		require.Equal(t, 1, g.CourseYear, "every group is in its first year")
	}

	var codes []string
	for _, c := range ds.Courses {
		codes = append(codes, c.Code)
		require.NotEmpty(t, c.Title)
	}
	require.ElementsMatch(t, courseCodes, codes)
}

// Room names come from docs/BUILDING.md, in Kazakh/Russian.
func TestGenerateRoomNames(t *testing.T) {
	t.Parallel()
	ds := generate(t)

	byCode := map[string]string{}
	for _, r := range ds.Rooms {
		byCode[r.Code] = r.Name
	}
	require.Equal(t, "Мәжіліс залы", byCode["100"])
	require.Equal(t, "Кітапхана", byCode["102"])
	require.Equal(t, "AI зертханасы", byCode["AI-LAB"])
	require.Equal(t, "Компьютерлік сынып", byCode["222"])
	require.Equal(t, "Ректор Тоқсанов Сапар Нұрахметұлы", byCode["207"])
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

// The demo instant — Tuesday 2026-09-08 10:47 +05:00 — must tell the same story
// every time: ten of the thirteen rooms busy in slot 3, and a cancellation, a
// move and a delay visible around it.
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
		{"HK1105", "Преподаватель 7", "100", 3, 2, []string{"Группа 1", "Группа 2", "Группа 3"}},
		{"FC1301", "Преподаватель 4", "200", 3, 2, []string{"Группа 4", "Группа 5"}},
		{"IP1302", "Преподаватель 12", "226", 3, 2, []string{"Группа 12"}},
		{"ICT1103", "Преподаватель 9", "219", 3, 1, []string{"Группа 6", "Группа 7"}},
		{"IP1302", "Преподаватель 11", "224", 3, 1, []string{"Группа 8", "Группа 9"}},
		{"AIF1303", "Преподаватель 1", "AI-LAB", 3, 1, []string{"Группа 10"}},
		{"ICT1103", "Преподаватель 10", "222", 3, 1, []string{"Группа 11"}},
		{"AIF1303", "Преподаватель 2", "101", 3, 1, []string{"Группа 13"}},
		{"FC1301", "Преподаватель 5", "CR", 3, 1, []string{"Группа 14"}},
		{"AIF1303", "Преподаватель 3", "204", 3, 1, []string{"Группа 15"}},
		{"ICT1103", "Преподаватель 10", "223", 4, 1, []string{"Группа 16"}},
		{"AIF1303", "Преподаватель 1", "226A", 4, 1, []string{"Группа 17"}},
	}

	for _, w := range wants {
		t.Run(fmt.Sprintf("%s in %s slot %d", w.course, w.room, w.slot), func(t *testing.T) {
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

// Every schedulable room only teaches the subjects docs/BUILDING.md allows it,
// and every one of them is used.
func TestGenerateRoomCatalogue(t *testing.T) {
	t.Parallel()
	ds := generate(t)

	labOnly := map[string]bool{"101": true, "204": true, "AI-LAB": true, "222": true, "223": true, "226": true, "226A": true}
	seen := map[string]int{}
	for _, l := range ds.Lessons {
		seen[l.RoomCode]++
		require.Contains(t, courseCodes, l.CourseCode, "%s is not one of the five subjects", l.CourseCode)
		if l.RoomCode == "AI-LAB" {
			require.Equal(t, "AIF1303", l.CourseCode, "the AI lab only teaches AI")
		}
		if labOnly[l.RoomCode] {
			require.Equal(t, domain.LessonLab, l.Type, "%s only holds labs", l.RoomCode)
		}
	}
	for _, code := range schedulableCodes {
		require.Positive(t, seen[code], "room %s has no lessons at all", code)
	}
}

// Placement rules: only schedulable rooms, labs in laboratories, multi-group
// lectures in lecture halls, weekdays only.
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

// The building has to feel alive: most of the thirteen rooms in use across the
// teaching day, and the demo instant near capacity.
func TestGenerateOccupancy(t *testing.T) {
	t.Parallel()
	ds := generate(t)

	schedulable := len(schedulableCodes)
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
	require.Greater(t, ratio, 0.45, "the building should feel busy")
	require.Less(t, ratio, 0.95)

	// The demo instant: Tuesday slot 3 (10:00) fills ten of the thirteen rooms.
	tuesday10 := len(busy[[2]int{2, 3}])
	t.Logf("Tuesday 10:00: %d of %d rooms busy", tuesday10, schedulable)
	require.GreaterOrEqual(t, tuesday10, 10)
}

// Every weekday of the seeded fortnight carries two cancellations, one move and
// one delay, and Tuesday carries the three the demo instant shows.
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
			if l.RoomCode == "223" && l.SlotIdx == 4 {
				require.Equal(t, "ICT1103", l.CourseCode)
				sawCancel = true
			}
		case domain.OverrideMove:
			require.Equal(t, "226A", l.RoomCode)
			require.Equal(t, 4, l.SlotIdx)
			require.NotNil(t, o.NewRoomID)
			require.Equal(t, "101", roomByID[o.NewRoomID.String()].Code)
			sawMove = true
		case domain.OverrideDelay:
			require.Equal(t, "204", l.RoomCode)
			require.NotNil(t, o.DelayMinutes)
			require.Equal(t, 15, *o.DelayMinutes)
			sawDelay = true
		}
	}
	require.True(t, sawCancel, "the 223 lab at 11:00 must be cancelled on Tuesday")
	require.True(t, sawMove, "the 226A lab must move to 101 on Tuesday")
	require.True(t, sawDelay, "the 204 lab must be delayed 15 minutes on Tuesday")
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
	require.Contains(t, ds.Announcements[0].Text, "Открытая лекция")
	require.Contains(t, ds.Announcements[1].Text, "Библиотека")
}

func TestGenerateWithoutSpecFails(t *testing.T) {
	t.Parallel()
	_, err := seed.Generate(seed.Options{})
	require.Error(t, err)
}
