-- Unified search. ILIKE is Unicode-aware in PostgreSQL, so a Cyrillic query
-- such as `по2308` matches `ПО2308` on a UTF-8 database. Exact and prefix
-- matches rank above substring ones.
-- name: SearchTeachers :many
select t.id, t.short_name, t.full_name, t.department
from teachers t
where t.short_name ilike '%' || @q || '%' or t.full_name ilike '%' || @q || '%'
order by (t.short_name ilike @q || '%') desc, t.short_name
limit @lim;

-- name: SearchGroups :many
select g.id, g.code, g.program, g.course_year
from student_groups g
where g.code ilike '%' || @q || '%' or g.program ilike '%' || @q || '%'
order by (g.code ilike @q || '%') desc, g.code
limit @lim;

-- name: SearchRooms :many
select r.id, r.code, r.name, r.type, f.number as floor_number
from rooms r
join floors f on f.id = r.floor_id
where r.code ilike '%' || @q || '%' or r.name ilike '%' || @q || '%'
   or r.aliases ilike '%' || @q || '%'
order by (r.code ilike @q || '%') desc, f.number, r.code
limit @lim;

-- name: SearchCourses :many
select c.id, c.code, c.title
from courses c
where c.code ilike '%' || @q || '%' or c.title ilike '%' || @q || '%'
order by (c.code ilike @q || '%') desc, c.code
limit @lim;

-- name: GetTeacherByID :one
select t.id, t.short_name, t.full_name, t.department from teachers t where t.id = @id limit 1;

-- name: GetGroupByCode :one
select g.id, g.code, g.program, g.course_year from student_groups g where g.code = @code limit 1;

-- name: GetCourseByCode :one
select c.id, c.code, c.title, c.department from courses c where c.code = @code limit 1;
