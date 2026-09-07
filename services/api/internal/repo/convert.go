package repo

import (
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
)

// The conversions between pgtype and the domain live here so that no other
// package has to know that the store speaks pgx.

func toUUID(v pgtype.UUID) uuid.UUID {
	if !v.Valid {
		return uuid.Nil
	}
	return uuid.UUID(v.Bytes)
}

func toUUIDPtr(v pgtype.UUID) *uuid.UUID {
	if !v.Valid {
		return nil
	}
	id := uuid.UUID(v.Bytes)
	return &id
}

func pgUUID(id uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: id, Valid: true}
}

func pgUUIDPtr(id *uuid.UUID) pgtype.UUID {
	if id == nil {
		return pgtype.UUID{}
	}
	return pgUUID(*id)
}

func toDate(v pgtype.Date) domain.Date {
	if !v.Valid {
		return domain.Date{}
	}
	return domain.DateOf(v.Time.UTC())
}

func pgDate(d domain.Date) pgtype.Date {
	return pgtype.Date{Time: d.Midnight(time.UTC), Valid: true}
}

func pgTimestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

func toTime(v pgtype.Timestamptz) time.Time {
	if !v.Valid {
		return time.Time{}
	}
	return v.Time
}

// toTimeOfDay converts a PostgreSQL `time` (microseconds since midnight) into a
// building-local wall-clock time.
func toTimeOfDay(v pgtype.Time) domain.TimeOfDay {
	if !v.Valid {
		return domain.TimeOfDay{}
	}
	mins := v.Microseconds / int64(time.Minute/time.Microsecond)
	return domain.NewTimeOfDay(int(mins/60), int(mins%60))
}

func str(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func pgText(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func toIntPtr(v *int32) *int {
	if v == nil {
		return nil
	}
	n := int(*v)
	return &n
}

func toInt(v *int32) int {
	if v == nil {
		return 0
	}
	return int(*v)
}

func toInt16(v *int16) int {
	if v == nil {
		return 0
	}
	return int(*v)
}

func pgInt32Ptr(v *int) *int32 {
	if v == nil {
		return nil
	}
	n := int32(*v) //nolint:gosec // capacities and delays are small
	return &n
}
