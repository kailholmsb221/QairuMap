package seed

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

// Report says what a seed run wrote.
type Report struct {
	Skipped       bool
	Buildings     int
	Floors        int
	Rooms         int
	Teachers      int
	Groups        int
	Courses       int
	Slots         int
	Lessons       int
	LessonGroups  int
	Overrides     int
	Announcements int
}

// Write persists a dataset.
//
// With reset it truncates every table first. Without it, an already-seeded
// database is left untouched and Report.Skipped is set — that is what makes
// SEED_ON_START safe to leave on.
func Write(ctx context.Context, pool *pgxpool.Pool, ds *Dataset, reset bool) (Report, error) {
	var rep Report

	if !reset {
		seeded, err := alreadySeeded(ctx, pool, ds.Building.Code)
		if err != nil {
			return rep, err
		}
		if seeded {
			rep.Skipped = true
			return rep, nil
		}
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return rep, fmt.Errorf("seed: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := gen.New(tx)

	if reset {
		if err := q.TruncateAll(ctx); err != nil {
			return rep, fmt.Errorf("seed: truncate: %w", err)
		}
	}

	if _, err := q.InsertBuilding(ctx, gen.InsertBuildingParams{
		ID:       pgUUID(ds.Building.ID),
		Code:     ds.Building.Code,
		Name:     ds.Building.Name,
		Timezone: ds.Building.Timezone,
	}); err != nil {
		return rep, fmt.Errorf("seed: building: %w", err)
	}
	rep.Buildings = 1

	// ---- floors ----
	floors := make([]gen.InsertFloorParams, 0, len(ds.Floors))
	for _, f := range ds.Floors {
		floors = append(floors, gen.InsertFloorParams{
			ID:         pgUUID(f.ID),
			BuildingID: pgUUID(ds.Building.ID),
			Number:     int32(f.Number), //nolint:gosec // 1..4
			PlanKey:    f.PlanKey,
		})
	}
	if err := collect(q.InsertFloor(ctx, floors).Exec); err != nil {
		return rep, fmt.Errorf("seed: floors: %w", err)
	}
	rep.Floors = len(floors)

	// ---- rooms ----
	rooms := make([]gen.InsertRoomParams, 0, len(ds.Rooms))
	for _, r := range ds.Rooms {
		geometry, err := json.Marshal(r.Geometry)
		if err != nil {
			return rep, fmt.Errorf("seed: room %s geometry: %w", r.Code, err)
		}
		rooms = append(rooms, gen.InsertRoomParams{
			ID:          pgUUID(r.ID),
			FloorID:     pgUUID(r.FloorID),
			Code:        r.Code,
			Name:        r.Name,
			Type:        gen.RoomType(r.Type),
			Wing:        gen.Wing(r.Wing),
			Schedulable: r.Schedulable,
			Capacity:    int32Ptr(r.Capacity),
			Geometry:    geometry,
			Aliases:     r.Aliases,
		})
	}
	if err := collect(q.InsertRoom(ctx, rooms).Exec); err != nil {
		return rep, fmt.Errorf("seed: rooms: %w", err)
	}
	rep.Rooms = len(rooms)

	// ---- people and subjects ----
	teacherRows := make([]gen.InsertTeacherParams, 0, len(ds.Teachers))
	for _, t := range ds.Teachers {
		teacherRows = append(teacherRows, gen.InsertTeacherParams{
			ID: pgUUID(t.ID), FullName: t.FullName, ShortName: t.ShortName, Department: textPtr(t.Department),
		})
	}
	if err := collect(q.InsertTeacher(ctx, teacherRows).Exec); err != nil {
		return rep, fmt.Errorf("seed: teachers: %w", err)
	}
	rep.Teachers = len(teacherRows)

	groupRows := make([]gen.InsertGroupParams, 0, len(ds.Groups))
	for _, g := range ds.Groups {
		year := int16(g.CourseYear) //nolint:gosec // 1..4
		groupRows = append(groupRows, gen.InsertGroupParams{
			ID: pgUUID(g.ID), Code: g.Code, Program: textPtr(g.Program), CourseYear: &year,
		})
	}
	if err := collect(q.InsertGroup(ctx, groupRows).Exec); err != nil {
		return rep, fmt.Errorf("seed: groups: %w", err)
	}
	rep.Groups = len(groupRows)

	courseRows := make([]gen.InsertCourseParams, 0, len(ds.Courses))
	for _, c := range ds.Courses {
		courseRows = append(courseRows, gen.InsertCourseParams{
			ID: pgUUID(c.ID), Code: c.Code, Title: c.Title, Department: textPtr(c.Department),
		})
	}
	if err := collect(q.InsertCourse(ctx, courseRows).Exec); err != nil {
		return rep, fmt.Errorf("seed: courses: %w", err)
	}
	rep.Courses = len(courseRows)

	// ---- slots and semester ----
	slotRows := make([]gen.InsertTimeSlotParams, 0, len(ds.Slots))
	for _, s := range ds.Slots {
		slotRows = append(slotRows, gen.InsertTimeSlotParams{
			ID:         pgUUID(s.ID),
			BuildingID: pgUUID(ds.Building.ID),
			Idx:        int16(s.Idx), //nolint:gosec // 1..10
			StartsAt:   pgTimeOfDay(s.StartsAt),
			EndsAt:     pgTimeOfDay(s.EndsAt),
		})
	}
	if err := collect(q.InsertTimeSlot(ctx, slotRows).Exec); err != nil {
		return rep, fmt.Errorf("seed: time slots: %w", err)
	}
	rep.Slots = len(slotRows)

	if _, err := q.InsertSemester(ctx, gen.InsertSemesterParams{
		ID:          pgUUID(ds.Semester.ID),
		Name:        ds.Semester.Name,
		StartsOn:    pgDate(ds.Semester.StartsOn),
		EndsOn:      pgDate(ds.Semester.EndsOn),
		Week1Parity: string(ds.Semester.Week1Parity),
	}); err != nil {
		return rep, fmt.Errorf("seed: semester: %w", err)
	}

	// ---- lessons ----
	lessonRows := make([]gen.InsertLessonParams, 0, len(ds.Lessons))
	var lessonGroupRows []gen.InsertLessonGroupParams
	for _, l := range ds.Lessons {
		lessonRows = append(lessonRows, gen.InsertLessonParams{
			ID:         pgUUID(l.ID),
			SemesterID: pgUUID(ds.Semester.ID),
			CourseID:   pgUUID(l.CourseID),
			TeacherID:  pgUUID(l.TeacherID),
			RoomID:     pgUUID(l.RoomID),
			SlotID:     pgUUID(l.SlotID),
			Weekday:    int16(l.Weekday), //nolint:gosec // 1..7
			Parity:     gen.WeekParity(l.Parity),
			Type:       gen.LessonType(l.Type),
			SlotSpan:   int16(l.SlotSpan), //nolint:gosec // 1..2
		})
		for _, gid := range l.GroupIDs {
			lessonGroupRows = append(lessonGroupRows, gen.InsertLessonGroupParams{
				LessonID: pgUUID(l.ID), GroupID: pgUUID(gid),
			})
		}
	}
	if err := collect(q.InsertLesson(ctx, lessonRows).Exec); err != nil {
		return rep, fmt.Errorf("seed: lessons: %w", err)
	}
	rep.Lessons = len(lessonRows)

	if err := collect(q.InsertLessonGroup(ctx, lessonGroupRows).Exec); err != nil {
		return rep, fmt.Errorf("seed: lesson groups: %w", err)
	}
	rep.LessonGroups = len(lessonGroupRows)

	// ---- overrides ----
	overrideRows := make([]gen.InsertSeedOverrideParams, 0, len(ds.Overrides))
	for _, o := range ds.Overrides {
		overrideRows = append(overrideRows, gen.InsertSeedOverrideParams{
			ID:           pgUUID(o.ID),
			LessonID:     pgUUIDPtr(o.LessonID),
			Date:         pgDate(o.Date),
			Kind:         gen.OverrideKind(o.Kind),
			NewRoomID:    pgUUIDPtr(o.NewRoomID),
			NewTeacherID: pgUUIDPtr(o.NewTeacherID),
			DelayMinutes: int32Ptr(o.DelayMinutes),
			CourseID:     pgUUIDPtr(o.CourseID),
			SlotID:       pgUUIDPtr(o.SlotID),
			Note:         textPtr(o.Note),
		})
	}
	if err := collect(q.InsertSeedOverride(ctx, overrideRows).Exec); err != nil {
		return rep, fmt.Errorf("seed: overrides: %w", err)
	}
	rep.Overrides = len(overrideRows)

	// ---- announcements ----
	annRows := make([]gen.InsertSeedAnnouncementParams, 0, len(ds.Announcements))
	for _, a := range ds.Announcements {
		annRows = append(annRows, gen.InsertSeedAnnouncementParams{
			ID:         pgUUID(a.ID),
			BuildingID: pgUUID(ds.Building.ID),
			Text:       a.Text,
			Severity:   string(a.Severity),
			StartsAt:   pgTimestamptz(a.StartsAt),
			EndsAt:     pgTimestamptz(a.EndsAt),
		})
	}
	if err := collect(q.InsertSeedAnnouncement(ctx, annRows).Exec); err != nil {
		return rep, fmt.Errorf("seed: announcements: %w", err)
	}
	rep.Announcements = len(annRows)

	if err := tx.Commit(ctx); err != nil {
		return rep, fmt.Errorf("seed: commit: %w", err)
	}
	return rep, nil
}

func alreadySeeded(ctx context.Context, pool *pgxpool.Pool, code string) (bool, error) {
	q := gen.New(pool)
	if _, err := q.GetBuildingByCode(ctx, code); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("seed: probe: %w", err)
	}
	return true, nil
}

// collect drains a sqlc batch and returns its first error.
func collect(exec func(func(int, error))) error {
	var first error
	exec(func(i int, err error) {
		if err != nil && first == nil {
			first = fmt.Errorf("row %d: %w", i, err)
		}
	})
	return first
}

// --------------------------------------------------------------- pgtypes --

func pgUUID(id uuid.UUID) pgtype.UUID { return pgtype.UUID{Bytes: id, Valid: true} }

func pgUUIDPtr(id *uuid.UUID) pgtype.UUID {
	if id == nil {
		return pgtype.UUID{}
	}
	return pgUUID(*id)
}

func pgDate(d domain.Date) pgtype.Date {
	return pgtype.Date{Time: d.Midnight(time.UTC), Valid: true}
}

func pgTimestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

func pgTimeOfDay(t domain.TimeOfDay) pgtype.Time {
	us := int64(t.Hour)*int64(time.Hour/time.Microsecond) + int64(t.Minute)*int64(time.Minute/time.Microsecond)
	return pgtype.Time{Microseconds: us, Valid: true}
}

func textPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func int32Ptr(v *int) *int32 {
	if v == nil {
		return nil
	}
	n := int32(*v) //nolint:gosec // capacities and delays are small
	return &n
}
