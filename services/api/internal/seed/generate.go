// Package seed builds the deterministic demo dataset for the real building
// (docs/BUILDING.md).
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

// slotFill is how many of the thirteen schedulable rooms should be busy in each
// slot: a real teaching day warms up, peaks late morning, dips over lunch,
// picks up again after 14:00 and empties out towards 18:00.
var slotFill = map[int]float64{
	1: 0.40, 2: 0.62, 3: 0.77, 4: 0.77, 5: 0.62,
	6: 0.50, 7: 0.70, 8: 0.62, 9: 0.42, 10: 0.25,
}

// slotOrder fills the busiest slots first, so that when the 24 student groups
// run out it is the quiet edges of the day that thin out, not the peak.
var slotOrder = []int{3, 4, 7, 2, 5, 8, 6, 1, 9, 10}

const (
	// Every group gets roughly four pairs a day; the cap leaves head-room for
	// the two-slot lessons that overhang a slot boundary.
	maxGroupSlotsPerDay = 6
	// Twelve teachers cover thirteen rooms, so the cap has to be generous or
	// the peak slots cannot be filled at all.
	maxTeacherSlotsPerDay = 8
	// How often a cell carries an odd/even pair instead of a weekly lesson.
	parityChance = 0.30
	// How often a lesson runs over two consecutive slots.
	lectureSpanChance = 0.20
	labSpanChance     = 0.12
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
		Name:     BuildingName,
		Timezone: spec.Timezone,
		Location: loc,
		Floors:   len(spec.Floors),
	}

	for _, f := range spec.Floors {
		floorID := ID("floor", fmt.Sprintf("%s/%d", spec.Building, f.Number))
		ds.Floors = append(ds.Floors, domain.Floor{ID: floorID, Number: f.Number, PlanKey: f.PlanKey})

		for _, r := range f.Rooms {
			// The room id comes from building-a.json so the web app, the map
			// and the database agree before the database even exists. The name
			// is the Kazakh/Russian one of docs/BUILDING.md; the English one
			// stays in the map data.
			id, err := uuid.Parse(r.ID)
			if err != nil {
				return fmt.Errorf("seed: room %s has an invalid id %q: %w", r.Code, r.ID, err)
			}
			ds.Rooms = append(ds.Rooms, domain.Room{
				ID:          id,
				Code:        r.Code,
				Name:        RoomName(r.Code, r.Name),
				Type:        domain.RoomType(r.Type),
				Wing:        domain.Wing(r.Wing),
				Schedulable: r.Schedulable,
				Capacity:    r.Capacity,
				Aliases:     RoomAliases(r.Code),
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

	for _, t := range teacherSeeds() {
		ds.Teachers = append(ds.Teachers, domain.Teacher{
			ID: ID("teacher", t.Short), FullName: t.Full, ShortName: t.Short, Department: t.Dept,
		})
	}
	for _, g := range groupSeeds() {
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
		Name:        SemesterName,
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

	// staffOf and catalogueOf are read by key only, never ranged over.
	staffOf     map[string][]string
	catalogueOf map[string][]string

	schedulable []domain.Room

	// occupancy[weekday|slot|key] holds the parities already placed there.
	roomBusy    map[string][]domain.Parity
	groupBusy   map[string][]domain.Parity
	teacherBusy map[string][]domain.Parity

	// load is counted per parity bucket, so an odd/even pair in one cell does
	// not look like two lessons in the same week.
	groupLoad   map[string]int
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
		staffOf:       make(map[string][]string, len(courseStaff)),
		catalogueOf:   make(map[string][]string, len(roomCatalogue)),
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
	for _, cs := range courseStaff {
		g.staffOf[cs.Course] = cs.Teachers
	}
	for _, rc := range roomCatalogue {
		g.catalogueOf[rc.Room] = rc.Courses
	}
	for _, k := range keepFree {
		g.blocked[cell(k.Weekday, k.Slot, k.Room)] = true
	}
	return g
}

func cell(weekday, slot int, key string) string {
	return fmt.Sprintf("%d|%d|%s", weekday, slot, key)
}

func loadKey(weekday int, key string, p domain.Parity) string {
	return fmt.Sprintf("%d|%s|%s", weekday, key, p)
}

// buckets lists the parity buckets a lesson consumes: an every-week lesson
// takes both, an odd-week one only the odd bucket.
func buckets(p domain.Parity) []domain.Parity {
	if p == domain.ParityAll {
		return []domain.Parity{domain.ParityOdd, domain.ParityEven}
	}
	return []domain.Parity{p}
}

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

// underLoad reports whether a key is still below its daily cap in every parity
// bucket the lesson would consume.
func underLoad(load map[string]int, weekday int, key string, p domain.Parity, cap int) bool {
	for _, b := range buckets(p) {
		if load[loadKey(weekday, key, b)] >= cap {
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
		for _, b := range buckets(parity) {
			g.teacherLoad[loadKey(weekday, teacher, b)]++
		}
		for _, gc := range groupCodes {
			g.groupBusy[cell(weekday, s, gc)] = append(g.groupBusy[cell(weekday, s, gc)], parity)
			for _, b := range buckets(parity) {
				g.groupLoad[loadKey(weekday, gc, b)]++
			}
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
	if !ok || !room.Schedulable {
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

// placeFixed lays down the demo instant's rows before anything random, so the
// board at CLOCK_FIXED_AT always tells the same story.
func (g *generator) placeFixed() {
	for _, f := range heroLessons {
		if !g.add(f.Key, f.Weekday, f.Slot, f.Span, f.Course, f.Teacher, f.Room, f.Groups, f.Type, domain.ParityAll) {
			// A hero lesson that cannot be placed is a bug in data.go, not a
			// runtime condition; surface it loudly rather than silently
			// producing a demo that does not match docs/BUILDING.md.
			panic(fmt.Sprintf("seed: hero lesson %q could not be placed", f.Key))
		}
	}
}

// fill adds the filler until each slot reaches its target occupancy or the
// student groups run out.
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

	// Only a lecture hall ever gathers several groups (docs/BUILDING.md).
	wantGroups := 1
	if room.Type == domain.RoomLecture {
		wantGroups = 2 + g.rng.Intn(2) // 2–3 groups
	}

	span := 1
	if _, ok := g.slotByIdx[slot+1]; ok {
		chance := 0.0
		switch room.Type {
		case domain.RoomLecture:
			chance = lectureSpanChance
		case domain.RoomLab:
			chance = labSpanChance
		default:
			chance = 0
		}
		if g.rng.Float64() < chance {
			span = 2
		}
	}

	groupCodes := g.pickGroups(weekday, slot, span, wantGroups, parity)
	if len(groupCodes) == 0 {
		return false
	}
	courseCode, teacherName := g.pickCourseAndTeacher(weekday, slot, span, room, parity)
	if courseCode == "" {
		return false
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

// pickGroups takes up to want groups that are free in every spanned slot and
// still under their daily cap, preferring the ones with the lightest day so the
// four-pairs-a-day load spreads evenly over the 24 groups.
func (g *generator) pickGroups(weekday, slot, span, want int, parity domain.Parity) []string {
	order := make([]int, len(g.ds.Groups))
	for i := range order {
		order[i] = i
	}
	g.rng.Shuffle(len(order), func(i, j int) { order[i], order[j] = order[j], order[i] })

	type candidate struct {
		code string
		load int
	}
	var pool []candidate
	for _, i := range order {
		gr := g.ds.Groups[i]
		if !g.freeOver(g.groupBusy, weekday, slot, span, gr.Code, parity) {
			continue
		}
		if !underLoad(g.groupLoad, weekday, gr.Code, parity, maxGroupSlotsPerDay) {
			continue
		}
		pool = append(pool, candidate{code: gr.Code, load: g.groupLoad[loadKey(weekday, gr.Code, buckets(parity)[0])]})
	}
	sort.SliceStable(pool, func(i, j int) bool { return pool[i].load < pool[j].load })

	out := make([]string, 0, want)
	for _, c := range pool {
		out = append(out, c.code)
		if len(out) == want {
			break
		}
	}
	sort.Strings(out)
	return out
}

// pickCourseAndTeacher walks the room's own catalogue in a deterministic random
// order and returns the first (course, teacher) pair that is free.
func (g *generator) pickCourseAndTeacher(weekday, slot, span int, room domain.Room, parity domain.Parity) (string, string) {
	catalogue := append([]string(nil), g.catalogueOf[room.Code]...)
	if len(catalogue) == 0 {
		return "", ""
	}
	g.rng.Shuffle(len(catalogue), func(i, j int) { catalogue[i], catalogue[j] = catalogue[j], catalogue[i] })

	for _, courseCode := range catalogue {
		staff := append([]string(nil), g.staffOf[courseCode]...)
		g.rng.Shuffle(len(staff), func(i, j int) { staff[i], staff[j] = staff[j], staff[i] })
		for _, name := range staff {
			if !g.freeOver(g.teacherBusy, weekday, slot, span, name, parity) {
				continue
			}
			if !underLoad(g.teacherLoad, weekday, name, parity, maxTeacherSlotsPerDay) {
				continue
			}
			return courseCode, name
		}
	}
	return "", ""
}

// freeOver reports whether a key is free in every slot the lesson spans.
func (g *generator) freeOver(busy map[string][]domain.Parity, weekday, slot, span int, key string, parity domain.Parity) bool {
	for i := 0; i < span; i++ {
		if !free(busy[cell(weekday, slot+i, key)], parity) {
			return false
		}
	}
	return true
}

// ------------------------------------------------------------- overrides --

// buildOverrides writes the scripted per-day changes: two cancellations, one
// move and one delay for every weekday of the semester week containing the seed
// run date and of the week after it. Tuesdays carry the three the fixed-clock
// demo moment needs.
func (ds *Dataset) buildOverrides(g *generator, today domain.Date, rng *rand.Rand) error {
	lessonByKey := map[string]*Lesson{}
	for i := range ds.Lessons {
		lessonByKey[ds.Lessons[i].ID.String()] = &ds.Lessons[i]
	}

	heroCancel := ID("lesson", heroCancelKey)
	heroMove := ID("lesson", heroMoveKey)
	heroDelay := ID("lesson", heroDelayKey)
	destination, ok := g.roomByCode[heroMoveDestination]
	if !ok {
		return fmt.Errorf("seed: room %s is missing from the map data", heroMoveDestination)
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
				// The three the fixed-clock demo moment shows, on every
				// Tuesday of the window.
				if l, ok := lessonByKey[heroCancel.String()]; ok {
					add(domain.OverrideCancel, l, func(o *Override) { o.Note = heroCancelNote })
					cancels++
				}
				if l, ok := lessonByKey[heroMove.String()]; ok {
					add(domain.OverrideMove, l, func(o *Override) {
						id := destination.ID
						o.NewRoomID = &id
						o.Note = heroMoveNote
					})
				}
				if l, ok := lessonByKey[heroDelay.String()]; ok {
					add(domain.OverrideDelay, l, func(o *Override) {
						d := heroDelayMinutes
						o.DelayMinutes = &d
						o.Note = heroDelayNote
					})
				}
			}

			pick := func() *Lesson {
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
				add(domain.OverrideCancel, l, func(o *Override) { o.Note = genericCancelNote })
				cancels++
			}

			if weekday != 2 {
				// A move needs a free room of the same kind; try a handful of
				// candidates so every weekday really carries one.
				for attempt := 0; attempt < 8; attempt++ {
					l := pick()
					if l == nil {
						break
					}
					dest := g.freeRoomFor(l, weekday, parity)
					if dest == nil {
						// Mark it used so the next attempt picks another one.
						used[l.ID] = true
						continue
					}
					add(domain.OverrideMove, l, func(o *Override) {
						id := dest.ID
						o.NewRoomID = &id
						o.Note = genericMoveNote
					})
					break
				}
				if l := pick(); l != nil {
					add(domain.OverrideDelay, l, func(o *Override) {
						d := []int{10, 15, 20}[rng.Intn(3)]
						o.DelayMinutes = &d
						o.Note = genericDelayedNote
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
// lesson's slots, so a move never manufactures a conflict.
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
