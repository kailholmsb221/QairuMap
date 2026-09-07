// Package repo is the only place that talks to PostgreSQL. It owns the pgx
// pool, wraps the sqlc-generated queries and hands the rest of the service
// plain domain values.
package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
	"github.com/kailholmes/campuslive/services/api/internal/repo/gen"
)

// ErrNotFound is returned when a lookup by code or id matches nothing.
var ErrNotFound = errors.New("not found")

// Repo is the database-backed store.
type Repo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

// Pool exposes the underlying pool for the seeder's transaction handling.
func (r *Repo) Pool() *pgxpool.Pool { return r.pool }

// Queries exposes the generated queries for the seeder.
func (r *Repo) Queries() *gen.Queries { return r.q }

// New opens a pool against databaseURL and verifies it answers.
func New(ctx context.Context, databaseURL string) (*Repo, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("repo: parse DATABASE_URL: %w", err)
	}
	cfg.MaxConns = 10
	cfg.MaxConnLifetime = time.Hour

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("repo: connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("repo: ping: %w", err)
	}
	return &Repo{pool: pool, q: gen.New(pool)}, nil
}

// Close releases the pool.
func (r *Repo) Close() {
	if r.pool != nil {
		r.pool.Close()
	}
}

// Ping reports whether the database is reachable; it backs `/readyz`.
func (r *Repo) Ping(ctx context.Context) error { return r.pool.Ping(ctx) }

// ---------------------------------------------------------------- buildings --

// ListBuildings returns every building, ordered by code.
func (r *Repo) ListBuildings(ctx context.Context) ([]domain.Building, error) {
	rows, err := r.q.ListBuildings(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Building, 0, len(rows))
	for _, row := range rows {
		b, err := buildingOf(toUUID(row.ID), row.Code, row.Name, row.Timezone, int(row.FloorCount))
		if err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, nil
}

// GetBuilding looks a building up by its code.
func (r *Repo) GetBuilding(ctx context.Context, code string) (domain.Building, error) {
	row, err := r.q.GetBuildingByCode(ctx, code)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Building{}, fmt.Errorf("building %q: %w", code, ErrNotFound)
	}
	if err != nil {
		return domain.Building{}, err
	}
	return buildingOf(toUUID(row.ID), row.Code, row.Name, row.Timezone, int(row.FloorCount))
}

func buildingOf(id uuid.UUID, code, name, tz string, floors int) (domain.Building, error) {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return domain.Building{}, fmt.Errorf("repo: unknown time zone %q for building %s: %w", tz, code, err)
	}
	return domain.Building{ID: id, Code: code, Name: name, Timezone: tz, Location: loc, Floors: floors}, nil
}

// ListFloors returns the floor plates of a building, ordered by number.
func (r *Repo) ListFloors(ctx context.Context, buildingID uuid.UUID) ([]domain.Floor, error) {
	rows, err := r.q.ListFloors(ctx, pgUUID(buildingID))
	if err != nil {
		return nil, err
	}
	out := make([]domain.Floor, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.Floor{ID: toUUID(row.ID), Number: int(row.Number), PlanKey: row.PlanKey})
	}
	return out, nil
}

// ListRooms returns every space of a building, ordered by floor then code.
func (r *Repo) ListRooms(ctx context.Context, buildingID uuid.UUID) ([]domain.Room, error) {
	rows, err := r.q.ListRoomsByBuilding(ctx, pgUUID(buildingID))
	if err != nil {
		return nil, err
	}
	out := make([]domain.Room, 0, len(rows))
	for _, row := range rows {
		room, err := roomOf(row.ID, row.Code, row.Name, row.Type, row.Wing, row.Schedulable, row.Capacity, row.Geometry, row.FloorNumber, row.FloorID)
		if err != nil {
			return nil, err
		}
		out = append(out, room)
	}
	return out, nil
}

// GetRoom looks a room up by its code.
func (r *Repo) GetRoom(ctx context.Context, code string) (domain.Room, error) {
	row, err := r.q.GetRoomByCode(ctx, code)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Room{}, fmt.Errorf("room %q: %w", code, ErrNotFound)
	}
	if err != nil {
		return domain.Room{}, err
	}
	return roomOf(row.ID, row.Code, row.Name, row.Type, row.Wing, row.Schedulable, row.Capacity, row.Geometry, row.FloorNumber, row.FloorID)
}

func roomOf(id pgtype.UUID, code, name string, typ gen.RoomType, wing gen.Wing, schedulable bool, capacity *int32, geometry []byte, floor int32, floorID pgtype.UUID) (domain.Room, error) {
	var g domain.Geometry
	if len(geometry) > 0 {
		if err := json.Unmarshal(geometry, &g); err != nil {
			return domain.Room{}, fmt.Errorf("repo: room %s geometry: %w", code, err)
		}
	}
	return domain.Room{
		ID:          toUUID(id),
		Code:        code,
		Name:        name,
		Type:        domain.RoomType(typ),
		Wing:        domain.Wing(wing),
		Schedulable: schedulable,
		Capacity:    toIntPtr(capacity),
		Floor:       int(floor),
		FloorID:     toUUID(floorID),
		Geometry:    g,
	}, nil
}

// ListTimeSlots returns the lesson slots of a building, ordered by index.
func (r *Repo) ListTimeSlots(ctx context.Context, buildingID uuid.UUID) ([]domain.TimeSlot, error) {
	rows, err := r.q.ListTimeSlots(ctx, pgUUID(buildingID))
	if err != nil {
		return nil, err
	}
	out := make([]domain.TimeSlot, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.TimeSlot{
			ID:       toUUID(row.ID),
			Idx:      int(row.Idx),
			StartsAt: toTimeOfDay(row.StartsAt),
			EndsAt:   toTimeOfDay(row.EndsAt),
		})
	}
	return out, nil
}

// GetTimeSlot looks a slot up by its 1-based index within a building.
func (r *Repo) GetTimeSlot(ctx context.Context, buildingID uuid.UUID, idx int) (domain.TimeSlot, error) {
	row, err := r.q.GetTimeSlotByIdx(ctx, gen.GetTimeSlotByIdxParams{
		BuildingID: pgUUID(buildingID),
		Idx:        int16(idx), //nolint:gosec // slot indexes are 1..10
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.TimeSlot{}, fmt.Errorf("slot %d: %w", idx, ErrNotFound)
	}
	if err != nil {
		return domain.TimeSlot{}, err
	}
	return domain.TimeSlot{
		ID:       toUUID(row.ID),
		Idx:      int(row.Idx),
		StartsAt: toTimeOfDay(row.StartsAt),
		EndsAt:   toTimeOfDay(row.EndsAt),
	}, nil
}

// SemesterForDate returns the semester containing date, falling back to the
// closest one so a `?date=` outside the term still yields a week number.
func (r *Repo) SemesterForDate(ctx context.Context, date domain.Date) (domain.Semester, error) {
	row, err := r.q.GetSemesterByDate(ctx, pgDate(date))
	if errors.Is(err, pgx.ErrNoRows) {
		row, err = r.q.GetClosestSemester(ctx, pgDate(date))
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Semester{}, fmt.Errorf("semester for %s: %w", date, ErrNotFound)
		}
	}
	if err != nil {
		return domain.Semester{}, err
	}
	return domain.Semester{
		ID:          toUUID(row.ID),
		Name:        row.Name,
		StartsOn:    toDate(row.StartsOn),
		EndsOn:      toDate(row.EndsOn),
		Week1Parity: domain.Parity(row.Week1Parity),
	}, nil
}

// ----------------------------------------------------------------- schedule --

// ListLessons returns every template that could run on one weekday. Parity
// filtering is the engine's job.
func (r *Repo) ListLessons(ctx context.Context, semesterID, buildingID uuid.UUID, weekday int) ([]domain.Lesson, error) {
	rows, err := r.q.ListLessonsForWeekday(ctx, gen.ListLessonsForWeekdayParams{
		SemesterID: pgUUID(semesterID),
		BuildingID: pgUUID(buildingID),
		Weekday:    int16(weekday), //nolint:gosec // 1..7
	})
	if err != nil {
		return nil, err
	}
	out := make([]domain.Lesson, 0, len(rows))
	for _, row := range rows {
		room, err := roomOf(row.RoomID, row.RoomCode, row.RoomName, row.RoomType, row.RoomWing,
			row.RoomSchedulable, row.RoomCapacity, row.RoomGeometry, row.RoomFloor, pgtype.UUID{})
		if err != nil {
			return nil, err
		}
		out = append(out, domain.Lesson{
			ID:      toUUID(row.ID),
			Course:  domain.Course{ID: toUUID(row.CourseID), Code: row.CourseCode, Title: row.CourseTitle, Department: str(row.CourseDepartment)},
			Teacher: domain.Teacher{ID: toUUID(row.TeacherID), FullName: row.TeacherFullName, ShortName: row.TeacherShortName, Department: str(row.TeacherDepartment)},
			Room:    room,
			Slot: domain.TimeSlot{
				ID:       toUUID(row.SlotID),
				Idx:      int(row.SlotIdx),
				StartsAt: toTimeOfDay(row.SlotStartsAt),
				EndsAt:   toTimeOfDay(row.SlotEndsAt),
			},
			SlotSpan: int(row.SlotSpan),
			Weekday:  int(row.Weekday),
			Parity:   domain.Parity(row.Parity),
			Type:     domain.LessonType(row.Type),
			Groups:   row.GroupCodes,
		})
	}
	return out, nil
}

// ListOverrides returns the point changes recorded for one local date.
func (r *Repo) ListOverrides(ctx context.Context, buildingID uuid.UUID, date domain.Date) ([]domain.Override, error) {
	rows, err := r.q.ListOverridesForDate(ctx, gen.ListOverridesForDateParams{
		Date:       pgDate(date),
		BuildingID: pgUUID(buildingID),
	})
	if err != nil {
		return nil, err
	}

	out := make([]domain.Override, 0, len(rows))
	for _, row := range rows {
		ov := domain.Override{
			ID:           toUUID(row.ID),
			LessonID:     toUUIDPtr(row.LessonID),
			Date:         toDate(row.Date),
			Kind:         domain.OverrideKind(row.Kind),
			DelayMinutes: toIntPtr(row.DelayMinutes),
			Groups:       row.GroupCodes,
			Note:         str(row.Note),
			CreatedAt:    toTime(row.CreatedAt),
		}
		if row.NewRoomID.Valid {
			room, err := roomOf(row.NewRoomID, str(row.NewRoomCode), str(row.NewRoomName),
				row.NewRoomType.RoomType, row.NewRoomWing.Wing,
				row.NewRoomSchedulable != nil && *row.NewRoomSchedulable,
				row.NewRoomCapacity, row.NewRoomGeometry, int32(toInt(row.NewRoomFloor)), pgtype.UUID{})
			if err != nil {
				return nil, err
			}
			ov.NewRoom = &room
		}
		if row.NewTeacherID.Valid {
			ov.NewTeacher = &domain.Teacher{
				ID:         toUUID(row.NewTeacherID),
				FullName:   str(row.NewTeacherFullName),
				ShortName:  str(row.NewTeacherShortName),
				Department: str(row.NewTeacherDepartment),
			}
		}
		if row.CourseID.Valid {
			ov.Course = &domain.Course{ID: toUUID(row.CourseID), Code: str(row.CourseCode), Title: str(row.CourseTitle)}
		}
		if row.SlotID.Valid {
			ov.Slot = &domain.TimeSlot{
				ID:       toUUID(row.SlotID),
				Idx:      toInt16(row.SlotIdx),
				StartsAt: toTimeOfDay(row.SlotStartsAt),
				EndsAt:   toTimeOfDay(row.SlotEndsAt),
			}
		}
		out = append(out, ov)
	}
	return out, nil
}

// -------------------------------------------------------------------- admin --

// OverrideRecord is a stored override as the admin API reports it back.
type OverrideRecord struct {
	ID           uuid.UUID
	LessonID     *uuid.UUID
	Date         domain.Date
	Kind         domain.OverrideKind
	NewRoomCode  string
	NewTeacherID *uuid.UUID
	DelayMinutes *int
	CourseCode   string
	RoomCode     string
	SlotIdx      *int
	Note         string
	CreatedAt    time.Time
}

// InsertOverrideParams is the write side of an override.
type InsertOverrideParams struct {
	LessonID     *uuid.UUID
	Date         domain.Date
	Kind         domain.OverrideKind
	NewRoomID    *uuid.UUID
	NewTeacherID *uuid.UUID
	DelayMinutes *int
	CourseID     *uuid.UUID
	SlotID       *uuid.UUID
	Note         string
	GroupCodes   []string
}

// InsertOverride stores an override and its `extra` group list.
func (r *Repo) InsertOverride(ctx context.Context, p InsertOverrideParams) (uuid.UUID, error) {
	row, err := r.q.InsertOverride(ctx, gen.InsertOverrideParams{
		LessonID:     pgUUIDPtr(p.LessonID),
		Date:         pgDate(p.Date),
		Kind:         gen.OverrideKind(p.Kind),
		NewRoomID:    pgUUIDPtr(p.NewRoomID),
		NewTeacherID: pgUUIDPtr(p.NewTeacherID),
		DelayMinutes: pgInt32Ptr(p.DelayMinutes),
		CourseID:     pgUUIDPtr(p.CourseID),
		SlotID:       pgUUIDPtr(p.SlotID),
		Note:         pgText(p.Note),
	})
	if err != nil {
		return uuid.Nil, err
	}
	id := toUUID(row.ID)
	if len(p.GroupCodes) > 0 {
		if err := r.q.InsertOverrideGroups(ctx, gen.InsertOverrideGroupsParams{
			OverrideID: row.ID,
			Codes:      p.GroupCodes,
		}); err != nil {
			return uuid.Nil, err
		}
	}
	return id, nil
}

// GetOverride reads back a stored override.
func (r *Repo) GetOverride(ctx context.Context, id uuid.UUID) (OverrideRecord, error) {
	row, err := r.q.GetOverride(ctx, pgUUID(id))
	if errors.Is(err, pgx.ErrNoRows) {
		return OverrideRecord{}, fmt.Errorf("override %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return OverrideRecord{}, err
	}
	rec := OverrideRecord{
		ID:           toUUID(row.ID),
		LessonID:     toUUIDPtr(row.LessonID),
		Date:         toDate(row.Date),
		Kind:         domain.OverrideKind(row.Kind),
		NewRoomCode:  str(row.NewRoomCode),
		NewTeacherID: toUUIDPtr(row.NewTeacherID),
		DelayMinutes: toIntPtr(row.DelayMinutes),
		CourseCode:   str(row.CourseCode),
		RoomCode:     str(row.RoomCode),
		Note:         str(row.Note),
		CreatedAt:    toTime(row.CreatedAt),
	}
	if row.SlotIdx != nil {
		idx := int(*row.SlotIdx)
		rec.SlotIdx = &idx
	}
	return rec, nil
}

// DeleteOverride removes an override; it reports ErrNotFound when nothing matched.
func (r *Repo) DeleteOverride(ctx context.Context, id uuid.UUID) error {
	n, err := r.q.DeleteOverride(ctx, pgUUID(id))
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("override %s: %w", id, ErrNotFound)
	}
	return nil
}

// LessonExists reports whether a lesson template with this id is stored.
func (r *Repo) LessonExists(ctx context.Context, id uuid.UUID) (bool, error) {
	return r.q.LessonExists(ctx, pgUUID(id))
}

// ListAnnouncements returns the ticker lines whose window contains `at`.
func (r *Repo) ListAnnouncements(ctx context.Context, buildingCode string, at time.Time) ([]domain.Announcement, error) {
	rows, err := r.q.ListAnnouncements(ctx, gen.ListAnnouncementsParams{
		BuildingCode: buildingCode,
		At:           pgTimestamptz(at),
	})
	if err != nil {
		return nil, err
	}
	out := make([]domain.Announcement, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.Announcement{
			ID:       toUUID(row.ID),
			Building: row.BuildingCode,
			Text:     row.Text,
			Severity: domain.Severity(row.Severity),
			StartsAt: toTime(row.StartsAt),
			EndsAt:   toTime(row.EndsAt),
		})
	}
	return out, nil
}

// InsertAnnouncement stores a ticker line for a building.
func (r *Repo) InsertAnnouncement(ctx context.Context, a domain.Announcement) (domain.Announcement, error) {
	row, err := r.q.InsertAnnouncement(ctx, gen.InsertAnnouncementParams{
		BuildingCode: a.Building,
		Text:         a.Text,
		Severity:     string(a.Severity),
		StartsAt:     pgTimestamptz(a.StartsAt),
		EndsAt:       pgTimestamptz(a.EndsAt),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Announcement{}, fmt.Errorf("building %q: %w", a.Building, ErrNotFound)
	}
	if err != nil {
		return domain.Announcement{}, err
	}
	a.ID = toUUID(row.ID)
	a.StartsAt = toTime(row.StartsAt)
	a.EndsAt = toTime(row.EndsAt)
	return a, nil
}

// ------------------------------------------------------------------ lookups --

// GetTeacher looks a teacher up by id.
func (r *Repo) GetTeacher(ctx context.Context, id uuid.UUID) (domain.Teacher, error) {
	row, err := r.q.GetTeacherByID(ctx, pgUUID(id))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Teacher{}, fmt.Errorf("teacher %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return domain.Teacher{}, err
	}
	return domain.Teacher{ID: toUUID(row.ID), FullName: row.FullName, ShortName: row.ShortName, Department: str(row.Department)}, nil
}

// GetGroup looks a student group up by code.
func (r *Repo) GetGroup(ctx context.Context, code string) (domain.Group, error) {
	row, err := r.q.GetGroupByCode(ctx, code)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Group{}, fmt.Errorf("group %q: %w", code, ErrNotFound)
	}
	if err != nil {
		return domain.Group{}, err
	}
	return domain.Group{ID: toUUID(row.ID), Code: row.Code, Program: str(row.Program), CourseYear: toInt16(row.CourseYear)}, nil
}

// GetCourse looks a course up by code.
func (r *Repo) GetCourse(ctx context.Context, code string) (domain.Course, error) {
	row, err := r.q.GetCourseByCode(ctx, code)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Course{}, fmt.Errorf("course %q: %w", code, ErrNotFound)
	}
	if err != nil {
		return domain.Course{}, err
	}
	return domain.Course{ID: toUUID(row.ID), Code: row.Code, Title: row.Title, Department: str(row.Department)}, nil
}

// ------------------------------------------------------------------- search --

// SearchResult holds up to `limit` hits per kind.
type SearchResult struct {
	Teachers []domain.Teacher
	Groups   []domain.Group
	Rooms    []domain.Room
	Courses  []domain.Course
}

// Search runs the unified case-insensitive search over all four kinds.
func (r *Repo) Search(ctx context.Context, q string, limit int) (SearchResult, error) {
	lim := int32(limit) //nolint:gosec // bounded by the contract to 1..25
	out := SearchResult{
		Teachers: []domain.Teacher{},
		Groups:   []domain.Group{},
		Rooms:    []domain.Room{},
		Courses:  []domain.Course{},
	}

	teachers, err := r.q.SearchTeachers(ctx, gen.SearchTeachersParams{Q: &q, Lim: lim})
	if err != nil {
		return out, err
	}
	for _, row := range teachers {
		out.Teachers = append(out.Teachers, domain.Teacher{
			ID: toUUID(row.ID), FullName: row.FullName, ShortName: row.ShortName, Department: str(row.Department),
		})
	}

	groups, err := r.q.SearchGroups(ctx, gen.SearchGroupsParams{Q: &q, Lim: lim})
	if err != nil {
		return out, err
	}
	for _, row := range groups {
		out.Groups = append(out.Groups, domain.Group{
			ID: toUUID(row.ID), Code: row.Code, Program: str(row.Program), CourseYear: toInt16(row.CourseYear),
		})
	}

	rooms, err := r.q.SearchRooms(ctx, gen.SearchRoomsParams{Q: &q, Lim: lim})
	if err != nil {
		return out, err
	}
	for _, row := range rooms {
		out.Rooms = append(out.Rooms, domain.Room{
			ID: toUUID(row.ID), Code: row.Code, Name: row.Name,
			Type: domain.RoomType(row.Type), Floor: int(row.FloorNumber),
		})
	}

	courses, err := r.q.SearchCourses(ctx, gen.SearchCoursesParams{Q: &q, Lim: lim})
	if err != nil {
		return out, err
	}
	for _, row := range courses {
		out.Courses = append(out.Courses, domain.Course{ID: toUUID(row.ID), Code: row.Code, Title: row.Title})
	}

	return out, nil
}

// Counts returns the row counts the seeder prints when it finishes.
func (r *Repo) Counts(ctx context.Context) (rooms, lessons int, err error) {
	rc, err := r.q.CountRooms(ctx)
	if err != nil {
		return 0, 0, err
	}
	lc, err := r.q.CountLessons(ctx)
	if err != nil {
		return 0, 0, err
	}
	return int(rc), int(lc), nil
}
