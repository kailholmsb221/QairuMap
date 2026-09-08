package httpapi_test

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kailholmes/campuslive/services/api/internal/httpapi"
)

// The reference endpoints the admin panel populates its selects from.
func TestContractReferenceData(t *testing.T) {
	f := newFixture(t)

	t.Run("rooms", func(t *testing.T) {
		resp, body := f.call(http.MethodGet, "/api/v1/buildings/A/rooms", nil, nil)
		require.Equal(t, http.StatusOK, resp.StatusCode)
		rooms := decode[httpapi.RoomList](t, body).Rooms
		require.Len(t, rooms, 51)

		var schedulable []string
		byCode := map[string]httpapi.RoomInfo{}
		for _, r := range rooms {
			byCode[r.Code] = r
			if r.Schedulable {
				schedulable = append(schedulable, r.Code)
			}
			require.Contains(t, []int{1, 2}, int(r.Floor))
		}
		require.ElementsMatch(t, []string{
			"100", "101", "CR",
			"200", "201", "204", "AI-LAB", "219", "222", "223", "224", "226", "226A",
		}, schedulable)

		require.Equal(t, "Мәжіліс залы", byCode["100"].Name)
		require.Equal(t, httpapi.RoomType("lecture"), byCode["100"].Type)
		require.Equal(t, httpapi.RoomType("lab"), byCode["AI-LAB"].Type)
	})

	t.Run("slots", func(t *testing.T) {
		resp, body := f.call(http.MethodGet, "/api/v1/buildings/A/slots", nil, nil)
		require.Equal(t, http.StatusOK, resp.StatusCode)
		slots := decode[httpapi.SlotList](t, body).Slots
		require.Len(t, slots, 10)
		require.EqualValues(t, 1, slots[0].Idx)
		require.Equal(t, "08:00", slots[0].StartsAt)
		require.Equal(t, "08:50", slots[0].EndsAt)
		require.Equal(t, "17:00", slots[9].StartsAt)
	})

	t.Run("teachers, groups, courses, semesters", func(t *testing.T) {
		_, body := f.call(http.MethodGet, "/api/v1/teachers", nil, nil)
		teachers := decode[httpapi.TeacherList](t, body).Teachers
		require.Len(t, teachers, 12)
		require.Equal(t, "Преподаватель 1", teachers[0].ShortName)

		_, body = f.call(http.MethodGet, "/api/v1/groups", nil, nil)
		groups := decode[httpapi.GroupList](t, body).Groups
		require.Len(t, groups, 24)

		_, body = f.call(http.MethodGet, "/api/v1/courses", nil, nil)
		courses := decode[httpapi.CourseList](t, body).Courses
		require.Len(t, courses, 5, "five subjects exist in the whole university")
		var codes []string
		for _, c := range courses {
			codes = append(codes, c.Code)
		}
		require.ElementsMatch(t, []string{"AIF1303", "FC1301", "HK1105", "ICT1103", "IP1302"}, codes)

		_, body = f.call(http.MethodGet, "/api/v1/semesters", nil, nil)
		semesters := decode[httpapi.SemesterList](t, body).Semesters
		require.NotEmpty(t, semesters)
		require.Equal(t, "2026-08-24", semesters[0].StartsOn)
	})
}

// The recurring schedule: create, read, change and delete a class.
func TestContractAdminLessonLifecycle(t *testing.T) {
	f := newFixture(t)

	course := f.courseByCode("IP1302")
	teacher := f.someTeacher()
	semester := f.someSemester()

	// Saturday is empty in the seed, so it is a clean canvas.
	create := map[string]any{
		"semesterId": semester.Id.String(),
		"courseId":   course.Id.String(),
		"teacherId":  teacher.Id.String(),
		"roomCode":   "100",
		"slotIdx":    3,
		"weekday":    6,
		"parity":     "all",
		"type":       "lecture",
		"groupCodes": []string{"Группа 1", "Группа 2"},
	}

	resp, body := f.call(http.MethodPost, "/api/v1/admin/lessons", create, f.adminHeaders())
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	made := decode[httpapi.Lesson](t, body)
	require.Equal(t, "100", made.RoomCode)
	require.Equal(t, "IP1302", made.CourseCode)
	require.EqualValues(t, 3, made.SlotIdx)
	require.EqualValues(t, 6, made.Weekday)
	require.Equal(t, "10:00", made.StartsAt)
	require.Len(t, made.Groups, 2)

	defer func() {
		f.call(http.MethodDelete, "/api/v1/admin/lessons/"+made.Id.String(), nil, f.adminHeaders())
	}()

	t.Run("it is listed", func(t *testing.T) {
		_, body := f.call(http.MethodGet, "/api/v1/admin/lessons?weekday=6", nil, f.adminHeaders())
		list := decode[httpapi.LessonList](t, body).Lessons
		require.Len(t, list, 1)
		require.Equal(t, made.Id, list[0].Id)
	})

	t.Run("the room clashes", func(t *testing.T) {
		resp, body := f.call(http.MethodPost, "/api/v1/admin/lessons", create, f.adminHeaders())
		require.Equal(t, http.StatusConflict, resp.StatusCode)
		err := decode[httpapi.Error](t, body)
		require.Equal(t, httpapi.ErrorBodyCode("conflict"), err.Error.Code)
		require.Contains(t, err.Error.Message, "100")
	})

	t.Run("a group clashes even in another room", func(t *testing.T) {
		other := f.otherTeacher(teacher.Id.String())
		clash := map[string]any{}
		for k, v := range create {
			clash[k] = v
		}
		clash["roomCode"] = "224"
		clash["teacherId"] = other.Id.String()
		clash["groupCodes"] = []string{"Группа 2"}
		resp, body := f.call(http.MethodPost, "/api/v1/admin/lessons", clash, f.adminHeaders())
		require.Equal(t, http.StatusConflict, resp.StatusCode)
		require.Contains(t, decode[httpapi.Error](t, body).Error.Message, "Группа 2")
	})

	t.Run("a room that holds no classes is refused", func(t *testing.T) {
		bad := map[string]any{}
		for k, v := range create {
			bad[k] = v
		}
		bad["roomCode"] = "CAFE"
		bad["slotIdx"] = 8
		resp, body := f.call(http.MethodPost, "/api/v1/admin/lessons", bad, f.adminHeaders())
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		require.Contains(t, decode[httpapi.Error](t, body).Error.Message, "schedulable")
	})

	t.Run("a lab cannot be taught in a lecture hall", func(t *testing.T) {
		bad := map[string]any{}
		for k, v := range create {
			bad[k] = v
		}
		bad["type"] = "lab"
		bad["slotIdx"] = 8
		resp, _ := f.call(http.MethodPost, "/api/v1/admin/lessons", bad, f.adminHeaders())
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})

	t.Run("patch moves it", func(t *testing.T) {
		resp, body := f.call(http.MethodPatch, "/api/v1/admin/lessons/"+made.Id.String(),
			map[string]any{"roomCode": "224", "slotIdx": 5}, f.adminHeaders())
		require.Equal(t, http.StatusOK, resp.StatusCode)
		moved := decode[httpapi.Lesson](t, body)
		require.Equal(t, "224", moved.RoomCode)
		require.EqualValues(t, 5, moved.SlotIdx)
		require.Equal(t, "12:00", moved.StartsAt)
		// patching to its own placement is not a self-conflict
		resp, _ = f.call(http.MethodPatch, "/api/v1/admin/lessons/"+made.Id.String(),
			map[string]any{"roomCode": "224"}, f.adminHeaders())
		require.Equal(t, http.StatusOK, resp.StatusCode)
	})

	t.Run("delete", func(t *testing.T) {
		resp, _ := f.call(http.MethodDelete, "/api/v1/admin/lessons/"+made.Id.String(), nil, f.adminHeaders())
		require.Equal(t, http.StatusNoContent, resp.StatusCode)

		_, body := f.call(http.MethodGet, "/api/v1/admin/lessons?weekday=6", nil, f.adminHeaders())
		require.Empty(t, decode[httpapi.LessonList](t, body).Lessons)

		resp, _ = f.call(http.MethodDelete, "/api/v1/admin/lessons/"+made.Id.String(), nil, f.adminHeaders())
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
	})
}

// Renaming a placeholder must reach the board, because that is the whole point
// of `Преподаватель 1` being a placeholder.
func TestContractAdminRenamesReachTheBoard(t *testing.T) {
	f := newFixture(t)

	teacher := f.someTeacher()
	original := teacher.ShortName

	resp, body := f.call(http.MethodPatch, "/api/v1/admin/teachers/"+teacher.Id.String(),
		map[string]any{"shortName": "Тестов Т.", "fullName": "Тестов Тест Тестович", "department": "Кафедра"},
		f.adminHeaders())
	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, "Тестов Т.", decode[httpapi.TeacherRef](t, body).ShortName)

	t.Cleanup(func() {
		f.call(http.MethodPatch, "/api/v1/admin/teachers/"+teacher.Id.String(),
			map[string]any{"shortName": original, "fullName": original, "department": ""}, f.adminHeaders())
	})

	_, body = f.call(http.MethodGet, "/api/v1/buildings/A/board", nil, nil)
	snap := decode[httpapi.Snapshot](t, body)
	var seen bool
	for _, s := range append(append([]httpapi.SessionView{}, snap.Now...), snap.Next...) {
		if s.Teacher.ShortName == "Тестов Т." {
			seen = true
		}
	}
	require.True(t, seen, "the board must show the new name straight away")

	t.Run("a teacher who still teaches cannot be deleted", func(t *testing.T) {
		resp, body := f.call(http.MethodDelete, "/api/v1/admin/teachers/"+teacher.Id.String(), nil, f.adminHeaders())
		require.Equal(t, http.StatusConflict, resp.StatusCode)
		require.Equal(t, httpapi.ErrorBodyCode("conflict"), decode[httpapi.Error](t, body).Error.Code)
	})

	t.Run("groups and courses rename too", func(t *testing.T) {
		_, body := f.call(http.MethodGet, "/api/v1/groups", nil, nil)
		group := decode[httpapi.GroupList](t, body).Groups[0]
		was := group.Code
		resp, body := f.call(http.MethodPatch, "/api/v1/admin/groups/"+group.Id.String(),
			map[string]any{"code": "ПО2308"}, f.adminHeaders())
		require.Equal(t, http.StatusOK, resp.StatusCode)
		require.Equal(t, "ПО2308", decode[httpapi.SearchGroup](t, body).Code)
		f.call(http.MethodPatch, "/api/v1/admin/groups/"+group.Id.String(),
			map[string]any{"code": was}, f.adminHeaders())

		course := f.courseByCode("HK1105")
		resp, body = f.call(http.MethodPatch, "/api/v1/admin/courses/"+course.Id.String(),
			map[string]any{"title": "История"}, f.adminHeaders())
		require.Equal(t, http.StatusOK, resp.StatusCode)
		require.Equal(t, "История", decode[httpapi.SearchCourse](t, body).Title)
		f.call(http.MethodPatch, "/api/v1/admin/courses/"+course.Id.String(),
			map[string]any{"title": "История Казахстана"}, f.adminHeaders())
	})
}

func TestContractAdminLessonRequiresKey(t *testing.T) {
	f := newFixture(t)
	for _, c := range []struct{ method, path string }{
		{http.MethodGet, "/api/v1/admin/lessons"},
		{http.MethodPost, "/api/v1/admin/lessons"},
		{http.MethodPatch, "/api/v1/admin/lessons/00000000-0000-0000-0000-000000000000"},
		{http.MethodDelete, "/api/v1/admin/lessons/00000000-0000-0000-0000-000000000000"},
		{http.MethodPost, "/api/v1/admin/teachers"},
	} {
		t.Run(fmt.Sprintf("%s %s", c.method, c.path), func(t *testing.T) {
			resp, body := f.call(c.method, c.path, map[string]any{}, nil)
			require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
			require.Equal(t, httpapi.ErrorBodyCode("unauthorized"), decode[httpapi.Error](t, body).Error.Code)
		})
	}
}

// A new class must reach an open board over SSE inside the one-second budget.
func TestSSEAdminLessonReachesTheStream(t *testing.T) {
	f := newFixture(t)

	resp, err := http.Get(f.server.URL + "/api/v1/events?building=A")
	require.NoError(t, err)
	defer resp.Body.Close()

	events := make(chan sseEvent, 8)
	go readSSE(resp.Body, events)
	require.Equal(t, "snapshot", waitEvent(t, events, 3*time.Second).name)

	course := f.courseByCode("IP1302")
	teacher := f.freeTeacherAt(2, 10)

	// A free Tuesday cell inside the demo day: the conference room at 17:00.
	postResp, postBody := f.call(http.MethodPost, "/api/v1/admin/lessons", map[string]any{
		"courseId": course.Id.String(), "teacherId": teacher.Id.String(),
		"roomCode": "CR", "slotIdx": 10, "weekday": 2, "parity": "all",
		"type": "practice", "groupCodes": []string{"Группа 1"},
	}, f.adminHeaders())
	require.Equal(t, http.StatusCreated, postResp.StatusCode)
	made := decode[httpapi.Lesson](t, postBody)

	after := waitEvent(t, events, time.Second)
	require.Equal(t, "snapshot", after.name, "a new class must publish a snapshot within a second")

	snap := decode[httpapi.Snapshot](t, []byte(after.data))
	_, tl := f.call(http.MethodGet, "/api/v1/buildings/A/timeline?date=2026-09-08", nil, nil)
	var onTimeline bool
	for _, s := range decode[httpapi.Timeline](t, tl).Sessions {
		if s.LessonId != nil && *s.LessonId == made.Id {
			onTimeline = true
		}
	}
	require.True(t, onTimeline, "the new class is materialised on the day")
	require.NotEmpty(t, snap.Rooms)

	// Deleting it publishes another snapshot just as fast.
	delResp, _ := f.call(http.MethodDelete, "/api/v1/admin/lessons/"+made.Id.String(), nil, f.adminHeaders())
	require.Equal(t, http.StatusNoContent, delResp.StatusCode)
	require.Equal(t, "snapshot", waitEvent(t, events, time.Second).name)
}
