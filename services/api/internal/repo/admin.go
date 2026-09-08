package repo

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
	"github.com/kailholmes/campuslive/services/api/internal/repo/gen"
)

// ErrConflict is returned when a write collides with data that already exists —
// a duplicate code, or a reference that still points at the row being deleted.
// The HTTP layer turns it into `409 conflict`.
var ErrConflict = errors.New("conflict")

// ------------------------------------------------------ recurring schedule --

// LessonRow is one entry of the weekly grid as the admin API reports it: the
// `lessons` row plus the names the panel shows and the groups attending.
//
// It is deliberately flatter than domain.Lesson (which the engine consumes and
// which carries the whole room geometry): the admin panel never draws a map.
type LessonRow struct {
	ID          uuid.UUID
	SemesterID  uuid.UUID
	CourseID    uuid.UUID
	CourseCode  string
	CourseTitle string
	TeacherID   uuid.UUID
	TeacherName string
	RoomID      uuid.UUID
	RoomCode    string
	RoomType    domain.RoomType
	Schedulable bool
	SlotID      uuid.UUID
	SlotIdx     int
	Weekday     int
	Parity      domain.Parity
	Type        domain.LessonType
	SlotSpan    int
	Groups      []domain.GroupRef
}

// LessonFilter narrows ListLessonRows. A zero field means "no restriction".
type LessonFilter struct {
	BuildingID uuid.UUID
	SemesterID uuid.UUID
	Weekday    *int
	RoomCode   *string
	TeacherID  *uuid.UUID
	GroupCode  *string
}

// LessonWrite is the full set of columns a lesson row carries. The HTTP layer
// merges a PATCH with the stored row and hands the result over whole, so one
// statement covers create and update alike.
type LessonWrite struct {
	SemesterID uuid.UUID
	CourseID   uuid.UUID
	TeacherID  uuid.UUID
	RoomID     uuid.UUID
	SlotID     uuid.UUID
	Weekday    int
	Parity     domain.Parity
	Type       domain.LessonType
	SlotSpan   int
	GroupCodes []string
}

// ListLessonRows returns the lesson templates matching the filter, ordered by
// weekday, slot index and room code.
func (r *Repo) ListLessonRows(ctx context.Context, f LessonFilter) ([]LessonRow, error) {
	params := gen.ListLessonsAdminParams{
		BuildingID: pgUUID(f.BuildingID),
		SemesterID: pgUUID(f.SemesterID),
		RoomCode:   f.RoomCode,
		GroupCode:  f.GroupCode,
		TeacherID:  pgUUIDPtr(f.TeacherID),
	}
	if f.Weekday != nil {
		w := int16(*f.Weekday) //nolint:gosec // 1..7
		params.Weekday = &w
	}

	rows, err := r.q.ListLessonsAdmin(ctx, params)
	if err != nil {
		return nil, err
	}
	out := make([]LessonRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, lessonRowOf(
			row.ID, row.SemesterID, row.CourseID, row.CourseCode, row.CourseTitle,
			row.TeacherID, row.TeacherName, row.RoomID, row.RoomCode, row.RoomType, row.RoomSchedulable,
			row.SlotID, row.SlotIdx, row.Weekday, row.Parity, row.Type, row.SlotSpan,
			row.GroupIds, row.GroupCodes,
		))
	}
	return out, nil
}

// GetLessonRow reads one lesson template by id.
func (r *Repo) GetLessonRow(ctx context.Context, id uuid.UUID) (LessonRow, error) {
	row, err := r.q.GetLessonAdmin(ctx, pgUUID(id))
	if errors.Is(err, pgx.ErrNoRows) {
		return LessonRow{}, fmt.Errorf("lesson %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return LessonRow{}, err
	}
	return lessonRowOf(
		row.ID, row.SemesterID, row.CourseID, row.CourseCode, row.CourseTitle,
		row.TeacherID, row.TeacherName, row.RoomID, row.RoomCode, row.RoomType, row.RoomSchedulable,
		row.SlotID, row.SlotIdx, row.Weekday, row.Parity, row.Type, row.SlotSpan,
		row.GroupIds, row.GroupCodes,
	), nil
}

//nolint:revive // the argument list mirrors one generated row; collapsing it would need a second struct.
func lessonRowOf(
	id, semesterID, courseID pgtype.UUID, courseCode, courseTitle string,
	teacherID pgtype.UUID, teacherName string,
	roomID pgtype.UUID, roomCode string, roomType gen.RoomType, schedulable bool,
	slotID pgtype.UUID, slotIdx, weekday int16, parity gen.WeekParity, typ gen.LessonType, slotSpan int16,
	groupIDs []pgtype.UUID, groupCodes []string,
) LessonRow {
	groups := make([]domain.GroupRef, 0, len(groupCodes))
	for i, code := range groupCodes {
		ref := domain.GroupRef{Code: code}
		if i < len(groupIDs) {
			ref.ID = toUUID(groupIDs[i])
		}
		groups = append(groups, ref)
	}
	return LessonRow{
		ID:          toUUID(id),
		SemesterID:  toUUID(semesterID),
		CourseID:    toUUID(courseID),
		CourseCode:  courseCode,
		CourseTitle: courseTitle,
		TeacherID:   toUUID(teacherID),
		TeacherName: teacherName,
		RoomID:      toUUID(roomID),
		RoomCode:    roomCode,
		RoomType:    domain.RoomType(roomType),
		Schedulable: schedulable,
		SlotID:      toUUID(slotID),
		SlotIdx:     int(slotIdx),
		Weekday:     int(weekday),
		Parity:      domain.Parity(parity),
		Type:        domain.LessonType(typ),
		SlotSpan:    int(slotSpan),
		Groups:      groups,
	}
}

// InsertLesson stores a lesson template and its attendance list in one
// transaction and returns the new id.
func (r *Repo) InsertLesson(ctx context.Context, w LessonWrite) (uuid.UUID, error) {
	var id uuid.UUID
	err := r.inTx(ctx, func(q *gen.Queries) error {
		newID, err := q.InsertLessonAdmin(ctx, gen.InsertLessonAdminParams{
			SemesterID: pgUUID(w.SemesterID),
			CourseID:   pgUUID(w.CourseID),
			TeacherID:  pgUUID(w.TeacherID),
			RoomID:     pgUUID(w.RoomID),
			SlotID:     pgUUID(w.SlotID),
			Weekday:    int16(w.Weekday), //nolint:gosec // 1..7
			Parity:     gen.WeekParity(w.Parity),
			Type:       gen.LessonType(w.Type),
			SlotSpan:   int16(w.SlotSpan), //nolint:gosec // 1..2
		})
		if err != nil {
			return err
		}
		id = toUUID(newID)
		return q.InsertLessonGroupsByCode(ctx, gen.InsertLessonGroupsByCodeParams{
			LessonID: newID, Codes: w.GroupCodes,
		})
	})
	return id, err
}

// UpdateLesson rewrites every column of a lesson. When GroupCodes is non-nil
// the attendance list is replaced as well; a nil slice leaves it alone.
func (r *Repo) UpdateLesson(ctx context.Context, id uuid.UUID, w LessonWrite, replaceGroups bool) error {
	return r.inTx(ctx, func(q *gen.Queries) error {
		n, err := q.UpdateLessonAdmin(ctx, gen.UpdateLessonAdminParams{
			ID:         pgUUID(id),
			SemesterID: pgUUID(w.SemesterID),
			CourseID:   pgUUID(w.CourseID),
			TeacherID:  pgUUID(w.TeacherID),
			RoomID:     pgUUID(w.RoomID),
			SlotID:     pgUUID(w.SlotID),
			Weekday:    int16(w.Weekday), //nolint:gosec // 1..7
			Parity:     gen.WeekParity(w.Parity),
			Type:       gen.LessonType(w.Type),
			SlotSpan:   int16(w.SlotSpan), //nolint:gosec // 1..2
		})
		if err != nil {
			return err
		}
		if n == 0 {
			return fmt.Errorf("lesson %s: %w", id, ErrNotFound)
		}
		if !replaceGroups {
			return nil
		}
		if err := q.DeleteLessonGroups(ctx, pgUUID(id)); err != nil {
			return err
		}
		return q.InsertLessonGroupsByCode(ctx, gen.InsertLessonGroupsByCodeParams{
			LessonID: pgUUID(id), Codes: w.GroupCodes,
		})
	})
}

// DeleteLesson removes a lesson template; `lesson_groups` and any override
// attached to it cascade.
func (r *Repo) DeleteLesson(ctx context.Context, id uuid.UUID) error {
	n, err := r.q.DeleteLessonAdmin(ctx, pgUUID(id))
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("lesson %s: %w", id, ErrNotFound)
	}
	return nil
}

// GroupsByCodes resolves group codes to references. Codes that match nothing
// are simply absent from the result, which is how the caller detects them.
func (r *Repo) GroupsByCodes(ctx context.Context, codes []string) ([]domain.GroupRef, error) {
	rows, err := r.q.ListGroupsByCodes(ctx, codes)
	if err != nil {
		return nil, err
	}
	out := make([]domain.GroupRef, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.GroupRef{ID: toUUID(row.ID), Code: row.Code})
	}
	return out, nil
}

// ------------------------------------------------------------- reference --

// ListTeachers returns every teacher, ordered by short name.
func (r *Repo) ListTeachers(ctx context.Context) ([]domain.Teacher, error) {
	rows, err := r.q.ListAllTeachers(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Teacher, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.Teacher{
			ID: toUUID(row.ID), FullName: row.FullName, ShortName: row.ShortName, Department: str(row.Department),
		})
	}
	return out, nil
}

// ListGroups returns every student group, ordered by code.
func (r *Repo) ListGroups(ctx context.Context) ([]domain.Group, error) {
	rows, err := r.q.ListAllGroups(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Group, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.Group{
			ID: toUUID(row.ID), Code: row.Code, Program: str(row.Program), CourseYear: toInt16(row.CourseYear),
		})
	}
	return out, nil
}

// ListCourses returns every course, ordered by code.
func (r *Repo) ListCourses(ctx context.Context) ([]domain.Course, error) {
	rows, err := r.q.ListAllCourses(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Course, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.Course{
			ID: toUUID(row.ID), Code: row.Code, Title: row.Title, Department: str(row.Department),
		})
	}
	return out, nil
}

// ListSemesters returns every semester, ordered by start date.
func (r *Repo) ListSemesters(ctx context.Context) ([]domain.Semester, error) {
	rows, err := r.q.ListSemesters(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Semester, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.Semester{
			ID:          toUUID(row.ID),
			Name:        row.Name,
			StartsOn:    toDate(row.StartsOn),
			EndsOn:      toDate(row.EndsOn),
			Week1Parity: domain.Parity(row.Week1Parity),
		})
	}
	return out, nil
}

// GetSemester looks a semester up by id.
func (r *Repo) GetSemester(ctx context.Context, id uuid.UUID) (domain.Semester, error) {
	all, err := r.ListSemesters(ctx)
	if err != nil {
		return domain.Semester{}, err
	}
	for _, s := range all {
		if s.ID == id {
			return s, nil
		}
	}
	return domain.Semester{}, fmt.Errorf("semester %s: %w", id, ErrNotFound)
}

// GetGroupByID looks a student group up by id.
func (r *Repo) GetGroupByID(ctx context.Context, id uuid.UUID) (domain.Group, error) {
	row, err := r.q.GetGroupByID(ctx, pgUUID(id))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Group{}, fmt.Errorf("group %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return domain.Group{}, err
	}
	return domain.Group{
		ID: toUUID(row.ID), Code: row.Code, Program: str(row.Program), CourseYear: toInt16(row.CourseYear),
	}, nil
}

// GetCourseByID looks a course up by id.
func (r *Repo) GetCourseByID(ctx context.Context, id uuid.UUID) (domain.Course, error) {
	row, err := r.q.GetCourseByID(ctx, pgUUID(id))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Course{}, fmt.Errorf("course %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return domain.Course{}, err
	}
	return domain.Course{
		ID: toUUID(row.ID), Code: row.Code, Title: row.Title, Department: str(row.Department),
	}, nil
}

// ---------------------------------------------------- reference: teachers --

// InsertTeacher stores a new teacher.
func (r *Repo) InsertTeacher(ctx context.Context, t domain.Teacher) (domain.Teacher, error) {
	row, err := r.q.InsertTeacherAdmin(ctx, gen.InsertTeacherAdminParams{
		FullName: t.FullName, ShortName: t.ShortName, Department: pgText(t.Department),
	})
	if err != nil {
		return domain.Teacher{}, uniqueViolation(err)
	}
	return domain.Teacher{
		ID: toUUID(row.ID), FullName: row.FullName, ShortName: row.ShortName, Department: str(row.Department),
	}, nil
}

// UpdateTeacher rewrites a teacher's three editable columns.
func (r *Repo) UpdateTeacher(ctx context.Context, t domain.Teacher) (domain.Teacher, error) {
	row, err := r.q.UpdateTeacherAdmin(ctx, gen.UpdateTeacherAdminParams{
		ID: pgUUID(t.ID), FullName: t.FullName, ShortName: t.ShortName, Department: pgText(t.Department),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Teacher{}, fmt.Errorf("teacher %s: %w", t.ID, ErrNotFound)
	}
	if err != nil {
		return domain.Teacher{}, uniqueViolation(err)
	}
	return domain.Teacher{
		ID: toUUID(row.ID), FullName: row.FullName, ShortName: row.ShortName, Department: str(row.Department),
	}, nil
}

// DeleteTeacher removes a teacher, refusing while anything still refers to one.
func (r *Repo) DeleteTeacher(ctx context.Context, id uuid.UUID) error {
	uses, err := r.q.CountTeacherUsage(ctx, pgUUID(id))
	if err != nil {
		return err
	}
	if uses > 0 {
		return fmt.Errorf("teacher %s still teaches %d lessons or overrides: %w", id, uses, ErrConflict)
	}
	n, err := r.q.DeleteTeacherAdmin(ctx, pgUUID(id))
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("teacher %s: %w", id, ErrNotFound)
	}
	return nil
}

// ------------------------------------------------------ reference: groups --

// InsertGroup stores a new student group.
func (r *Repo) InsertGroup(ctx context.Context, g domain.Group) (domain.Group, error) {
	row, err := r.q.InsertGroupAdmin(ctx, gen.InsertGroupAdminParams{
		Code: g.Code, Program: pgText(g.Program), CourseYear: pgInt16(g.CourseYear),
	})
	if err != nil {
		return domain.Group{}, uniqueViolation(err)
	}
	return domain.Group{
		ID: toUUID(row.ID), Code: row.Code, Program: str(row.Program), CourseYear: toInt16(row.CourseYear),
	}, nil
}

// UpdateGroup rewrites a student group's three editable columns.
func (r *Repo) UpdateGroup(ctx context.Context, g domain.Group) (domain.Group, error) {
	row, err := r.q.UpdateGroupAdmin(ctx, gen.UpdateGroupAdminParams{
		ID: pgUUID(g.ID), Code: g.Code, Program: pgText(g.Program), CourseYear: pgInt16(g.CourseYear),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Group{}, fmt.Errorf("group %s: %w", g.ID, ErrNotFound)
	}
	if err != nil {
		return domain.Group{}, uniqueViolation(err)
	}
	return domain.Group{
		ID: toUUID(row.ID), Code: row.Code, Program: str(row.Program), CourseYear: toInt16(row.CourseYear),
	}, nil
}

// DeleteGroup removes a student group, refusing while it is still enrolled.
func (r *Repo) DeleteGroup(ctx context.Context, id uuid.UUID) error {
	uses, err := r.q.CountGroupUsage(ctx, pgUUID(id))
	if err != nil {
		return err
	}
	if uses > 0 {
		return fmt.Errorf("group %s is still enrolled in %d lessons or overrides: %w", id, uses, ErrConflict)
	}
	n, err := r.q.DeleteGroupAdmin(ctx, pgUUID(id))
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("group %s: %w", id, ErrNotFound)
	}
	return nil
}

// ----------------------------------------------------- reference: courses --

// InsertCourse stores a new course.
func (r *Repo) InsertCourse(ctx context.Context, c domain.Course) (domain.Course, error) {
	row, err := r.q.InsertCourseAdmin(ctx, gen.InsertCourseAdminParams{
		Code: c.Code, Title: c.Title, Department: pgText(c.Department),
	})
	if err != nil {
		return domain.Course{}, uniqueViolation(err)
	}
	return domain.Course{
		ID: toUUID(row.ID), Code: row.Code, Title: row.Title, Department: str(row.Department),
	}, nil
}

// UpdateCourse rewrites a course's three editable columns.
func (r *Repo) UpdateCourse(ctx context.Context, c domain.Course) (domain.Course, error) {
	row, err := r.q.UpdateCourseAdmin(ctx, gen.UpdateCourseAdminParams{
		ID: pgUUID(c.ID), Code: c.Code, Title: c.Title, Department: pgText(c.Department),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Course{}, fmt.Errorf("course %s: %w", c.ID, ErrNotFound)
	}
	if err != nil {
		return domain.Course{}, uniqueViolation(err)
	}
	return domain.Course{
		ID: toUUID(row.ID), Code: row.Code, Title: row.Title, Department: str(row.Department),
	}, nil
}

// DeleteCourse removes a course, refusing while it is still taught.
func (r *Repo) DeleteCourse(ctx context.Context, id uuid.UUID) error {
	uses, err := r.q.CountCourseUsage(ctx, pgUUID(id))
	if err != nil {
		return err
	}
	if uses > 0 {
		return fmt.Errorf("course %s is still taught by %d lessons or overrides: %w", id, uses, ErrConflict)
	}
	n, err := r.q.DeleteCourseAdmin(ctx, pgUUID(id))
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("course %s: %w", id, ErrNotFound)
	}
	return nil
}

// ---------------------------------------------------------------- helpers --

// inTx runs fn inside a transaction, rolling back on any error.
func (r *Repo) inTx(ctx context.Context, fn func(*gen.Queries) error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("repo: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := fn(gen.New(tx)); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("repo: commit: %w", err)
	}
	return nil
}

// uniqueViolation turns PostgreSQL's 23505 into ErrConflict, so a duplicate
// group or course code becomes a 409 rather than a 500.
func uniqueViolation(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		detail := pgErr.Detail
		if detail == "" {
			detail = pgErr.Message
		}
		return fmt.Errorf("%s: %w", detail, ErrConflict)
	}
	return err
}

func pgInt16(v int) *int16 {
	if v == 0 {
		return nil
	}
	n := int16(v) //nolint:gosec // 1..6
	return &n
}
