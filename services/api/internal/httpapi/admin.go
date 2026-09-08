package httpapi

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	"github.com/google/uuid"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
	"github.com/kailholmes/campuslive/services/api/internal/repo"
	"github.com/kailholmes/campuslive/services/api/internal/service"
)

// The admin panel's write side: the recurring schedule (`lessons`) and the
// reference tables it renames. Every write ends in s.refresh, which drops the
// cached day and pokes the scheduler, so the change is on every open board over
// SSE in well under a second.
//
// internal/engine is untouched by all of this: these handlers only write rows
// and invalidate.

// apiError is a resolved failure on its way back to the caller. Each handler
// turns it into its own generated response type — the strict server gives every
// operation a distinct 400/404/409 — so the resolution logic itself stays
// operation-agnostic.
type apiError struct {
	code    string
	message string
}

func badRequest(format string, args ...any) *apiError {
	return &apiError{code: CodeBadRequest, message: fmt.Sprintf(format, args...)}
}

func notFound(format string, args ...any) *apiError {
	return &apiError{code: CodeNotFound, message: fmt.Sprintf(format, args...)}
}

func conflict(format string, args ...any) *apiError {
	return &apiError{code: CodeConflict, message: fmt.Sprintf(format, args...)}
}

// storeError maps a repository error onto the envelope, or returns nil when the
// error is not one the contract describes (and so is a 500).
func storeError(err error) *apiError {
	switch {
	case errors.Is(err, repo.ErrNotFound):
		return notFound("%s", err.Error())
	case errors.Is(err, repo.ErrConflict):
		return conflict("%s", err.Error())
	default:
		return nil
	}
}

// ------------------------------------------------------------- overrides --

// ListOverrides reports the point changes stored for one local date.
func (s *Server) ListOverrides(ctx context.Context, request ListOverridesRequestObject) (ListOverridesResponseObject, error) {
	building, err := s.opts.Board.Repo().GetBuilding(ctx, s.opts.DefaultBuilding)
	if err != nil {
		return nil, err
	}

	date := s.opts.Board.LocalDate(building)
	if request.Params.Date != nil {
		d, perr := service.ParseDate(*request.Params.Date)
		if perr != nil {
			return ListOverrides400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, perr.Error()))}, nil
		}
		date = d
	}

	stored, err := s.opts.Board.Repo().ListOverrides(ctx, building.ID, date)
	if err != nil {
		return nil, err
	}
	out := make([]Override, 0, len(stored))
	for _, o := range stored {
		out = append(out, overrideFromDomain(o))
	}
	return ListOverrides200JSONResponse{Overrides: out}, nil
}

// ---------------------------------------------------- the recurring grid --

// lessonWish is a partially specified lesson: the fields a request supplied.
// A nil field means "keep what is stored" on a PATCH and "use the default" on a
// POST.
type lessonWish struct {
	SemesterID *uuid.UUID
	CourseID   *uuid.UUID
	TeacherID  *uuid.UUID
	RoomCode   *string
	SlotIdx    *int
	Weekday    *int
	Parity     *domain.Parity
	Type       *domain.LessonType
	SlotSpan   *int
	GroupCodes *[]string
}

// lessonSpec is a fully resolved, validated lesson — every reference looked up.
type lessonSpec struct {
	Semester domain.Semester
	Course   domain.Course
	Teacher  domain.Teacher
	Room     domain.Room
	Slot     domain.TimeSlot
	Weekday  int
	Parity   domain.Parity
	Type     domain.LessonType
	SlotSpan int
	Groups   []domain.GroupRef
}

// GroupCodes lists the attending groups in the order they were resolved.
func (l lessonSpec) GroupCodes() []string {
	out := make([]string, 0, len(l.Groups))
	for _, g := range l.Groups {
		out = append(out, g.Code)
	}
	return out
}

func (l lessonSpec) write() repo.LessonWrite {
	return repo.LessonWrite{
		SemesterID: l.Semester.ID,
		CourseID:   l.Course.ID,
		TeacherID:  l.Teacher.ID,
		RoomID:     l.Room.ID,
		SlotID:     l.Slot.ID,
		Weekday:    l.Weekday,
		Parity:     l.Parity,
		Type:       l.Type,
		SlotSpan:   l.SlotSpan,
		GroupCodes: l.GroupCodes(),
	}
}

// resolveLesson turns a request into a validated lessonSpec, looking every
// reference up and applying the placement rules of docs/BUILDING.md. `base` is
// the stored row on a PATCH and nil on a POST.
//
//nolint:gocyclo,cyclop // one linear validation per field; splitting it would only hide the order.
func (s *Server) resolveLesson(ctx context.Context, building domain.Building, base *repo.LessonRow, w lessonWish) (lessonSpec, *apiError, error) {
	var spec lessonSpec
	store := s.opts.Board.Repo()

	// ---- semester ----
	switch {
	case w.SemesterID != nil:
		sem, err := store.GetSemester(ctx, *w.SemesterID)
		if err != nil {
			if errors.Is(err, repo.ErrNotFound) {
				return spec, notFound("no such semester"), nil
			}
			return spec, nil, err
		}
		spec.Semester = sem
	case base != nil:
		sem, err := store.GetSemester(ctx, base.SemesterID)
		if err != nil {
			return spec, nil, err
		}
		spec.Semester = sem
	default:
		sem, err := store.SemesterForDate(ctx, s.opts.Board.LocalDate(building))
		if err != nil {
			if errors.Is(err, repo.ErrNotFound) {
				return spec, badRequest("no semester covers today; pass semesterId"), nil
			}
			return spec, nil, err
		}
		spec.Semester = sem
	}

	// ---- course ----
	courseID := uuid.Nil
	switch {
	case w.CourseID != nil:
		courseID = *w.CourseID
	case base != nil:
		courseID = base.CourseID
	}
	course, err := store.GetCourseByID(ctx, courseID)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return spec, notFound("no such course"), nil
		}
		return spec, nil, err
	}
	spec.Course = course

	// ---- teacher ----
	teacherID := uuid.Nil
	switch {
	case w.TeacherID != nil:
		teacherID = *w.TeacherID
	case base != nil:
		teacherID = base.TeacherID
	}
	teacher, err := store.GetTeacher(ctx, teacherID)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return spec, notFound("no such teacher"), nil
		}
		return spec, nil, err
	}
	spec.Teacher = teacher

	// ---- room ----
	roomCode := ""
	switch {
	case w.RoomCode != nil:
		roomCode = strings.TrimSpace(*w.RoomCode)
	case base != nil:
		roomCode = base.RoomCode
	}
	room, err := store.GetRoom(ctx, roomCode)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return spec, notFound("no such room %q", roomCode), nil
		}
		return spec, nil, err
	}
	spec.Room = room

	// ---- weekday, parity, type, span ----
	spec.Weekday = 1
	if base != nil {
		spec.Weekday = base.Weekday
	}
	if w.Weekday != nil {
		spec.Weekday = *w.Weekday
	}
	if spec.Weekday < 1 || spec.Weekday > 7 {
		return spec, badRequest("weekday must be 1 (Monday) … 7 (Sunday)"), nil
	}

	spec.Parity = domain.ParityAll
	if base != nil {
		spec.Parity = base.Parity
	}
	if w.Parity != nil {
		spec.Parity = *w.Parity
	}

	spec.Type = domain.LessonPractice
	if base != nil {
		spec.Type = base.Type
	}
	if w.Type != nil {
		spec.Type = *w.Type
	}

	spec.SlotSpan = 1
	if base != nil {
		spec.SlotSpan = base.SlotSpan
	}
	if w.SlotSpan != nil {
		spec.SlotSpan = *w.SlotSpan
	}
	if spec.SlotSpan != 1 && spec.SlotSpan != 2 {
		return spec, badRequest("slotSpan must be 1 or 2"), nil
	}

	// ---- slot ----
	slotIdx := 1
	if base != nil {
		slotIdx = base.SlotIdx
	}
	if w.SlotIdx != nil {
		slotIdx = *w.SlotIdx
	}
	slots, err := store.ListTimeSlots(ctx, building.ID)
	if err != nil {
		return spec, nil, err
	}
	lastIdx := 0
	for _, sl := range slots {
		if sl.Idx > lastIdx {
			lastIdx = sl.Idx
		}
		if sl.Idx == slotIdx {
			spec.Slot = sl
		}
	}
	if spec.Slot.ID == uuid.Nil {
		return spec, notFound("no such slot %d in building %s", slotIdx, building.Code), nil
	}
	if slotIdx+spec.SlotSpan-1 > lastIdx {
		return spec, badRequest("a lesson of %d slots cannot start at slot %d; the day ends at slot %d",
			spec.SlotSpan, slotIdx, lastIdx), nil
	}

	// ---- groups ----
	var codes []string
	switch {
	case w.GroupCodes != nil:
		codes = *w.GroupCodes
	case base != nil:
		for _, g := range base.Groups {
			codes = append(codes, g.Code)
		}
	}
	codes = dedupe(codes)
	if len(codes) == 0 {
		return spec, badRequest("at least one group must attend the lesson"), nil
	}
	groups, err := store.GroupsByCodes(ctx, codes)
	if err != nil {
		return spec, nil, err
	}
	if len(groups) != len(codes) {
		return spec, notFound("unknown student group in %v", missingCodes(codes, groups)), nil
	}
	spec.Groups = groups

	// ---- placement rules (docs/BUILDING.md) ----
	if !spec.Room.Schedulable {
		return spec, badRequest("room %s is not schedulable", spec.Room.Code), nil
	}
	if !roomSuitsLesson(spec.Room.Type, spec.Type) {
		return spec, badRequest("a %s lesson does not belong in %s (a %s room)",
			spec.Type, spec.Room.Code, spec.Room.Type), nil
	}

	return spec, nil, nil
}

// roomSuitsLesson is the placement rule of docs/BUILDING.md: a laboratory class
// only in a laboratory, a lecture only in a lecture hall, and a practice class
// anywhere that may be scheduled at all (the two seminar rooms, but also a lab
// or a hall when that is what is free).
func roomSuitsLesson(roomType domain.RoomType, lessonType domain.LessonType) bool {
	switch lessonType {
	case domain.LessonLab:
		return roomType == domain.RoomLab
	case domain.LessonLecture:
		return roomType == domain.RoomLecture
	case domain.LessonPractice:
		return true
	default:
		return true
	}
}

// parityOverlaps reports whether two lessons can be in the same place at the
// same time. Only an odd-week and an even-week lesson alternate; everything
// else collides.
func parityOverlaps(a, b domain.Parity) bool {
	if a == domain.ParityOdd && b == domain.ParityEven {
		return false
	}
	if a == domain.ParityEven && b == domain.ParityOdd {
		return false
	}
	return true
}

// slotsOverlap reports whether two slot ranges intersect.
func slotsOverlap(aIdx, aSpan, bIdx, bSpan int) bool {
	return aIdx <= bIdx+bSpan-1 && bIdx <= aIdx+aSpan-1
}

// lessonConflict looks for an existing lesson that already owns the room, the
// teacher or one of the groups in any slot the candidate spans. It returns the
// message for the 409, or "" when the slot is free.
func (s *Server) lessonConflict(ctx context.Context, building domain.Building, spec lessonSpec, exclude uuid.UUID) (string, error) {
	weekday := spec.Weekday
	existing, err := s.opts.Board.Repo().ListLessonRows(ctx, repo.LessonFilter{
		BuildingID: building.ID,
		SemesterID: spec.Semester.ID,
		Weekday:    &weekday,
	})
	if err != nil {
		return "", err
	}

	wanted := make(map[string]bool, len(spec.Groups))
	for _, g := range spec.Groups {
		wanted[g.Code] = true
	}

	for _, other := range existing {
		if other.ID == exclude {
			continue
		}
		if !parityOverlaps(spec.Parity, other.Parity) {
			continue
		}
		if !slotsOverlap(spec.Slot.Idx, spec.SlotSpan, other.SlotIdx, other.SlotSpan) {
			continue
		}

		where := fmt.Sprintf("weekday %d, slot %d", other.Weekday, other.SlotIdx)
		if other.RoomID == spec.Room.ID {
			return fmt.Sprintf("room %s is already taken on %s by %s (%s)",
				other.RoomCode, where, other.CourseCode, other.TeacherName), nil
		}
		if other.TeacherID == spec.Teacher.ID {
			return fmt.Sprintf("%s already teaches %s in %s on %s",
				other.TeacherName, other.CourseCode, other.RoomCode, where), nil
		}
		for _, g := range other.Groups {
			if wanted[g.Code] {
				return fmt.Sprintf("%s already attends %s in %s on %s",
					g.Code, other.CourseCode, other.RoomCode, where), nil
			}
		}
	}
	return "", nil
}

// ListLessons reports the recurring grid.
func (s *Server) ListLessons(ctx context.Context, request ListLessonsRequestObject) (ListLessonsResponseObject, error) {
	bad := func(msg string) ListLessonsResponseObject {
		return ListLessons400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, msg))}
	}

	building, err := s.opts.Board.Repo().GetBuilding(ctx, s.opts.DefaultBuilding)
	if err != nil {
		return nil, err
	}

	filter := repo.LessonFilter{BuildingID: building.ID}
	if request.Params.SemesterId != nil {
		sem, serr := s.opts.Board.Repo().GetSemester(ctx, *request.Params.SemesterId)
		if serr != nil {
			if errors.Is(serr, repo.ErrNotFound) {
				return ListLessons404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, "no such semester"))}, nil
			}
			return nil, serr
		}
		filter.SemesterID = sem.ID
	} else {
		sem, serr := s.opts.Board.Repo().SemesterForDate(ctx, s.opts.Board.LocalDate(building))
		if serr != nil {
			if errors.Is(serr, repo.ErrNotFound) {
				return ListLessons404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, "no semester is stored"))}, nil
			}
			return nil, serr
		}
		filter.SemesterID = sem.ID
	}

	if request.Params.Weekday != nil {
		wd := int(*request.Params.Weekday)
		if wd < 1 || wd > 7 {
			return bad("weekday must be 1 (Monday) … 7 (Sunday)"), nil
		}
		filter.Weekday = &wd
	}
	filter.RoomCode = request.Params.RoomCode
	filter.GroupCode = request.Params.GroupCode
	filter.TeacherID = request.Params.TeacherId

	rows, err := s.opts.Board.Repo().ListLessonRows(ctx, filter)
	if err != nil {
		return nil, err
	}
	slots, err := s.opts.Board.Repo().ListTimeSlots(ctx, building.ID)
	if err != nil {
		return nil, err
	}

	out := make([]Lesson, 0, len(rows))
	for _, row := range rows {
		out = append(out, lessonDTO(row, slots))
	}
	return ListLessons200JSONResponse{Lessons: out}, nil
}

// CreateLesson places a lesson on the weekly grid and rebuilds the board.
func (s *Server) CreateLesson(ctx context.Context, request CreateLessonRequestObject) (CreateLessonResponseObject, error) {
	fail := func(e *apiError) CreateLessonResponseObject {
		switch e.code {
		case CodeNotFound:
			return CreateLesson404JSONResponse{NotFoundJSONResponse(errorBody(e.code, e.message))}
		case CodeConflict:
			return CreateLesson409JSONResponse{ConflictJSONResponse(errorBody(e.code, e.message))}
		default:
			return CreateLesson400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, e.message))}
		}
	}
	if request.Body == nil {
		return fail(badRequest("a body is required")), nil
	}
	body := *request.Body

	building, err := s.opts.Board.Repo().GetBuilding(ctx, s.opts.DefaultBuilding)
	if err != nil {
		return nil, err
	}

	slotIdx := int(body.SlotIdx)
	weekday := int(body.Weekday)
	parity := domain.Parity(body.Parity)
	typ := domain.LessonType(body.Type)
	codes := body.GroupCodes
	wish := lessonWish{
		SemesterID: body.SemesterId,
		CourseID:   &body.CourseId,
		TeacherID:  &body.TeacherId,
		RoomCode:   &body.RoomCode,
		SlotIdx:    &slotIdx,
		Weekday:    &weekday,
		Parity:     &parity,
		Type:       &typ,
		GroupCodes: &codes,
	}
	if body.SlotSpan != nil {
		span := int(*body.SlotSpan)
		wish.SlotSpan = &span
	}

	spec, apiErr, err := s.resolveLesson(ctx, building, nil, wish)
	if err != nil {
		return nil, err
	}
	if apiErr != nil {
		return fail(apiErr), nil
	}

	msg, err := s.lessonConflict(ctx, building, spec, uuid.Nil)
	if err != nil {
		return nil, err
	}
	if msg != "" {
		return fail(conflict("%s", msg)), nil
	}

	id, err := s.opts.Board.Repo().InsertLesson(ctx, spec.write())
	if err != nil {
		if e := storeError(err); e != nil {
			return fail(e), nil
		}
		return nil, err
	}

	dto, err := s.lessonByID(ctx, building, id)
	if err != nil {
		return nil, err
	}
	s.refresh(building.Code)
	s.log.Info("lesson created",
		slog.String("id", id.String()), slog.String("room", spec.Room.Code),
		slog.Int("weekday", spec.Weekday), slog.Int("slot", spec.Slot.Idx))
	return CreateLesson201JSONResponse(dto), nil
}

// UpdateLesson edits a lesson in place and rebuilds the board.
func (s *Server) UpdateLesson(ctx context.Context, request UpdateLessonRequestObject) (UpdateLessonResponseObject, error) {
	fail := func(e *apiError) UpdateLessonResponseObject {
		switch e.code {
		case CodeNotFound:
			return UpdateLesson404JSONResponse{NotFoundJSONResponse(errorBody(e.code, e.message))}
		case CodeConflict:
			return UpdateLesson409JSONResponse{ConflictJSONResponse(errorBody(e.code, e.message))}
		default:
			return UpdateLesson400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, e.message))}
		}
	}
	if request.Body == nil {
		return fail(badRequest("a body is required")), nil
	}
	body := *request.Body

	building, err := s.opts.Board.Repo().GetBuilding(ctx, s.opts.DefaultBuilding)
	if err != nil {
		return nil, err
	}

	base, err := s.opts.Board.Repo().GetLessonRow(ctx, request.Id)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return fail(notFound("no such lesson")), nil
		}
		return nil, err
	}

	wish := lessonWish{
		SemesterID: body.SemesterId,
		CourseID:   body.CourseId,
		TeacherID:  body.TeacherId,
		RoomCode:   body.RoomCode,
	}
	if body.SlotIdx != nil {
		v := int(*body.SlotIdx)
		wish.SlotIdx = &v
	}
	if body.Weekday != nil {
		v := int(*body.Weekday)
		wish.Weekday = &v
	}
	if body.Parity != nil {
		v := domain.Parity(*body.Parity)
		wish.Parity = &v
	}
	if body.Type != nil {
		v := domain.LessonType(*body.Type)
		wish.Type = &v
	}
	if body.SlotSpan != nil {
		v := int(*body.SlotSpan)
		wish.SlotSpan = &v
	}
	if body.GroupCodes != nil {
		wish.GroupCodes = body.GroupCodes
	}

	spec, apiErr, err := s.resolveLesson(ctx, building, &base, wish)
	if err != nil {
		return nil, err
	}
	if apiErr != nil {
		return fail(apiErr), nil
	}

	msg, err := s.lessonConflict(ctx, building, spec, base.ID)
	if err != nil {
		return nil, err
	}
	if msg != "" {
		return fail(conflict("%s", msg)), nil
	}

	if err := s.opts.Board.Repo().UpdateLesson(ctx, base.ID, spec.write(), body.GroupCodes != nil); err != nil {
		if e := storeError(err); e != nil {
			return fail(e), nil
		}
		return nil, err
	}

	dto, err := s.lessonByID(ctx, building, base.ID)
	if err != nil {
		return nil, err
	}
	s.refresh(building.Code)
	s.log.Info("lesson updated", slog.String("id", base.ID.String()))
	return UpdateLesson200JSONResponse(dto), nil
}

// DeleteLesson removes a lesson and rebuilds the board.
func (s *Server) DeleteLesson(ctx context.Context, request DeleteLessonRequestObject) (DeleteLessonResponseObject, error) {
	if err := s.opts.Board.Repo().DeleteLesson(ctx, request.Id); err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return DeleteLesson404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, "no such lesson"))}, nil
		}
		return nil, err
	}
	s.refresh(s.opts.DefaultBuilding)
	s.log.Info("lesson deleted", slog.String("id", request.Id.String()))
	return DeleteLesson204Response{}, nil
}

// lessonByID reads a lesson back and renders it.
func (s *Server) lessonByID(ctx context.Context, building domain.Building, id uuid.UUID) (Lesson, error) {
	row, err := s.opts.Board.Repo().GetLessonRow(ctx, id)
	if err != nil {
		return Lesson{}, err
	}
	slots, err := s.opts.Board.Repo().ListTimeSlots(ctx, building.ID)
	if err != nil {
		return Lesson{}, err
	}
	return lessonDTO(row, slots), nil
}

// ------------------------------------------------------------- teachers --

// CreateTeacher adds a member of staff.
func (s *Server) CreateTeacher(ctx context.Context, request CreateTeacherRequestObject) (CreateTeacherResponseObject, error) {
	bad := func(msg string) CreateTeacherResponseObject {
		return CreateTeacher400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, msg))}
	}
	if request.Body == nil {
		return bad("a body is required"), nil
	}
	body := *request.Body
	full, short := strings.TrimSpace(body.FullName), strings.TrimSpace(body.ShortName)
	if full == "" || short == "" {
		return bad("fullName and shortName must not be empty"), nil
	}

	stored, err := s.opts.Board.Repo().InsertTeacher(ctx, domain.Teacher{
		FullName: full, ShortName: short, Department: strings.TrimSpace(deref(body.Department)),
	})
	if err != nil {
		return nil, err
	}
	s.refresh(s.opts.DefaultBuilding)
	s.log.Info("teacher created", slog.String("id", stored.ID.String()))
	return CreateTeacher201JSONResponse(teacherRef(stored)), nil
}

// UpdateTeacher renames a member of staff. The name is on every board row, so
// the snapshot is rebuilt.
func (s *Server) UpdateTeacher(ctx context.Context, request UpdateTeacherRequestObject) (UpdateTeacherResponseObject, error) {
	bad := func(msg string) UpdateTeacherResponseObject {
		return UpdateTeacher400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, msg))}
	}
	if request.Body == nil {
		return bad("a body is required"), nil
	}
	body := *request.Body
	if body.FullName == nil && body.ShortName == nil && body.Department == nil {
		return bad("nothing to change"), nil
	}

	current, err := s.opts.Board.Repo().GetTeacher(ctx, request.Id)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return UpdateTeacher404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, "no such teacher"))}, nil
		}
		return nil, err
	}
	if body.FullName != nil {
		current.FullName = strings.TrimSpace(*body.FullName)
	}
	if body.ShortName != nil {
		current.ShortName = strings.TrimSpace(*body.ShortName)
	}
	if body.Department != nil {
		current.Department = strings.TrimSpace(*body.Department)
	}
	if current.FullName == "" || current.ShortName == "" {
		return bad("fullName and shortName must not be empty"), nil
	}

	stored, err := s.opts.Board.Repo().UpdateTeacher(ctx, current)
	if err != nil {
		return nil, err
	}
	s.refresh(s.opts.DefaultBuilding)
	s.log.Info("teacher updated", slog.String("id", stored.ID.String()))
	return UpdateTeacher200JSONResponse(teacherRef(stored)), nil
}

// DeleteTeacher removes a member of staff who teaches nothing.
func (s *Server) DeleteTeacher(ctx context.Context, request DeleteTeacherRequestObject) (DeleteTeacherResponseObject, error) {
	if err := s.opts.Board.Repo().DeleteTeacher(ctx, request.Id); err != nil {
		switch {
		case errors.Is(err, repo.ErrNotFound):
			return DeleteTeacher404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, "no such teacher"))}, nil
		case errors.Is(err, repo.ErrConflict):
			return DeleteTeacher409JSONResponse{ConflictJSONResponse(errorBody(CodeConflict, err.Error()))}, nil
		default:
			return nil, err
		}
	}
	s.refresh(s.opts.DefaultBuilding)
	s.log.Info("teacher deleted", slog.String("id", request.Id.String()))
	return DeleteTeacher204Response{}, nil
}

// --------------------------------------------------------------- groups --

// CreateGroup adds a student group.
func (s *Server) CreateGroup(ctx context.Context, request CreateGroupRequestObject) (CreateGroupResponseObject, error) {
	bad := func(msg string) CreateGroupResponseObject {
		return CreateGroup400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, msg))}
	}
	if request.Body == nil {
		return bad("a body is required"), nil
	}
	body := *request.Body
	code := strings.TrimSpace(body.Code)
	if code == "" {
		return bad("code must not be empty"), nil
	}

	group := domain.Group{Code: code, Program: strings.TrimSpace(deref(body.Program))}
	if body.CourseYear != nil {
		group.CourseYear = int(*body.CourseYear)
	}

	stored, err := s.opts.Board.Repo().InsertGroup(ctx, group)
	if err != nil {
		if errors.Is(err, repo.ErrConflict) {
			return CreateGroup409JSONResponse{ConflictJSONResponse(errorBody(CodeConflict, err.Error()))}, nil
		}
		return nil, err
	}
	s.refresh(s.opts.DefaultBuilding)
	s.log.Info("group created", slog.String("id", stored.ID.String()))
	return CreateGroup201JSONResponse(groupDTO(stored)), nil
}

// UpdateGroup renames a student group. The code is on every board row.
func (s *Server) UpdateGroup(ctx context.Context, request UpdateGroupRequestObject) (UpdateGroupResponseObject, error) {
	bad := func(msg string) UpdateGroupResponseObject {
		return UpdateGroup400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, msg))}
	}
	if request.Body == nil {
		return bad("a body is required"), nil
	}
	body := *request.Body
	if body.Code == nil && body.Program == nil && body.CourseYear == nil {
		return bad("nothing to change"), nil
	}

	current, err := s.opts.Board.Repo().GetGroupByID(ctx, request.Id)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return UpdateGroup404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, "no such group"))}, nil
		}
		return nil, err
	}
	if body.Code != nil {
		current.Code = strings.TrimSpace(*body.Code)
	}
	if body.Program != nil {
		current.Program = strings.TrimSpace(*body.Program)
	}
	if body.CourseYear != nil {
		current.CourseYear = int(*body.CourseYear)
	}
	if current.Code == "" {
		return bad("code must not be empty"), nil
	}

	stored, err := s.opts.Board.Repo().UpdateGroup(ctx, current)
	if err != nil {
		if errors.Is(err, repo.ErrConflict) {
			return UpdateGroup409JSONResponse{ConflictJSONResponse(errorBody(CodeConflict, err.Error()))}, nil
		}
		return nil, err
	}
	s.refresh(s.opts.DefaultBuilding)
	s.log.Info("group updated", slog.String("id", stored.ID.String()))
	return UpdateGroup200JSONResponse(groupDTO(stored)), nil
}

// DeleteGroup removes a student group that attends nothing.
func (s *Server) DeleteGroup(ctx context.Context, request DeleteGroupRequestObject) (DeleteGroupResponseObject, error) {
	if err := s.opts.Board.Repo().DeleteGroup(ctx, request.Id); err != nil {
		switch {
		case errors.Is(err, repo.ErrNotFound):
			return DeleteGroup404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, "no such group"))}, nil
		case errors.Is(err, repo.ErrConflict):
			return DeleteGroup409JSONResponse{ConflictJSONResponse(errorBody(CodeConflict, err.Error()))}, nil
		default:
			return nil, err
		}
	}
	s.refresh(s.opts.DefaultBuilding)
	s.log.Info("group deleted", slog.String("id", request.Id.String()))
	return DeleteGroup204Response{}, nil
}

// -------------------------------------------------------------- courses --

// CreateCourse adds a subject.
func (s *Server) CreateCourse(ctx context.Context, request CreateCourseRequestObject) (CreateCourseResponseObject, error) {
	bad := func(msg string) CreateCourseResponseObject {
		return CreateCourse400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, msg))}
	}
	if request.Body == nil {
		return bad("a body is required"), nil
	}
	body := *request.Body
	code, title := strings.TrimSpace(body.Code), strings.TrimSpace(body.Title)
	if code == "" || title == "" {
		return bad("code and title must not be empty"), nil
	}

	stored, err := s.opts.Board.Repo().InsertCourse(ctx, domain.Course{
		Code: code, Title: title, Department: strings.TrimSpace(deref(body.Department)),
	})
	if err != nil {
		if errors.Is(err, repo.ErrConflict) {
			return CreateCourse409JSONResponse{ConflictJSONResponse(errorBody(CodeConflict, err.Error()))}, nil
		}
		return nil, err
	}
	s.refresh(s.opts.DefaultBuilding)
	s.log.Info("course created", slog.String("id", stored.ID.String()))
	return CreateCourse201JSONResponse(courseDTO(stored)), nil
}

// UpdateCourse edits a subject. The title is on every board row.
func (s *Server) UpdateCourse(ctx context.Context, request UpdateCourseRequestObject) (UpdateCourseResponseObject, error) {
	bad := func(msg string) UpdateCourseResponseObject {
		return UpdateCourse400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, msg))}
	}
	if request.Body == nil {
		return bad("a body is required"), nil
	}
	body := *request.Body
	if body.Code == nil && body.Title == nil && body.Department == nil {
		return bad("nothing to change"), nil
	}

	current, err := s.opts.Board.Repo().GetCourseByID(ctx, request.Id)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return UpdateCourse404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, "no such course"))}, nil
		}
		return nil, err
	}
	if body.Code != nil {
		current.Code = strings.TrimSpace(*body.Code)
	}
	if body.Title != nil {
		current.Title = strings.TrimSpace(*body.Title)
	}
	if body.Department != nil {
		current.Department = strings.TrimSpace(*body.Department)
	}
	if current.Code == "" || current.Title == "" {
		return bad("code and title must not be empty"), nil
	}

	stored, err := s.opts.Board.Repo().UpdateCourse(ctx, current)
	if err != nil {
		if errors.Is(err, repo.ErrConflict) {
			return UpdateCourse409JSONResponse{ConflictJSONResponse(errorBody(CodeConflict, err.Error()))}, nil
		}
		return nil, err
	}
	s.refresh(s.opts.DefaultBuilding)
	s.log.Info("course updated", slog.String("id", stored.ID.String()))
	return UpdateCourse200JSONResponse(courseDTO(stored)), nil
}

// DeleteCourse removes a subject nothing teaches.
func (s *Server) DeleteCourse(ctx context.Context, request DeleteCourseRequestObject) (DeleteCourseResponseObject, error) {
	if err := s.opts.Board.Repo().DeleteCourse(ctx, request.Id); err != nil {
		switch {
		case errors.Is(err, repo.ErrNotFound):
			return DeleteCourse404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, "no such course"))}, nil
		case errors.Is(err, repo.ErrConflict):
			return DeleteCourse409JSONResponse{ConflictJSONResponse(errorBody(CodeConflict, err.Error()))}, nil
		default:
			return nil, err
		}
	}
	s.refresh(s.opts.DefaultBuilding)
	s.log.Info("course deleted", slog.String("id", request.Id.String()))
	return DeleteCourse204Response{}, nil
}

// --------------------------------------------------------------- helpers --

// dedupe removes blanks and repeats while keeping the caller's order.
func dedupe(in []string) []string {
	seen := make(map[string]bool, len(in))
	out := make([]string, 0, len(in))
	for _, v := range in {
		v = strings.TrimSpace(v)
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}

// missingCodes reports which of the requested codes the store did not resolve.
func missingCodes(wanted []string, found []domain.GroupRef) []string {
	have := make(map[string]bool, len(found))
	for _, g := range found {
		have[g.Code] = true
	}
	var missing []string
	for _, code := range wanted {
		if !have[code] {
			missing = append(missing, code)
		}
	}
	sort.Strings(missing)
	return missing
}
