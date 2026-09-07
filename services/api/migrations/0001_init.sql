-- CampusLive initial schema — ARCHITECTURE.md §6.
--
-- Every absolute instant is `timestamptz` (stored UTC); time-of-day columns
-- (`time_slots.starts_at` / `ends_at`) are LOCAL to `buildings.timezone` and are
-- resolved to absolute instants by the engine, never by the database.

-- +goose Up
-- +goose StatementBegin
create extension if not exists pgcrypto;
-- +goose StatementEnd

-- +goose StatementBegin
create table buildings (
  id       uuid primary key default gen_random_uuid(),
  code     text unique not null,
  name     text not null,
  timezone text not null default 'Asia/Almaty'
);
-- +goose StatementEnd

-- +goose StatementBegin
create table floors (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  number      int  not null,
  plan_key    text not null,
  unique (building_id, number)
);
-- +goose StatementEnd

-- +goose StatementBegin
create type room_type as enum ('lecture','seminar','lab','coworking','admin','service','void');
-- +goose StatementEnd

-- +goose StatementBegin
create type wing as enum ('north','south','core');
-- +goose StatementEnd

-- +goose StatementBegin
create table rooms (
  id          uuid primary key default gen_random_uuid(),
  floor_id    uuid not null references floors(id) on delete cascade,
  code        text unique not null,
  name        text not null,
  type        room_type not null default 'seminar',
  wing        wing not null,
  schedulable boolean not null default true,
  capacity    int,
  -- {"path":"M…Z","bbox":{"x":…,"y":…,"w":…,"h":…},"label":{"x":…,"y":…}}
  geometry    jsonb not null
);
-- +goose StatementEnd

-- +goose StatementBegin
create index rooms_floor_idx on rooms (floor_id, code);
-- +goose StatementEnd

-- +goose StatementBegin
create table teachers (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  short_name text not null,
  department text,
  avatar_url text
);
-- +goose StatementEnd

-- +goose StatementBegin
create table student_groups (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  program     text,
  course_year smallint
);
-- +goose StatementEnd

-- +goose StatementBegin
create table courses (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  title      text not null,
  department text
);
-- +goose StatementEnd

-- +goose StatementBegin
create table semesters (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  starts_on    date not null,
  ends_on      date not null,
  week1_parity text not null default 'odd' check (week1_parity in ('odd','even'))
);
-- +goose StatementEnd

-- +goose StatementBegin
create table time_slots (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  idx         smallint not null,
  starts_at   time not null,
  ends_at     time not null,
  unique (building_id, idx)
);
-- +goose StatementEnd

-- +goose StatementBegin
create type lesson_type as enum ('lecture','practice','lab');
-- +goose StatementEnd

-- +goose StatementBegin
create type week_parity as enum ('all','odd','even');
-- +goose StatementEnd

-- +goose StatementBegin
create table lessons (
  id          uuid primary key default gen_random_uuid(),
  semester_id uuid not null references semesters(id),
  course_id   uuid not null references courses(id),
  teacher_id  uuid not null references teachers(id),
  room_id     uuid not null references rooms(id),
  slot_id     uuid not null references time_slots(id),
  weekday     smallint not null check (weekday between 1 and 7),
  parity      week_parity not null default 'all',
  type        lesson_type not null default 'practice',
  -- Deviation from §6, documented in docs/STATUS.md: a lesson may span two
  -- consecutive slots so that 100-minute lectures (10:00–11:50 in the design)
  -- exist. The engine ends the session at the end of slot idx+slot_span-1.
  slot_span   smallint not null default 1 check (slot_span in (1,2))
);
-- +goose StatementEnd

-- +goose StatementBegin
create index lessons_semester_weekday_idx on lessons (semester_id, weekday);
-- +goose StatementEnd

-- +goose StatementBegin
create table lesson_groups (
  lesson_id uuid references lessons(id) on delete cascade,
  group_id  uuid references student_groups(id) on delete cascade,
  primary key (lesson_id, group_id)
);
-- +goose StatementEnd

-- +goose StatementBegin
create type override_kind as enum ('cancel','move','delay','reassign_teacher','extra');
-- +goose StatementEnd

-- +goose StatementBegin
create table session_overrides (
  id             uuid primary key default gen_random_uuid(),
  lesson_id      uuid references lessons(id) on delete cascade,
  date           date not null,
  kind           override_kind not null,
  new_room_id    uuid references rooms(id),
  new_teacher_id uuid references teachers(id),
  delay_minutes  int,
  course_id      uuid references courses(id),
  slot_id        uuid references time_slots(id),
  note           text,
  created_at     timestamptz not null default now()
);
-- +goose StatementEnd

-- +goose StatementBegin
create index session_overrides_date_idx on session_overrides (date);
-- +goose StatementEnd

-- +goose StatementBegin
-- Deviation from §6, documented in docs/STATUS.md: the contract's `extra`
-- override carries `groupCodes`, and §6 has nowhere to store them.
create table session_override_groups (
  override_id uuid references session_overrides(id) on delete cascade,
  group_id    uuid references student_groups(id) on delete cascade,
  primary key (override_id, group_id)
);
-- +goose StatementEnd

-- +goose StatementBegin
create table announcements (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  text        text not null,
  severity    text not null default 'info' check (severity in ('info','warning','alert')),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null
);
-- +goose StatementEnd

-- +goose StatementBegin
create index announcements_window_idx on announcements (building_id, starts_at, ends_at);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
drop table if exists announcements;
-- +goose StatementEnd
-- +goose StatementBegin
drop table if exists session_override_groups;
-- +goose StatementEnd
-- +goose StatementBegin
drop table if exists session_overrides;
-- +goose StatementEnd
-- +goose StatementBegin
drop type if exists override_kind;
-- +goose StatementEnd
-- +goose StatementBegin
drop table if exists lesson_groups;
-- +goose StatementEnd
-- +goose StatementBegin
drop table if exists lessons;
-- +goose StatementEnd
-- +goose StatementBegin
drop type if exists week_parity;
-- +goose StatementEnd
-- +goose StatementBegin
drop type if exists lesson_type;
-- +goose StatementEnd
-- +goose StatementBegin
drop table if exists time_slots;
-- +goose StatementEnd
-- +goose StatementBegin
drop table if exists semesters;
-- +goose StatementEnd
-- +goose StatementBegin
drop table if exists courses;
-- +goose StatementEnd
-- +goose StatementBegin
drop table if exists student_groups;
-- +goose StatementEnd
-- +goose StatementBegin
drop table if exists teachers;
-- +goose StatementEnd
-- +goose StatementBegin
drop table if exists rooms;
-- +goose StatementEnd
-- +goose StatementBegin
drop type if exists wing;
-- +goose StatementEnd
-- +goose StatementBegin
drop type if exists room_type;
-- +goose StatementEnd
-- +goose StatementBegin
drop table if exists floors;
-- +goose StatementEnd
-- +goose StatementBegin
drop table if exists buildings;
-- +goose StatementEnd
