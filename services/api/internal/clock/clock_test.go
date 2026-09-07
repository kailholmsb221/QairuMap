package clock_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kailholmes/campuslive/services/api/internal/clock"
)

func TestReal(t *testing.T) {
	t.Parallel()
	c := clock.NewReal()
	require.Equal(t, clock.ModeReal, c.Mode())
	require.Zero(t, c.Offset())

	before := time.Now()
	got := c.Now()
	after := time.Now()
	require.False(t, got.Before(before))
	require.False(t, got.After(after))
}

func TestFixed(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 9, 8, 10, 47, 0, 0, time.FixedZone("+05", 5*3600))
	c := clock.NewFixed(at)

	require.Equal(t, clock.ModeFixed, c.Mode())
	require.Zero(t, c.Offset())
	require.True(t, at.Equal(c.Now()))
	// Frozen: two reads with real time in between are identical.
	time.Sleep(2 * time.Millisecond)
	require.True(t, at.Equal(c.Now()))
}

func TestOffset(t *testing.T) {
	t.Parallel()
	base := clock.NewFixed(time.Date(2026, 9, 8, 10, 0, 0, 0, time.UTC))
	c := clock.NewOffsetOf(base, -3*time.Hour-20*time.Minute)

	require.Equal(t, clock.ModeOffset, c.Mode())
	require.Equal(t, -3*time.Hour-20*time.Minute, c.Offset())
	require.True(t, time.Date(2026, 9, 8, 6, 40, 0, 0, time.UTC).Equal(c.Now()))
}

func TestOffsetAdvancesWithWallClock(t *testing.T) {
	t.Parallel()
	c := clock.NewOffset(time.Hour)
	first := c.Now()
	require.WithinDuration(t, time.Now().Add(time.Hour), first, time.Second)

	time.Sleep(5 * time.Millisecond)
	require.True(t, c.Now().After(first), "an offset clock still advances")
}

func TestOffsetWithNilBaseFallsBackToReal(t *testing.T) {
	t.Parallel()
	c := clock.OffsetClock{Delta: time.Hour}
	require.WithinDuration(t, time.Now().Add(time.Hour), c.Now(), time.Second)
}

func TestFromValues(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		mode     string
		fixedAt  string
		offset   string
		wantMode clock.Mode
		wantNow  *time.Time
		wantOff  time.Duration
		wantErr  string
	}{
		{name: "empty defaults to real", wantMode: clock.ModeReal},
		{name: "real", mode: "real", wantMode: clock.ModeReal},
		{name: "real is case-insensitive and trimmed", mode: "  REAL ", wantMode: clock.ModeReal},
		{
			name:     "fixed",
			mode:     "fixed",
			fixedAt:  "2026-09-08T10:47:00+05:00",
			wantMode: clock.ModeFixed,
			wantNow:  ptr(time.Date(2026, 9, 8, 5, 47, 0, 0, time.UTC)),
		},
		{
			name:     "offset",
			mode:     "offset",
			offset:   "-3h20m",
			wantMode: clock.ModeOffset,
			wantOff:  -3*time.Hour - 20*time.Minute,
		},
		{name: "fixed without instant", mode: "fixed", wantErr: "requires CLOCK_FIXED_AT"},
		{name: "fixed with bad instant", mode: "fixed", fixedAt: "yesterday", wantErr: "parse CLOCK_FIXED_AT"},
		{name: "offset without duration", mode: "offset", wantErr: "requires CLOCK_OFFSET"},
		{name: "offset with bad duration", mode: "offset", offset: "3 hours", wantErr: "parse CLOCK_OFFSET"},
		{name: "unknown mode", mode: "frozen", wantErr: "unknown CLOCK_MODE"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			c, err := clock.FromValues(tc.mode, tc.fixedAt, tc.offset)
			if tc.wantErr != "" {
				require.Error(t, err)
				require.Contains(t, err.Error(), tc.wantErr)
				require.Nil(t, c)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tc.wantMode, c.Mode())
			require.Equal(t, tc.wantOff, c.Offset())
			if tc.wantNow != nil {
				require.True(t, tc.wantNow.Equal(c.Now()), "want %s got %s", tc.wantNow, c.Now())
			}
		})
	}
}

func TestFromEnv(t *testing.T) {
	t.Setenv("CLOCK_MODE", "fixed")
	t.Setenv("CLOCK_FIXED_AT", "2026-09-08T10:47:00+05:00")
	t.Setenv("CLOCK_OFFSET", "")

	c, err := clock.FromEnv()
	require.NoError(t, err)
	require.Equal(t, clock.ModeFixed, c.Mode())
	require.True(t, time.Date(2026, 9, 8, 5, 47, 0, 0, time.UTC).Equal(c.Now()))
}

func TestFromEnvDefaultsToReal(t *testing.T) {
	t.Setenv("CLOCK_MODE", "")
	c, err := clock.FromEnv()
	require.NoError(t, err)
	require.Equal(t, clock.ModeReal, c.Mode())
}

func ptr[T any](v T) *T { return &v }

func TestStopwatch(t *testing.T) {
	t.Parallel()
	elapsed := clock.Stopwatch()
	require.GreaterOrEqual(t, elapsed(), time.Duration(0))
	time.Sleep(2 * time.Millisecond)
	require.Positive(t, elapsed(), "a stopwatch follows real time, not the configured Clock")
}

func TestWallNow(t *testing.T) {
	t.Parallel()
	require.WithinDuration(t, time.Now(), clock.WallNow(), time.Second)
}
