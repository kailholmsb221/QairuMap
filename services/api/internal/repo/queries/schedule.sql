-- Every lesson template that could run on one weekday of one semester, joined
-- with course, teacher, room, floor, slot and the attending group codes.
-- Parity filtering happens in the engine, not here: the engine owns the week
-- arithmetic.
-- name: ListLessonsForWeekday :many
select
  l.id, l.weekday, l.parity, l.type, l.slot_span,
  c.id     as course_id,
  c.code   as course_code,
  c.title  as course_title,
  c.department as course_department,
  t.id     as teacher_id,
  t.full_name  as teacher_full_name,
  t.short_name as teacher_short_name,
  t.department as teacher_department,
  r.id     as room_id,
  r.code   as room_code,
  r.name   as room_name,
  r.type   as room_type,
  r.wing   as room_wing,
  r.schedulable as room_schedulable,
  r.capacity    as room_capacity,
  r.geometry    as room_geometry,
  f.number as room_floor,
  ts.id    as slot_id,
  ts.idx   as slot_idx,
  ts.starts_at as slot_starts_at,
  ts.ends_at   as slot_ends_at,
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
where l.semester_id = @semester_id
  and f.building_id = @building_id
  and l.weekday = @weekday
group by l.id, c.id, t.id, r.id, f.number, ts.id
order by ts.starts_at, r.code, l.id;

-- Every point change recorded for one local date in one building.
-- name: ListOverridesForDate :many
select
  o.id, o.lesson_id, o.date, o.kind, o.delay_minutes, o.note, o.created_at,
  nr.id     as new_room_id,
  nr.code   as new_room_code,
  nr.name   as new_room_name,
  nr.type   as new_room_type,
  nr.wing   as new_room_wing,
  nr.schedulable as new_room_schedulable,
  nr.capacity    as new_room_capacity,
  nr.geometry    as new_room_geometry,
  nf.number as new_room_floor,
  nt.id     as new_teacher_id,
  nt.full_name  as new_teacher_full_name,
  nt.short_name as new_teacher_short_name,
  nt.department as new_teacher_department,
  c.id      as course_id,
  c.code    as course_code,
  c.title   as course_title,
  ts.id     as slot_id,
  ts.idx    as slot_idx,
  ts.starts_at as slot_starts_at,
  ts.ends_at   as slot_ends_at,
  coalesce(
    array_agg(g.code order by g.code) filter (where g.code is not null),
    '{}'
  )::text[] as group_codes
from session_overrides o
left join rooms      nr on nr.id = o.new_room_id
left join floors     nf on nf.id = nr.floor_id
left join teachers   nt on nt.id = o.new_teacher_id
left join courses    c  on c.id  = o.course_id
left join time_slots ts on ts.id = o.slot_id
left join session_override_groups og on og.override_id = o.id
left join student_groups g on g.id = og.group_id
left join lessons  ol on ol.id = o.lesson_id
left join rooms    orr on orr.id = ol.room_id
left join floors   ofl on ofl.id = orr.floor_id
where o.date = @date
  and (ofl.building_id = @building_id or nf.building_id = @building_id or (ofl.id is null and nf.id is null))
group by o.id, nr.id, nf.number, nt.id, c.id, ts.id
order by o.created_at, o.id;

-- name: GetOverride :one
select o.id, o.lesson_id, o.date, o.kind, o.delay_minutes, o.note, o.created_at,
       nr.code as new_room_code, o.new_teacher_id,
       c.code  as course_code,
       xr.code as room_code,
       ts.idx  as slot_idx
from session_overrides o
left join rooms      nr on nr.id = o.new_room_id
left join rooms      xr on xr.id = o.new_room_id and o.kind = 'extra'
left join courses    c  on c.id  = o.course_id
left join time_slots ts on ts.id = o.slot_id
where o.id = @id
limit 1;

-- name: InsertOverride :one
insert into session_overrides (lesson_id, date, kind, new_room_id, new_teacher_id, delay_minutes, course_id, slot_id, note)
values (@lesson_id, @date, @kind, @new_room_id, @new_teacher_id, @delay_minutes, @course_id, @slot_id, @note)
returning id, lesson_id, date, kind, new_room_id, new_teacher_id, delay_minutes, course_id, slot_id, note, created_at;

-- name: InsertOverrideGroups :exec
insert into session_override_groups (override_id, group_id)
select @override_id::uuid, g.id from student_groups g where g.code = any(@codes::text[]);

-- name: DeleteOverride :execrows
delete from session_overrides where id = @id;

-- name: LessonExists :one
select exists (select 1 from lessons where id = @id) as found;

-- name: ListAnnouncements :many
select a.id, a.text, a.severity, a.starts_at, a.ends_at, b.code as building_code
from announcements a
join buildings b on b.id = a.building_id
where b.code = @building_code and a.starts_at <= @at and a.ends_at > @at
order by a.starts_at, a.id;

-- name: InsertAnnouncement :one
insert into announcements (building_id, text, severity, starts_at, ends_at)
select b.id, @text, @severity, @starts_at, @ends_at from buildings b where b.code = @building_code
returning id, building_id, text, severity, starts_at, ends_at;
