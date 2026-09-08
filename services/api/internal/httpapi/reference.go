package httpapi

import (
	"context"
	"errors"

	"github.com/kailholmes/campuslive/services/api/internal/repo"
)

// The reference-data reads. They carry no geometry and no schedule — they are
// the lists the admin panel's pickers need, and they stay unauthenticated like
// the rest of the read API.

// ListBuildingRooms returns every space of a building without its geometry.
func (s *Server) ListBuildingRooms(ctx context.Context, request ListBuildingRoomsRequestObject) (ListBuildingRoomsResponseObject, error) {
	building, err := s.opts.Board.Repo().GetBuilding(ctx, request.Code)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return ListBuildingRooms404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, "no such building"))}, nil
		}
		return nil, err
	}
	rooms, err := s.opts.Board.Repo().ListRooms(ctx, building.ID)
	if err != nil {
		return nil, err
	}
	out := make([]RoomInfo, 0, len(rooms))
	for _, r := range rooms {
		out = append(out, roomInfoDTO(r))
	}
	return ListBuildingRooms200JSONResponse{Rooms: out}, nil
}

// ListBuildingSlots returns the building's numbered lesson slots.
func (s *Server) ListBuildingSlots(ctx context.Context, request ListBuildingSlotsRequestObject) (ListBuildingSlotsResponseObject, error) {
	building, err := s.opts.Board.Repo().GetBuilding(ctx, request.Code)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return ListBuildingSlots404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, "no such building"))}, nil
		}
		return nil, err
	}
	slots, err := s.opts.Board.Repo().ListTimeSlots(ctx, building.ID)
	if err != nil {
		return nil, err
	}
	out := make([]SlotInfo, 0, len(slots))
	for _, sl := range slots {
		out = append(out, slotInfoDTO(sl))
	}
	return ListBuildingSlots200JSONResponse{Slots: out}, nil
}

// ListTeachers returns the whole teacher table.
func (s *Server) ListTeachers(ctx context.Context, _ ListTeachersRequestObject) (ListTeachersResponseObject, error) {
	teachers, err := s.opts.Board.Repo().ListTeachers(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]TeacherRef, 0, len(teachers))
	for _, t := range teachers {
		out = append(out, teacherRef(t))
	}
	return ListTeachers200JSONResponse{Teachers: out}, nil
}

// ListGroups returns every student group.
func (s *Server) ListGroups(ctx context.Context, _ ListGroupsRequestObject) (ListGroupsResponseObject, error) {
	groups, err := s.opts.Board.Repo().ListGroups(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]SearchGroup, 0, len(groups))
	for _, g := range groups {
		out = append(out, groupDTO(g))
	}
	return ListGroups200JSONResponse{Groups: out}, nil
}

// ListCourses returns every course.
func (s *Server) ListCourses(ctx context.Context, _ ListCoursesRequestObject) (ListCoursesResponseObject, error) {
	courses, err := s.opts.Board.Repo().ListCourses(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]SearchCourse, 0, len(courses))
	for _, c := range courses {
		out = append(out, courseDTO(c))
	}
	return ListCourses200JSONResponse{Courses: out}, nil
}

// ListSemesters returns every term.
func (s *Server) ListSemesters(ctx context.Context, _ ListSemestersRequestObject) (ListSemestersResponseObject, error) {
	semesters, err := s.opts.Board.Repo().ListSemesters(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Semester, 0, len(semesters))
	for _, sem := range semesters {
		out = append(out, semesterDTO(sem))
	}
	return ListSemesters200JSONResponse{Semesters: out}, nil
}
