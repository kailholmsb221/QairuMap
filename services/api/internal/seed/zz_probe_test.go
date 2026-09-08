package seed_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
	"github.com/kailholmes/campuslive/services/api/internal/mapspec"
	"github.com/kailholmes/campuslive/services/api/internal/seed"
)

func TestProbe(t *testing.T) {
	spec, err := mapspec.LoadDefault("")
	require.NoError(t, err)
	ds, err := seed.Generate(seed.Options{Spec: spec, Today: domain.NewDate(2026, time.September, 7)})
	require.NoError(t, err)

	t.Logf("rooms=%d teachers=%d groups=%d courses=%d lessons=%d overrides=%d ann=%d",
		len(ds.Rooms), len(ds.Teachers), len(ds.Groups), len(ds.Courses), len(ds.Lessons), len(ds.Overrides), len(ds.Announcements))

	// per-weekday busy rooms (odd week)
	busy := map[[2]int]map[string]bool{}
	for _, l := range ds.Lessons {
		if l.Parity == domain.ParityEven {
			continue
		}
		for i := 0; i < l.SlotSpan; i++ {
			k := [2]int{l.Weekday, l.SlotIdx + i}
			if busy[k] == nil {
				busy[k] = map[string]bool{}
			}
			busy[k][l.RoomCode] = true
		}
	}
	for wd := 1; wd <= 5; wd++ {
		line := ""
		for s := 1; s <= 10; s++ {
			line += fmt.Sprintf(" %2d", len(busy[[2]int{wd, s}]))
		}
		t.Logf("weekday %d busy rooms:%s", wd, line)
	}

	// group load per weekday (odd week)
	groupByID := map[string]string{}
	for _, g := range ds.Groups {
		groupByID[g.ID.String()] = g.Code
	}
	load := map[string]int{}
	for _, l := range ds.Lessons {
		if l.Parity == domain.ParityEven {
			continue
		}
		for _, gid := range l.GroupIDs {
			load[fmt.Sprintf("%d|%s", l.Weekday, groupByID[gid.String()])] += l.SlotSpan
		}
	}
	min, max, sum := 99, 0, 0
	for wd := 1; wd <= 5; wd++ {
		for _, g := range ds.Groups {
			n := load[fmt.Sprintf("%d|%s", wd, g.Code)]
			if n < min {
				min = n
			}
			if n > max {
				max = n
			}
			sum += n
		}
	}
	t.Logf("group pairs/day min=%d max=%d avg=%.2f", min, max, float64(sum)/float64(len(ds.Groups)*5))

	// lessons per weekday
	perDay := map[int]int{}
	for _, l := range ds.Lessons {
		perDay[l.Weekday]++
	}
	t.Logf("lessons per weekday: %v", perDay)

	byDate := map[string]map[domain.OverrideKind]int{}
	for _, o := range ds.Overrides {
		if byDate[o.Date.String()] == nil {
			byDate[o.Date.String()] = map[domain.OverrideKind]int{}
		}
		byDate[o.Date.String()][o.Kind]++
	}
	for _, d := range []string{
		"2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11",
		"2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18",
	} {
		t.Logf("%s cancel=%d move=%d delay=%d", d,
			byDate[d][domain.OverrideCancel], byDate[d][domain.OverrideMove], byDate[d][domain.OverrideDelay])
	}
}
