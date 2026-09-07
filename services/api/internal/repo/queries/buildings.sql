-- name: ListBuildings :many
select b.id, b.code, b.name, b.timezone,
       (select count(*) from floors f where f.building_id = b.id)::int as floor_count
from buildings b
order by b.code;

-- name: GetBuildingByCode :one
select b.id, b.code, b.name, b.timezone,
       (select count(*) from floors f where f.building_id = b.id)::int as floor_count
from buildings b
where b.code = @code
limit 1;

-- name: ListFloors :many
select f.id, f.number, f.plan_key
from floors f
where f.building_id = @building_id
order by f.number;

-- Every space of a building, ordered by floor then room code, exactly as the
-- map and the snapshot list them.
-- name: ListRoomsByBuilding :many
select r.id, r.code, r.name, r.type, r.wing, r.schedulable, r.capacity, r.geometry,
       f.id as floor_id, f.number as floor_number, f.plan_key
from rooms r
join floors f on f.id = r.floor_id
where f.building_id = @building_id
order by f.number, r.code;

-- name: GetRoomByCode :one
select r.id, r.code, r.name, r.type, r.wing, r.schedulable, r.capacity, r.geometry,
       f.id as floor_id, f.number as floor_number, f.plan_key, f.building_id
from rooms r
join floors f on f.id = r.floor_id
where r.code = @code
limit 1;

-- name: ListTimeSlots :many
select ts.id, ts.idx, ts.starts_at, ts.ends_at
from time_slots ts
where ts.building_id = @building_id
order by ts.idx;

-- name: GetTimeSlotByIdx :one
select ts.id, ts.idx, ts.starts_at, ts.ends_at
from time_slots ts
where ts.building_id = @building_id and ts.idx = @idx
limit 1;

-- The semester that contains a local date.
-- name: GetSemesterByDate :one
select id, name, starts_on, ends_on, week1_parity
from semesters
where starts_on <= @date and ends_on >= @date
order by starts_on
limit 1;

-- Fallback for a `?date=` outside every term, so the board still resolves a
-- week number instead of answering 404.
-- name: GetClosestSemester :one
select id, name, starts_on, ends_on, week1_parity
from semesters
order by least(abs(starts_on - @date::date), abs(ends_on - @date::date)), starts_on
limit 1;

-- name: ListSemesters :many
select id, name, starts_on, ends_on, week1_parity from semesters order by starts_on;
