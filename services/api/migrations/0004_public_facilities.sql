-- +goose Up
-- Preserve lesson templates for audit; the timeline excludes retired rooms.
update rooms set schedulable = false
where code in ('102', '102A', 'CR', 'CINEMA', 'WC-1', 'WC-2');

-- +goose Down
update rooms set schedulable = true where code = 'CR';
