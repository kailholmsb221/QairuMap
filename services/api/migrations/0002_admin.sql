-- Admin API — indexes for the live timetable editor.
--
-- `POST /api/v1/admin/lessons` and `PATCH /api/v1/admin/lessons/{id}` read every
-- lesson of one semester + weekday to decide whether the room, the teacher or a
-- group is already taken, and the reference-editing endpoints ask "is this
-- teacher / group / course still used anywhere?" before they allow a delete.
-- Both are hot paths of the admin panel; 0001's only lesson index is
-- (semester_id, weekday), which the first query uses and the others do not.
--
-- Nothing here changes a column: `courses.department`, `teachers.department`,
-- `student_groups.program` and `student_groups.course_year` are already
-- nullable in 0001, so the PATCH endpoints need no schema change.

-- +goose Up
-- +goose StatementBegin
create index if not exists lessons_room_weekday_slot_idx on lessons (room_id, weekday, slot_id);
-- +goose StatementEnd

-- +goose StatementBegin
create index if not exists lessons_teacher_weekday_idx on lessons (teacher_id, weekday);
-- +goose StatementEnd

-- +goose StatementBegin
create index if not exists lessons_course_idx on lessons (course_id);
-- +goose StatementEnd

-- +goose StatementBegin
create index if not exists lesson_groups_group_idx on lesson_groups (group_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
drop index if exists lesson_groups_group_idx;
-- +goose StatementEnd
-- +goose StatementBegin
drop index if exists lessons_course_idx;
-- +goose StatementEnd
-- +goose StatementBegin
drop index if exists lessons_teacher_weekday_idx;
-- +goose StatementEnd
-- +goose StatementBegin
drop index if exists lessons_room_weekday_slot_idx;
-- +goose StatementEnd
