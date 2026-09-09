-- Bulk inserts used by cmd/seed. They are `:batchexec`, so sqlc emits pgx
-- batches: seeding the whole building costs a handful of round trips rather
-- than one per row, while every column keeps its real type (enums included).

-- name: TruncateAll :exec
truncate table
  announcements,
  session_override_groups,
  session_overrides,
  lesson_groups,
  lessons,
  time_slots,
  semesters,
  courses,
  student_groups,
  teachers,
  rooms,
  floors,
  buildings
restart identity cascade;

-- name: InsertBuilding :one
insert into buildings (id, code, name, timezone) values (@id, @code, @name, @timezone)
returning id, code, name, timezone;

-- name: InsertFloor :batchexec
insert into floors (id, building_id, number, plan_key) values (@id, @building_id, @number, @plan_key);

-- name: InsertRoom :batchexec
insert into rooms (id, floor_id, code, name, type, wing, schedulable, capacity, geometry, aliases)
values (@id, @floor_id, @code, @name, @type, @wing, @schedulable, @capacity, @geometry, @aliases);

-- name: InsertTeacher :batchexec
insert into teachers (id, full_name, short_name, department)
values (@id, @full_name, @short_name, @department);

-- name: InsertGroup :batchexec
insert into student_groups (id, code, program, course_year)
values (@id, @code, @program, @course_year);

-- name: InsertCourse :batchexec
insert into courses (id, code, title, department)
values (@id, @code, @title, @department);

-- name: InsertTimeSlot :batchexec
insert into time_slots (id, building_id, idx, starts_at, ends_at)
values (@id, @building_id, @idx, @starts_at, @ends_at);

-- name: InsertSemester :one
insert into semesters (id, name, starts_on, ends_on, week1_parity)
values (@id, @name, @starts_on, @ends_on, @week1_parity)
returning id, name, starts_on, ends_on, week1_parity;

-- name: InsertLesson :batchexec
insert into lessons (id, semester_id, course_id, teacher_id, room_id, slot_id, weekday, parity, type, slot_span)
values (@id, @semester_id, @course_id, @teacher_id, @room_id, @slot_id, @weekday, @parity, @type, @slot_span);

-- name: InsertLessonGroup :batchexec
insert into lesson_groups (lesson_id, group_id) values (@lesson_id, @group_id) on conflict do nothing;

-- name: InsertSeedOverride :batchexec
insert into session_overrides (id, lesson_id, date, kind, new_room_id, new_teacher_id, delay_minutes, course_id, slot_id, note)
values (@id, @lesson_id, @date, @kind, @new_room_id, @new_teacher_id, @delay_minutes, @course_id, @slot_id, @note);

-- name: InsertSeedAnnouncement :batchexec
insert into announcements (id, building_id, text, severity, starts_at, ends_at)
values (@id, @building_id, @text, @severity, @starts_at, @ends_at);

-- name: CountRooms :one
select count(*)::int from rooms;

-- name: CountLessons :one
select count(*)::int from lessons;
