package httpapi

import (
	"time"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
	"github.com/kailholmes/campuslive/services/api/internal/engine"
	"github.com/kailholmes/campuslive/services/api/internal/mapspec"
	"github.com/kailholmes/campuslive/services/api/internal/repo"
)

// This file is the only place the domain is translated into the generated
// contract types. Nothing here decides anything: the engine already did.

func teacherRef(t domain.Teacher) TeacherRef {
	ref := TeacherRef{Id: t.ID, ShortName: t.ShortName}
	if t.FullName != "" {
		full := t.FullName
		ref.FullName = &full
	}
	if t.Department != "" {
		dept := t.Department
		ref.Department = &dept
	}
	return ref
}

// sessionView renders one materialised session as the board shows it. The phase
// is computed by the engine for the instant the caller asked about.
func sessionView(s domain.Session, at time.Time, th engine.Thresholds) SessionView {
	groups := s.Groups
	if groups == nil {
		groups = []string{}
	}
	v := SessionView{
		SessionId:   s.ID,
		CourseCode:  s.Course.Code,
		CourseTitle: s.Course.Title,
		LessonType:  LessonType(s.Type),
		Teacher:     teacherRef(s.Teacher),
		Groups:      groups,
		RoomId:      s.Room.ID,
		RoomCode:    s.Room.Code,
		Floor:       int32(s.Room.Floor), //nolint:gosec // 1..4
		StartAt:     s.StartAt.UTC(),
		EndAt:       s.EndAt.UTC(),
		Status:      SessionStatus(s.Status),
		Phase:       Phase(engine.PhaseOf(s, at, th)),
		Conflict:    s.Conflict,
	}
	if s.LessonID != nil {
		id := *s.LessonID
		v.LessonId = &id
	}
	if s.MovedFromRoomCode != "" {
		code := s.MovedFromRoomCode
		v.MovedFromRoomCode = &code
	}
	if s.DelayMinutes != nil {
		m := int32(*s.DelayMinutes) //nolint:gosec // minutes
		v.DelayMinutes = &m
	}
	if s.Note != "" {
		note := s.Note
		v.Note = &note
	}
	return v
}

func sessionViews(sessions []domain.Session, at time.Time, th engine.Thresholds) []SessionView {
	out := make([]SessionView, 0, len(sessions))
	for _, s := range sessions {
		out = append(out, sessionView(s, at, th))
	}
	return out
}

func roomLiveState(r domain.RoomState, at time.Time, th engine.Thresholds) RoomLiveState {
	state := RoomLiveState{
		RoomId:   r.Room.ID,
		RoomCode: r.Room.Code,
		Floor:    int32(r.Room.Floor), //nolint:gosec // 1..4
		Phase:    RoomPhase(r.Phase),
	}
	if r.Current != nil {
		v := sessionView(*r.Current, at, th)
		state.Current = &v
	}
	if r.Next != nil {
		v := sessionView(*r.Next, at, th)
		state.Next = &v
	}
	if r.FreeUntil != nil {
		t := r.FreeUntil.UTC()
		state.FreeUntil = &t
	}
	return state
}

func snapshotDTO(s domain.Snapshot, th engine.Thresholds) Snapshot {
	rooms := make([]RoomLiveState, 0, len(s.Rooms))
	for _, r := range s.Rooms {
		rooms = append(rooms, roomLiveState(r, s.At, th))
	}
	out := Snapshot{
		Building:   s.Building,
		At:         s.At.UTC(),
		Date:       s.Date.String(),
		WeekNumber: int32(s.WeekNumber), //nolint:gosec // small
		WeekParity: WeekParity(s.WeekParity),
		Stats: Stats{
			RoomsTotal:    int32(s.Stats.RoomsTotal),    //nolint:gosec // small
			RoomsBusy:     int32(s.Stats.RoomsBusy),     //nolint:gosec // small
			SessionsToday: int32(s.Stats.SessionsToday), //nolint:gosec // small
			SessionsDone:  int32(s.Stats.SessionsDone),  //nolint:gosec // small
		},
		Rooms: rooms,
		Now:   sessionViews(s.Now, s.At, th),
		Next:  sessionViews(s.Next, s.At, th),
	}
	if s.NextTransitionAt != nil {
		t := s.NextTransitionAt.UTC()
		out.NextTransitionAt = &t
	}
	return out
}

func announcementDTO(a domain.Announcement) Announcement {
	return Announcement{
		Id:       a.ID,
		Building: a.Building,
		Text:     a.Text,
		Severity: Severity(a.Severity),
		StartsAt: a.StartsAt.UTC(),
		EndsAt:   a.EndsAt.UTC(),
	}
}

func overrideDTO(r repo.OverrideRecord) Override {
	out := Override{
		Id:        r.ID,
		Date:      r.Date.String(),
		Kind:      OverrideKind(r.Kind),
		CreatedAt: r.CreatedAt.UTC(),
	}
	if r.LessonID != nil {
		id := *r.LessonID
		out.LessonId = &id
	}
	if r.NewRoomCode != "" && r.Kind != domain.OverrideExtra {
		code := r.NewRoomCode
		out.NewRoomCode = &code
	}
	if r.NewTeacherID != nil {
		id := *r.NewTeacherID
		out.NewTeacherId = &id
	}
	if r.DelayMinutes != nil {
		m := int32(*r.DelayMinutes) //nolint:gosec // minutes
		out.DelayMinutes = &m
	}
	if r.CourseCode != "" {
		code := r.CourseCode
		out.CourseCode = &code
	}
	if r.RoomCode != "" {
		code := r.RoomCode
		out.RoomCode = &code
	}
	if r.SlotIdx != nil {
		idx := int32(*r.SlotIdx) //nolint:gosec // 1..10
		out.SlotIdx = &idx
	}
	if r.Note != "" {
		note := r.Note
		out.Note = &note
	}
	return out
}

func searchResultDTO(res repo.SearchResult) SearchResult {
	out := SearchResult{
		Teachers: make([]SearchTeacher, 0, len(res.Teachers)),
		Groups:   make([]SearchGroup, 0, len(res.Groups)),
		Rooms:    make([]SearchRoom, 0, len(res.Rooms)),
		Courses:  make([]SearchCourse, 0, len(res.Courses)),
	}
	for _, t := range res.Teachers {
		hit := SearchTeacher{Id: t.ID, ShortName: t.ShortName}
		if t.FullName != "" {
			full := t.FullName
			hit.FullName = &full
		}
		if t.Department != "" {
			dept := t.Department
			hit.Department = &dept
		}
		out.Teachers = append(out.Teachers, hit)
	}
	for _, g := range res.Groups {
		hit := SearchGroup{Id: g.ID, Code: g.Code}
		if g.Program != "" {
			p := g.Program
			hit.Program = &p
		}
		if g.CourseYear != 0 {
			y := int32(g.CourseYear) //nolint:gosec // 1..6
			hit.CourseYear = &y
		}
		out.Groups = append(out.Groups, hit)
	}
	for _, r := range res.Rooms {
		out.Rooms = append(out.Rooms, SearchRoom{
			Id: r.ID, Code: r.Code, Name: r.Name,
			Floor: int32(r.Floor), //nolint:gosec // 1..4
			Type:  RoomType(r.Type),
		})
	}
	for _, c := range res.Courses {
		out.Courses = append(out.Courses, SearchCourse{Id: c.ID, Code: c.Code, Title: c.Title})
	}
	return out
}

func buildingDTO(b domain.Building) Building {
	return Building{
		Code:     b.Code,
		Name:     b.Name,
		Timezone: b.Timezone,
		Floors:   int32(b.Floors), //nolint:gosec // small
	}
}

// mapSpecDTO assembles the MapSpec the contract describes.
//
// The floor-level geometry (outline, zones, corridors, cores, landmarks,
// entrances, atrium) comes straight from packages/map-data/building-a.json —
// the source of truth CLAUDE.md names — while every room's attributes and
// geometry come from the `rooms` table the seed filled from that same file. The
// rooms are emitted in the file's own order so that the payload stays
// interchangeable with building-a.json itself.
func mapSpecDTO(spec *mapspec.Spec, rooms []domain.Room) MapSpec {
	byCode := make(map[string]domain.Room, len(rooms))
	for _, r := range rooms {
		byCode[r.Code] = r
	}

	out := MapSpec{
		Building: spec.Building,
		Name:     spec.Name,
		Timezone: spec.Timezone,
		ViewBox:  make([]float32, 0, len(spec.ViewBox)),
		Floors:   make([]MapFloor, 0, len(spec.Floors)),
	}
	for _, v := range spec.ViewBox {
		out.ViewBox = append(out.ViewBox, float32(v))
	}

	for _, f := range spec.Floors {
		floor := MapFloor{
			Number:    int32(f.Number), //nolint:gosec // 1..4
			PlanKey:   f.PlanKey,
			Outline:   f.Outline,
			Zones:     zonesDTO(f.Zones),
			Corridors: zonesDTO(f.Corridors),
			Rooms:     make([]MapRoom, 0, len(f.Rooms)),
			Cores:     make([]MapCore, 0, len(f.Cores)),
			Landmarks: make([]MapLandmark, 0, len(f.Landmarks)),
			Entrances: make([]MapEntrance, 0, len(f.Entrances)),
		}
		if f.Atrium != nil {
			atrium := *f.Atrium
			floor.Atrium = &atrium
		}

		for _, specRoom := range f.Rooms {
			room, ok := byCode[specRoom.Code]
			if !ok {
				// The database has no such room (the seed never ran for it);
				// fall back to the file so the map still renders.
				floor.Rooms = append(floor.Rooms, mapRoomFromSpec(specRoom))
				continue
			}
			floor.Rooms = append(floor.Rooms, mapRoomFromDB(room))
		}

		for _, c := range f.Cores {
			floor.Cores = append(floor.Cores, MapCore{
				Id:    MapCoreId(c.ID),
				Code:  c.Code,
				Name:  c.Name,
				Path:  c.Path,
				Bbox:  bboxDTO(c.BBox),
				Label: pointDTO(c.Label),
			})
		}
		for _, l := range f.Landmarks {
			floor.Landmarks = append(floor.Landmarks, MapLandmark{
				Kind: l.Kind, Id: l.ID, X: float32(l.X), Y: float32(l.Y),
			})
		}
		for _, e := range f.Entrances {
			floor.Entrances = append(floor.Entrances, MapEntrance{
				Id: e.ID, X: float32(e.X), Y: float32(e.Y), Main: e.Main, Path: e.Path,
			})
		}
		out.Floors = append(out.Floors, floor)
	}
	return out
}

func mapRoomFromDB(r domain.Room) MapRoom {
	room := MapRoom{
		Id:          r.ID,
		Code:        r.Code,
		Name:        r.Name,
		Type:        RoomType(r.Type),
		Wing:        Wing(r.Wing),
		Schedulable: r.Schedulable,
		Path:        r.Geometry.Path,
		Bbox: BBox{
			X: float32(r.Geometry.BBox.X), Y: float32(r.Geometry.BBox.Y),
			W: float32(r.Geometry.BBox.W), H: float32(r.Geometry.BBox.H),
		},
		Label: Point{X: float32(r.Geometry.Label.X), Y: float32(r.Geometry.Label.Y)},
	}
	if r.Capacity != nil {
		c := int32(*r.Capacity) //nolint:gosec // seats
		room.Capacity = &c
	}
	return room
}

func mapRoomFromSpec(r mapspec.Room) MapRoom {
	room := MapRoom{
		Code:        r.Code,
		Name:        r.Name,
		Type:        RoomType(r.Type),
		Wing:        Wing(r.Wing),
		Schedulable: r.Schedulable,
		Path:        r.Path,
		Bbox:        bboxDTO(r.BBox),
		Label:       pointDTO(r.Label),
	}
	if id, err := parseUUID(r.ID); err == nil {
		room.Id = id
	}
	if r.Capacity != nil {
		c := int32(*r.Capacity) //nolint:gosec // seats
		room.Capacity = &c
	}
	return room
}

func zonesDTO(in []mapspec.Zone) []MapZone {
	out := make([]MapZone, 0, len(in))
	for _, z := range in {
		out = append(out, MapZone{Id: z.ID, Path: z.Path})
	}
	return out
}

func bboxDTO(b mapspec.BBox) BBox {
	return BBox{X: float32(b.X), Y: float32(b.Y), W: float32(b.W), H: float32(b.H)}
}

func pointDTO(p mapspec.Point) Point {
	return Point{X: float32(p.X), Y: float32(p.Y)}
}
