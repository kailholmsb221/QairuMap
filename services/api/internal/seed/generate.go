// Package seed builds the deterministic demo dataset (ARCHITECTURE §13).
//
// Everything here is reproducible: `math/rand` is driven from a fixed seed and
// every loop walks an explicitly ordered slice — no map is ever ranged over
// while generating — so two runs on two machines produce byte-identical data.
package seed

import (
	"fmt"
	"math/rand"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
	"github.com/kailholmes/campuslive/services/api/internal/engine"
	"github.com/kailholmes/campuslive/services/api/internal/mapspec"
)

// Seed is the fixed PRNG seed. Changing it changes the whole demo dataset.
const Seed = 42

// Lesson is a generated schedule template.
type Lesson struct {
	ID        uuid.UUID
	CourseID  uuid.UUID
	TeacherID uuid.UUID
	RoomID    uuid.UUID
	SlotID    uuid.UUID
	Weekday   int
	Parity    domain.Parity
	Type      domain.LessonType
	SlotSpan  int
	GroupIDs  []uuid.UUID

	// Denormalised for the override pass and for tests.
	CourseCode string
	RoomCode   string
	SlotIdx    int
}

// Override is a generated point change.
type Override struct {
	ID           uuid.UUID
	LessonID     *uuid.UUID
	Date         domain.Date
	Kind         domain.OverrideKind
	NewRoomID    *uuid.UUID
	NewTeacherID *uuid.UUID
	DelayMinutes *int
	CourseID     *uuid.UUID
	SlotID       *uuid.UUID
	Note         string
}

// Dataset is everything cmd/seed writes.
type Dataset struct {
	Building      domain.Building
	Floors        []domain.Floor
	Rooms         []domain.Room
	Teachers      []domain.Teacher
	Groups        []domain.Group
	Courses       []domain.Course
	Slots         []domain.TimeSlot
	Semester      domain.Semester
	Lessons       []Lesson
	Overrides     []Override
	Announcements []domain.Announcement
}

// Options configure generation.
type Options struct {
	// Spec is the loaded packages/map-data/building-a.json.
	Spec *mapspec.Spec
	// Today is the local building date the seeder runs on. The scripted
	// overrides cover the semester week containing it and the following one, so
	// the demo always has interesting statuses.
	Today domain.Date
}

// Fill ratios per slot: a real teaching day peaks late morning and empties out
// after 16:00. The average is ≈ 0.68 of the 41 schedulable rooms.
var slotFill = map[int]float64{
	1: 0.62, 2: 0.74, 3: 0.88, 4: 0.88, 5: 0.82,
	6: 0.78, 7: 0.85, 8: 0.78, 9: 0.70, 10: 0.58,
}

// slotOrder fills the busiest slots first, so that when the 30 student groups
// run out it is the quiet edges of the day that thin out, not the peak.
var slotOrder = []int{3, 4, 7, 5, 8, 2, 6, 9, 1, 10}

const (
	// A demo board only looks alive when the building is full, so a group may
	// sit in every one of the ten slots (12 allows for the two-slot lectures
	// that overhang a slot boundary). The teacher cap is the real one: it stops
	// the department-affinity rule from handing one lecturer the whole day.
	maxGroupSlotsPerDay   = 12
	maxTeacherSlotsPerDay = 10
	parityChance          = 0.10
)

// Generate builds the whole dataset.
func Generate(opt Options) (*Dataset, error) {
	if opt.Spec == nil {
		return nil, fmt.Errorf("seed: no map spec")
	}
	rng := rand.New(rand.NewSource(Seed)) //nolint:gosec // determinism, not cryptography

	ds := &Dataset{}
	if err := ds.buildStatics(opt.Spec); err != nil {
		return nil, err
	}

	g := newGenerator(ds, rng)
	g.placeFixed()
	g.fill()
	ds.Lessons = g.lessons

	if err := ds.buildOverrides(g, opt.Today, rng); err != nil {
		return nil, err
	}
	ds.buildAnnouncements()
	return ds, nil
}

// --------------------------------------------------------------- statics --

func (ds *Dataset) buildStatics(spec *mapspec.Spec) error {
	loc, err := time.LoadLocation(spec.Timezone)
	if err != nil {
		return fmt.Errorf("seed: time zone %q: %w", spec.Timezone, err)
	}
	ds.Building = domain.Building{
		ID:       ID("building", spec.Building),
		Code:     spec.Building,
		Name:     spec.Name,
		Timezone: spec.Timezone,
		Location: loc,
		Floors:   len(spec.Floors),
	}

	for _, f := range spec.Floors {
		floorID := ID("floor", fmt.Sprintf("%s/%d", spec.Building, f.Number))
		ds.Floors = append(ds.Floors, domain.Floor{ID: floorID, Number: f.Number, PlanKey: f.PlanKey})

		for _, r := range f.Rooms {
			// The room id comes from building-a.json so the web app, the map
			// and the database agree before the database even exists.
			id, err := uuid.Parse(r.ID)
			if err != nil {
				return fmt.Errorf("seed: room %s has an invalid id %q: %w", r.Code, r.ID, err)
			}
			ds.Rooms = append(ds.Rooms, domain.Room{
				ID:          id,
				Code:        r.Code,
				Name:        r.Name,
				Type:        domain.RoomType(r.Type),
				Wing:        domain.Wing(r.Wing),
				Schedulable: r.Schedulable,
				Capacity:    r.Capacity,
				Floor:       f.Number,
				FloorID:     floorID,
				Geometry: domain.Geometry{
					Path:  r.Path,
					BBox:  domain.BBox{X: r.BBox.X, Y: r.BBox.Y, W: r.BBox.W, H: r.BBox.H},
					Label: domain.Point{X: r.Label.X, Y: r.Label.Y},
				},
			})
		}
	}

	for _, t := range teachers {
		ds.Teachers = append(ds.Teachers, domain.Teacher{
			ID: ID("teacher", t.Short), FullName: t.Full, ShortName: t.Short, Department: t.Dept,
		})
	}
	for _, g := range groups {
		ds.Groups = append(ds.Groups, domain.Group{
			ID: ID("group", g.Code), Code: g.Code, Program: g.Program, CourseYear: g.Year,
		})
	}
	for _, c := range courses {
		ds.Courses = append(ds.Courses, domain.Course{
			ID: ID("course", c.Code), Code: c.Code, Title: c.Title, Department: c.Dept,
		})
	}
	ds.Slots = timeSlots()
	ds.Semester = domain.Semester{
		ID:          ID("semester", "fall-2026"),
		Name:        "Fall 2026",
		StartsOn:    domain.NewDate(2026, time.August, 24),
		EndsOn:      domain.NewDate(2026, time.December, 20),
		Week1Parity: domain.ParityOdd,
	}
	return nil
}

// ------------------------------------------------------------- generator --

type generator struct {
	ds  *Dataset
	rng *rand.Rand

	roomByCode    map[string]domain.Room
	teacherByName map[string]domain.Teacher
	courseByCode  map[string]domain.Course
	groupByCode   map[string]domain.Group
	slotByIdx     map[int]domain.TimeSlot

	schedulable []domain.Room

	// occupancy[weekday][slot][key] holds the parities already placed there.
	roomBusy    map[string][]domain.Parity
	groupBusy   map[string][]domain.Parity
	teacherBusy map[string][]domain.Parity

	groupLoad   map[string]int // groupCode|weekday → slots used that day
	teacherLoad map[string]int

	blocked map[string]bool // weekday|slot|roomCode kept free for the demo overrides

	lessons []Lesson
}

func newGenerator(ds *Dataset, rng *rand.Rand) *generator {
	g := &generator{
		ds:            ds,
		rng:           rng,
		roomByCode:    make(map[string]domain.Room, len(ds.Rooms)),
		teacherByName: make(map[string]domain.Teacher, len(ds.Teachers)),
		courseByCode:  make(map[string]domain.Course, len(ds.Courses)),
		groupByCode:   make(map[string]domain.Group, len(ds.Groups)),
		slotByIdx:     make(map[int]domain.TimeSlot, len(ds.Slots)),
		roomBusy:      map[string][]domain.Parity{},
		groupBusy:     map[string][]domain.Parity{},
		teacherBusy:   map[string][]domain.Parity{},
		groupLoad:     map[string]int{},
		teacherLoad:   map[string]int{},
		blocked:       map[string]bool{},
	}
	for _, r := range ds.Rooms {
		g.roomByCode[r.Code] = r
		if r.Schedulable {
			g.schedulable = append(g.schedulable, r)
		}
	}
	for _, t := range ds.Teachers {
		g.teacherByName[t.ShortName] = t
	}
	for _, c := range ds.Courses {
		g.courseByCode[c.Code] = c
	}
	for _, gr := range ds.Groups {
		g.groupByCode[gr.Code] = gr
	}
	for _, s := range ds.Slots {
		g.slotByIdx[s.Idx] = s
	}
	for _, k := range keepFree {
		g.blocked[cell(k.Weekday, k.Slot, k.Room)] = true
	}
	return g
}

func cell(weekday, slot int, key string) string {
	return fmt.Sprintf("%d|%d|%s", weekday, slot, key)
}

func dayKey(weekday int, key string) string { return fmt.Sprintf("%d|%s", weekday, key) }

// compatible reports whether two parities can share the same room and slot:
// only odd and even alternate, everything else collides.
func compatible(a, b domain.Parity) bool {
	return (a == domain.ParityOdd && b == domain.ParityEven) || (a == domain.ParityEven && b == domain.ParityOdd)
}

func free(existing []domain.Parity, p domain.Parity) bool {
	for _, e := range existing {
		if !compatible(e, p) {
			return false
		}
	}
	return true
}

// canPlace checks the room, every group and the teacher across every slot the
// lesson spans.
func (g *generator) canPlace(weekday, slot, span int, roomCode, teacher string, groupCodes []string, parity domain.Parity) bool {
	for i := 0; i < span; i++ {
		s := slot + i
		if _, ok := g.slotByIdx[s]; !ok {
			return false
		}
		if g.blocked[cell(weekday, s, roomCode)] {
			return false
		}
		if !free(g.roomBusy[cell(weekday, s, roomCode)], parity) {
			return false
		}
		if !free(g.teacherBusy[cell(weekday, s, teacher)], parity) {
			return false
		}
		for _, gc := range groupCodes {
			if !free(g.groupBusy[cell(weekday, s, gc)], parity) {
				return false
			}
		}
	}
	return true
}

func (g *generator) occupy(weekday, slot, span int, roomCode, teacher string, groupCodes []string, parity domain.Parity) {
	for i := 0; i < span; i++ {
		s := slot + i
		g.roomBusy[cell(weekday, s, roomCode)] = append(g.roomBusy[cell(weekday, s, roomCode)], parity)
		g.teacherBusy[cell(weekday, s, teacher)] = append(g.teacherBusy[cell(weekday, s, teacher)], parity)
		g.teacherLoad[dayKey(weekday, teacher)]++
		for _, gc := range groupCodes {
			g.groupBusy[cell(weekday, s, gc)] = append(g.groupBusy[cell(weekday, s, gc)], parity)
			g.groupLoad[dayKey(weekday, gc)]++
		}
	}
}

func (g *generator) add(key string, weekday, slot, span int, courseCode, teacherName, roomCode string, groupCodes []string, typ domain.LessonType, parity domain.Parity) bool {
	course, ok := g.courseByCode[courseCode]
	if !ok {
		return false
	}
	teacher, ok := g.teacherByName[teacherName]
	if !ok {
		return false
	}
	room, ok := g.roomByCode[roomCode]
	if !ok {
		return false
	}
	slotRec, ok := g.slotByIdx[slot]
	if !ok {
		return false
	}
	if !g.canPlace(weekday, slot, span, roomCode, teacherName, groupCodes, parity) {
		return false
	}

	groupIDs := make([]uuid.UUID, 0, len(groupCodes))
	for _, gc := range groupCodes {
		gr, ok := g.groupByCode[gc]
		if !ok {
			return false
		}
		groupIDs = append(groupIDs, gr.ID)
	}

	g.occupy(weekday, slot, span, roomCode, teacherName, groupCodes, parity)
	g.lessons = append(g.lessons, Lesson{
		ID:         ID("lesson", key),
		CourseID:   course.ID,
		TeacherID:  teacher.ID,
		RoomID:     room.ID,
		SlotID:     slotRec.ID,
		Weekday:    weekday,
		Parity:     parity,
		Type:       typ,
		SlotSpan:   span,
		GroupIDs:   groupIDs,
		CourseCode: courseCode,
		RoomCode:   roomCode,
		SlotIdx:    slot,
	})
	return true
}

// placeFixed lays down the design's hero rows before anything random, so the
// demo board always tells the same story.
func (g *generator) placeFixed() {
	for _, f := range heroLessons {
		if !g.add(f.Key, f.Weekday, f.Slot, f.Span, f.Course, f.Teacher, f.Room, f.Groups, f.Type, domain.ParityAll) {
			// A hero lesson that cannot be placed is a bug in this file, not a
			// runtime condition; surface it loudly rather than silently
			// producing a demo that does not match the design.
			panic(fmt.Sprintf("seed: hero lesson %q could not be placed", f.Key))
		}
	}
}

// fill adds the random filler until each slot reaches its target occupancy or
// the student groups run out.
func (g *generator) fill() {
	n := 0
	for weekday := 1; weekday <= 5; weekday++ {
		for _, slot := range slotOrder {
			target := int(slotFill[slot]*float64(len(g.schedulable)) + 0.5)
			rooms := g.shuffledRooms()

			busy := 0
			for _, r := range rooms {
				if len(g.roomBusy[cell(weekday, slot, r.Code)]) > 0 {
					busy++
				}
			}

			for _, room := range rooms {
				if busy >= target {
					break
				}
				if len(g.roomBusy[cell(weekday, slot, room.Code)]) > 0 || g.blocked[cell(weekday, slot, room.Code)] {
					continue
				}

				parity := domain.ParityAll
				if g.rng.Float64() < parityChance {
					if g.rng.Intn(2) == 0 {
						parity = domain.ParityOdd
					} else {
						parity = domain.ParityEven
					}
				}

				if g.placeOne(&n, weekday, slot, room, parity) {
					busy++
					// An odd-week lesson leaves the even weeks free: pair it up
					// so the room is used on both, which is what makes the
					// parity rules visible in the demo data.
					if parity != domain.ParityAll {
						g.placeOne(&n, weekday, slot, room, parity.Other())
					}
				}
			}
		}
	}
}

func (g *generator) placeOne(n *int, weekday, slot int, room domain.Room, parity domain.Parity) bool {
	typ := lessonTypeFor(room.Type)
	wantGroups := 1
	if room.Type == domain.RoomLecture && g.rng.Float64() < 0.6 {
		wantGroups = 2 + g.rng.Intn(2) // a real lecture gathers 2–3 groups
	}

	groupCodes := g.pickGroups(weekday, slot, wantGroups, parity)
	if len(groupCodes) == 0 {
		return false
	}
	// The rule from ARCHITECTURE §13: a lecture for several groups only ever
	// happens in a lecture hall.
	if len(groupCodes) > 1 && room.Type != domain.RoomLecture {
		typ = lessonTypeFor(room.Type)
		if typ == domain.LessonLecture {
			typ = domain.LessonPractice
		}
	}

	courseCode := g.pickCourse(room, groupCodes)
	if courseCode == "" {
		return false
	}
	teacherName := g.pickTeacher(weekday, slot, courseCode, parity)
	if teacherName == "" {
		return false
	}

	span := 1
	if room.Type == domain.RoomLecture && slot < 10 && g.rng.Float64() < 0.15 {
		span = 2
	}

	*n++
	key := fmt.Sprintf("gen-%d-%d-%s-%s-%d", weekday, slot, room.Code, parity, *n)
	if g.add(key, weekday, slot, span, courseCode, teacherName, room.Code, groupCodes, typ, parity) {
		return true
	}
	// Retry with a single slot when the two-slot span collided.
	if span == 2 {
		return g.add(key, weekday, slot, 1, courseCode, teacherName, room.Code, groupCodes, typ, parity)
	}
	return false
}

func lessonTypeFor(rt domain.RoomType) domain.LessonType {
	switch rt {
	case domain.RoomLab:
		return domain.LessonLab
	case domain.RoomLecture:
		return domain.LessonLecture
	default:
		return domain.LessonPractice
	}
}

// shuffledRooms returns the schedulable rooms in a deterministic random order.
func (g *generator) shuffledRooms() []domain.Room {
	out := append([]domain.Room(nil), g.schedulable...)
	g.rng.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	return out
}

// pickGroups takes up to want groups that are free in this slot and still under
// their daily load cap.
func (g *generator) pickGroups(weekday, slot, want int, parity domain.Parity) []string {
	order := make([]int, len(g.ds.Groups))
	for i := range order {
		order[i] = i
	}
	g.rng.Shuffle(len(order), func(i, j int) { order[i], order[j] = order[j], order[i] })

	var out []string
	var program string
	for _, i := range order {
		gr := g.ds.Groups[i]
		if !free(g.groupBusy[cell(weekday, slot, gr.Code)], parity) {
			continue
		}
		if g.groupLoad[dayKey(weekday, gr.Code)] >= maxGroupSlotsPerDay {
			continue
		}
		// Groups attending together belong to the same programme.
		if program == "" {
			program = gr.Program
		} else if gr.Program != program {
			continue
		}
		out = append(out, gr.Code)
		if len(out) == want {
			break
		}
	}
	return out
}

// pickCourse honours the themed laboratories first, then the programme of the
// attending groups, then the general education catalogue.
func (g *generator) pickCourse(room domain.Room, groupCodes []string) string {
	if themed, ok := themedLabs[room.Code]; ok {
		return themed[g.rng.Intn(len(themed))]
	}
	program := ""
	if len(groupCodes) > 0 {
		program = g.groupByCode[groupCodes[0]].Program
	}

	var pool []string
	if p, ok := programCourses[program]; ok && g.rng.Float64() < 0.75 {
		pool = p
	} else {
		pool = generalCourses
	}
	// A laboratory never hosts a language or history class.
	if room.Type == domain.RoomLab {
		filtered := pool[:0:0]
		for _, code := range pool {
			if !isGeneral(code) {
				filtered = append(filtered, code)
			}
		}
		if len(filtered) > 0 {
			pool = filtered
		} else if p, ok := programCourses[program]; ok {
			pool = p
		}
	}
	if len(pool) == 0 {
		return ""
	}
	code := pool[g.rng.Intn(len(pool))]
	if code == "OL100" {
		return ""
	}
	return code
}

func isGeneral(code string) bool {
	for _, c := range generalCourses {
		if c == code {
			return true
		}
	}
	return false
}

// pickTeacher prefers a member of the course's own department and falls back to
// anyone free.
func (g *generator) pickTeacher(weekday, slot int, courseCode string, parity domain.Parity) string {
	dept := g.courseByCode[courseCode].Department

	order := make([]int, len(g.ds.Teachers))
	for i := range order {
		order[i] = i
	}
	g.rng.Shuffle(len(order), func(i, j int) { order[i], order[j] = order[j], order[i] })

	fallback := ""
	for _, i := range order {
		t := g.ds.Teachers[i]
		if !free(g.teacherBusy[cell(weekday, slot, t.ShortName)], parity) {
			continue
		}
		if g.teacherLoad[dayKey(weekday, t.ShortName)] >= maxTeacherSlotsPerDay {
			continue
		}
		if t.Department == dept {
			return t.ShortName
		}
		if fallback == "" {
			fallback = t.ShortName
		}
	}
	return fallback
}

// ------------------------------------------------------------- overrides --

// buildOverrides writes the scripted per-day changes: two cancellations, one
// move and one delay for every weekday of the semester week containing the seed
// run date and of the week after it (ARCHITECTURE §13). Tuesdays additionally
// carry the exact three the design shows.
func (ds *Dataset) buildOverrides(g *generator, today domain.Date, rng *rand.Rand) error {
	lessonByKey := map[string]*Lesson{}
	for i := range ds.Lessons {
		lessonByKey[ds.Lessons[i].ID.String()] = &ds.Lessons[i]
	}

	heroCancel := ID("lesson", "hero-se210")
	heroMove := ID("lesson", "hero-ds215")
	heroDelay := ID("lesson", "hero-cb240")
	room414, ok := g.roomByCode["414"]
	if !ok {
		return fmt.Errorf("seed: room 414 is missing from the map data")
	}

	weekNumber, _ := engine.WeekInfo(ds.Semester, today)
	weekMonday := mondayOfWeek(ds.Semester, weekNumber)

	for w := 0; w < 2; w++ {
		for weekday := 1; weekday <= 5; weekday++ {
			date := weekMonday.AddDays(w*7 + weekday - 1)
			_, parity := engine.WeekInfo(ds.Semester, date)

			// Candidate lessons: the ones that actually run on this date.
			var candidates []*Lesson
			for i := range ds.Lessons {
				l := &ds.Lessons[i]
				if l.Weekday != weekday {
					continue
				}
				if l.Parity != domain.ParityAll && l.Parity != parity {
					continue
				}
				candidates = append(candidates, l)
			}
			sort.Slice(candidates, func(i, j int) bool { return candidates[i].ID.String() < candidates[j].ID.String() })
			if len(candidates) == 0 {
				continue
			}

			used := map[uuid.UUID]bool{}
			add := func(kind domain.OverrideKind, l *Lesson, mutate func(*Override)) {
				lid := l.ID
				ov := Override{
					ID:       ID("override", fmt.Sprintf("%s/%s/%s", date, kind, l.ID)),
					LessonID: &lid,
					Date:     date,
					Kind:     kind,
				}
				if mutate != nil {
					mutate(&ov)
				}
				ds.Overrides = append(ds.Overrides, ov)
				used[l.ID] = true
			}

			cancels := 0
			if weekday == 2 {
				// The three the design shows, on every Tuesday of the window.
				if l, ok := lessonByKey[heroCancel.String()]; ok {
					add(domain.OverrideCancel, l, func(o *Override) { o.Note = "Lecturer unavailable" })
					cancels++
				}
				if l, ok := lessonByKey[heroMove.String()]; ok {
					add(domain.OverrideMove, l, func(o *Override) {
						id := room414.ID
						o.NewRoomID = &id
						o.Note = "Computer Lab 4 is being re-imaged"
					})
				}
				if l, ok := lessonByKey[heroDelay.String()]; ok {
					add(domain.OverrideDelay, l, func(o *Override) {
						d := 15
						o.DelayMinutes = &d
						o.Note = "Starts 15 minutes late"
					})
				}
			}

			pick := func(skipKinds ...domain.OverrideKind) *Lesson {
				_ = skipKinds
				for attempt := 0; attempt < 40; attempt++ {
					l := candidates[rng.Intn(len(candidates))]
					if used[l.ID] {
						continue
					}
					return l
				}
				return nil
			}

			for cancels < 2 {
				l := pick()
				if l == nil {
					break
				}
				add(domain.OverrideCancel, l, func(o *Override) { o.Note = "Cancelled" })
				cancels++
			}

			if weekday != 2 {
				if l := pick(); l != nil {
					if dest := g.freeRoomFor(l, weekday, parity); dest != nil {
						add(domain.OverrideMove, l, func(o *Override) {
							id := dest.ID
							o.NewRoomID = &id
							o.Note = "Room changed"
						})
					}
				}
				if l := pick(); l != nil {
					add(domain.OverrideDelay, l, func(o *Override) {
						d := []int{10, 15, 20}[rng.Intn(3)]
						o.DelayMinutes = &d
						o.Note = "Starts late"
					})
				}
			}
		}
	}

	sort.SliceStable(ds.Overrides, func(i, j int) bool {
		if !ds.Overrides[i].Date.Equal(ds.Overrides[j].Date) {
			return ds.Overrides[i].Date.Before(ds.Overrides[j].Date)
		}
		return ds.Overrides[i].ID.String() < ds.Overrides[j].ID.String()
	})
	return nil
}

// freeRoomFor finds a schedulable room of the same kind that is empty in this
// lesson's slot, so a move never manufactures a conflict.
func (g *generator) freeRoomFor(l *Lesson, weekday int, parity domain.Parity) *domain.Room {
	origin := g.roomByCode[l.RoomCode]
	for _, r := range g.schedulable {
		if r.Code == l.RoomCode || r.Type != origin.Type {
			continue
		}
		ok := true
		for i := 0; i < maxInt(l.SlotSpan, 1); i++ {
			if !free(g.roomBusy[cell(weekday, l.SlotIdx+i, r.Code)], parity) {
				ok = false
				break
			}
		}
		if ok {
			room := r
			return &room
		}
	}
	return nil
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// mondayOfWeek returns the Monday that starts the given teaching week.
func mondayOfWeek(sem domain.Semester, weekNumber int) domain.Date {
	start := sem.StartsOn
	monday := start.AddDays(-(start.ISOWeekday() - 1))
	return monday.AddDays((weekNumber - 1) * 7)
}

// ---------------------------------------------------------- announcements --

func (ds *Dataset) buildAnnouncements() {
	loc := ds.Building.Location
	from := ds.Semester.StartsOn.Midnight(loc)
	to := ds.Semester.EndsOn.AddDays(1).Midnight(loc)

	for _, a := range tickerAnnouncements {
		ds.Announcements = append(ds.Announcements, domain.Announcement{
			ID:       ID("announcement", a.Text),
			Building: ds.Building.Code,
			Text:     a.Text,
			Severity: a.Severity,
			StartsAt: from,
			EndsAt:   to,
		})
	}
}
