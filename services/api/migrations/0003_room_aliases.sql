-- Room search synonyms.
--
-- `rooms.name` is the university's own Kazakh name, so a visitor typing the
-- everyday Russian or English word for a place — «кафе», «туалет», «библиотека»,
-- "coworking" — matched nothing, and the map lit nothing up. `aliases` is a
-- free-text bag of those synonyms that `SearchRooms` also matches on; it is
-- never displayed, so it may hold all three languages at once.

-- +goose Up
-- +goose StatementBegin
alter table rooms add column if not exists aliases text not null default '';
-- +goose StatementEnd

-- +goose StatementBegin
comment on column rooms.aliases is
  'Space-separated search synonyms (ru/kk/en). Never rendered — SearchRooms only.';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
alter table rooms drop column if exists aliases;
-- +goose StatementEnd
