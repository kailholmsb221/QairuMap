-- Queries behind the admin panel: the recurring schedule (`lessons`) and the
-- reference tables the panel renames. Everything the read API needs already
-- lives in buildings.sql / schedule.sql / search.sql; nothing here is used by
-- the board.

-- --------------------------------------------------------- reference reads --

-- name: ListAllTeachers :many
select t.id, t.full_name, t.short_name, t.department
from teachers t
order by t.short_name, t.id;

-- name: ListAllGroups :many
select g.id, g.code, g.program, g.course_year
from student_groups g
order by g.code, g.id;

-- name: ListAllCourses :many
select c.id, c.code, c.title, c.department
from courses c
order by c.code, c.id;

-- name: GetGroupByID :one
select g.id, g.code, g.program, g.course_year from student_groups g where g.id = @id limit 1;

-- name: GetCourseByID :one
select c.id, c.code, c.title, c.department from courses c where c.id = @id limit 1;

-- Resolve a list of group codes to ids. The caller compares the row count with
-- the number of codes it asked for to spot a code that does not exist.
-- name: ListGroupsByCodes :many
select g.id, g.code from student_groups g where g.code = any(@codes::text[]) order by g.code;

-- ------------------------------------------------------ recurring schedule --

-- Every lesson template of one building, with the names the admin panel shows
-- and the codes of the groups attending. Each filter is optional: a NULL leaves
-- that dimension unrestricted. The conflict checker calls it with the weekday
-- filter alone.
-- name: ListLessonsAdmin :many
select
  l.id, l.semester_id, l.weekday, l.parity, l.type, l.slot_span,
  c.id     as course_id,
  c.code   as course_code,
  c.title  as course_title,
  t.id     as teacher_id,
  t.short_name as teacher_name,
  r.id     as room_id,
  r.code   as room_code,
  r.type   as room_type,
  r.schedulable as room_schedulable,
  ts.id    as slot_id,
  ts.idx   as slot_idx,
  coalesce(
    array_agg(g.id order by g.code) filter (where g.id is not null),
    '{}'
  )::uuid[] as group_ids,
  coalesce(
    array_agg(g.code order by g.code) filter (where g.code is not null),
    '{}'
  )::text[] as group_codes
from lessons l
join courses    c  on c.id  = l.course_id
join teachers   t  on t.id  = l.teacher_id
join rooms      r  on r.id  = l.room_id
join floors     f  on f.id  = r.floor_id
join time_slots ts on ts.id = l.slot_id
left join lesson_groups  lg on lg.lesson_id = l.id
left join student_groups g  on g.id = lg.group_id
where f.building_id = @building_id
  and l.semester_id = @semester_id
  and (sqlc.narg('weekday')::smallint is null or l.weekday = sqlc.narg('weekday')::smallint)
  and (sqlc.narg('room_code')::text is null or r.code = sqlc.narg('room_code')::text)
  and (sqlc.narg('teacher_id')::uuid is null or l.teacher_id = sqlc.narg('teacher_id')::uuid)
  and (sqlc.narg('group_code')::text is null or exists (
        select 1 from lesson_groups lg2
        join student_groups g2 on g2.id = lg2.group_id
        where lg2.lesson_id = l.id and g2.code = sqlc.narg('group_code')::text))
group by l.id, c.id, t.id, r.id, ts.id
order by l.weekday, ts.idx, r.code, l.id;

-- One lesson template, in the same shape.
-- name: GetLessonAdmin :one
select
  l.id, l.semester_id, l.weekday, l.parity, l.type, l.slot_span,
  c.id     as course_id,
  c.code   as course_code,
  c.title  as course_title,
  t.id     as teacher_id,
  t.short_name as teacher_name,
  r.id     as room_id,
  r.code   as room_code,
  r.type   as room_type,
  r.schedulable as room_schedulable,
  ts.id    as slot_id,
  ts.idx   as slot_idx,
  coalesce(
    array_agg(g.id order by g.code) filter (where g.id is not null),
    '{}'
  )::uuid[] as group_ids,
  coalesce(
    array_agg(g.code order by g.code) filter (where g.code is not null),
    '{}'
  )::text[] as group_codes
from lessons l
join courses    c  on c.id  = l.course_id
join teachers   t  on t.id  = l.teacher_id
join rooms      r  on r.id  = l.room_id
join time_slots ts on ts.id = l.slot_id
left join lesson_groups  lg on lg.lesson_id = l.id
left join student_groups g  on g.id = lg.group_id
where l.id = @id
group by l.id, c.id, t.id, r.id, ts.id
limit 1;

-- name: InsertLessonAdmin :one
insert into lessons (semester_id, course_id, teacher_id, room_id, slot_id, weekday, parity, type, slot_span)
values (@semester_id, @course_id, @teacher_id, @room_id, @slot_id, @weekday, @parity, @type, @slot_span)
returning id;

-- The handler merges the patch with the stored row and writes every column, so
-- one statement covers every combination of optional fields.
-- name: UpdateLessonAdmin :execrows
update lessons
set semester_id = @semester_id,
    course_id   = @course_id,
    teacher_id  = @teacher_id,
    room_id     = @room_id,
    slot_id     = @slot_id,
    weekday     = @weekday,
    parity      = @parity,
    type        = @type,
    slot_span   = @slot_span
where id = @id;

-- name: DeleteLessonAdmin :execrows
delete from lessons where id = @id;

-- name: DeleteLessonGroups :exec
delete from lesson_groups where lesson_id = @lesson_id;

-- name: InsertLessonGroupsByCode :exec
insert into lesson_groups (lesson_id, group_id)
select @lesson_id::uuid, g.id from student_groups g where g.code = any(@codes::text[])
on conflict do nothing;

-- --------------------------------------------------------- teacher editing --

-- name: InsertTeacherAdmin :one
insert into teachers (full_name, short_name, department)
values (@full_name, @short_name, @department)
returning id, full_name, short_name, department;

-- name: UpdateTeacherAdmin :one
update teachers set full_name = @full_name, short_name = @short_name, department = @department
where id = @id
returning id, full_name, short_name, department;

-- name: DeleteTeacherAdmin :execrows
delete from teachers where id = @id;

-- name: CountTeacherUsage :one
select (
  (select count(*) from lessons l where l.teacher_id = @id) +
  (select count(*) from session_overrides o where o.new_teacher_id = @id)
)::int as uses;

-- ----------------------------------------------------------- group editing --

-- name: InsertGroupAdmin :one
insert into student_groups (code, program, course_year)
values (@code, @program, @course_year)
returning id, code, program, course_year;

-- name: UpdateGroupAdmin :one
update student_groups set code = @code, program = @program, course_year = @course_year
where id = @id
returning id, code, program, course_year;

-- name: DeleteGroupAdmin :execrows
delete from student_groups where id = @id;

-- name: CountGroupUsage :one
select (
  (select count(*) from lesson_groups lg where lg.group_id = @id) +
  (select count(*) from session_override_groups og where og.group_id = @id)
)::int as uses;

-- ---------------------------------------------------------- course editing --

-- name: InsertCourseAdmin :one
insert into courses (code, title, department)
values (@code, @title, @department)
returning id, code, title, department;

-- name: UpdateCourseAdmin :one
update courses set code = @code, title = @title, department = @department
where id = @id
returning id, code, title, department;

-- name: DeleteCourseAdmin :execrows
delete from courses where id = @id;

-- name: CountCourseUsage :one
select (
  (select count(*) from lessons l where l.course_id = @id) +
  (select count(*) from session_overrides o where o.course_id = @id)
)::int as uses;
