package engine_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
	"github.com/kailholmes/campuslive/services/api/internal/engine"
)

func TestWeekInfo(t *testing.T) {
	t.Parallel()

	// Fall 2026 starts Monday 24 Aug 2026, week 1 = odd.
	fall := semester()

	// A semester that starts mid-week: week 1 is still the whole week whose
	// Monday precedes starts_on.
	midWeek := domain.Semester{
		Name:        "Mid-week",
		StartsOn:    domain.NewDate(2026, time.September, 2), // a Wednesday
		EndsOn:      domain.NewDate(2026, time.December, 20),
		Week1Parity: domain.ParityEven,
	}

	tests := []struct {
		name       string
		sem        domain.Semester
		date       domain.Date
		wantNumber int
		wantParity domain.Parity
	}{
		{"first day of week 1", fall, domain.NewDate(2026, time.August, 24), 1, domain.ParityOdd},
		{"sunday of week 1", fall, domain.NewDate(2026, time.August, 30), 1, domain.ParityOdd},
		{"monday of week 2", fall, domain.NewDate(2026, time.August, 31), 2, domain.ParityEven},
		{"monday of week 3", fall, domain.NewDate(2026, time.September, 7), 3, domain.ParityOdd},
		{"the design's hero day", fall, domain.NewDate(2026, time.September, 8), 3, domain.ParityOdd},
		{"week 4", fall, domain.NewDate(2026, time.September, 14), 4, domain.ParityEven},
		{"week 17", fall, domain.NewDate(2026, time.December, 14), 17, domain.ParityOdd},
		{"the day before the semester", fall, domain.NewDate(2026, time.August, 23), 0, domain.ParityEven},
		{"a week before the semester", fall, domain.NewDate(2026, time.August, 17), 0, domain.ParityEven},
		{"two weeks before the semester", fall, domain.NewDate(2026, time.August, 10), -1, domain.ParityOdd},
		{"mid-week start, monday before", midWeek, domain.NewDate(2026, time.August, 31), 1, domain.ParityEven},
		{"mid-week start, starts_on itself", midWeek, domain.NewDate(2026, time.September, 2), 1, domain.ParityEven},
		{"mid-week start, next monday", midWeek, domain.NewDate(2026, time.September, 7), 2, domain.ParityOdd},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			n, p := engine.WeekInfo(tc.sem, tc.date)
			require.Equal(t, tc.wantNumber, n)
			require.Equal(t, tc.wantParity, p)
		})
	}
}

func TestWeekInfoDefaultsUnknownParityToOdd(t *testing.T) {
	t.Parallel()
	sem := semester()
	sem.Week1Parity = domain.ParityAll // never valid on a semester
	_, p := engine.WeekInfo(sem, sem.StartsOn)
	require.Equal(t, domain.ParityOdd, p)
}

func TestParityOther(t *testing.T) {
	t.Parallel()
	require.Equal(t, domain.ParityEven, domain.ParityOdd.Other())
	require.Equal(t, domain.ParityOdd, domain.ParityEven.Other())
	require.Equal(t, domain.ParityAll, domain.ParityAll.Other())
}
