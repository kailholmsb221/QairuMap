package mapspec_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kailholmes/campuslive/services/api/internal/mapspec"
)

func TestResolveWalksUpToTheMonorepoRoot(t *testing.T) {
	t.Parallel()

	// The working directory here is services/api/internal/mapspec, four levels
	// below the repository root that holds packages/map-data.
	path, err := mapspec.Resolve("")
	require.NoError(t, err)
	require.True(t, filepath.IsAbs(path))
	require.Equal(t, "building-a.json", filepath.Base(path))
}

func TestResolveExplicitPath(t *testing.T) {
	t.Parallel()

	found, err := mapspec.Resolve("")
	require.NoError(t, err)

	got, err := mapspec.Resolve(found)
	require.NoError(t, err)
	require.Equal(t, found, got)

	_, err = mapspec.Resolve(filepath.Join(t.TempDir(), "nope.json"))
	require.ErrorContains(t, err, "MAP_DATA_PATH")
}

func TestLoad(t *testing.T) {
	t.Parallel()

	spec, err := mapspec.LoadDefault("")
	require.NoError(t, err)

	require.Equal(t, "A", spec.Building)
	require.Equal(t, "Main Academic Building", spec.Name)
	require.Equal(t, "Asia/Almaty", spec.Timezone)
	require.Equal(t, []float64{0, 0, 600, 1000}, spec.ViewBox)
	require.Len(t, spec.Floors, 2)
	require.Equal(t, 54, spec.RoomCount())

	f2 := spec.FloorOf(2)
	require.NotNil(t, f2)
	require.Equal(t, "a-f2", f2.PlanKey)
	require.NotNil(t, f2.Atrium, "only floor 2 has an atrium void")
	require.NotEmpty(t, f2.Outline)
	require.NotEmpty(t, f2.Zones)
	require.NotEmpty(t, f2.Corridors)
	require.Len(t, f2.Cores, 2)
	require.NotEmpty(t, f2.Landmarks)
	require.NotEmpty(t, f2.Entrances)

	require.Nil(t, spec.FloorOf(1).Atrium)
	require.Nil(t, spec.FloorOf(9), "there is no ninth floor")
}

func TestLoadRejectsRubbish(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()

	broken := filepath.Join(dir, "broken.json")
	require.NoError(t, os.WriteFile(broken, []byte("{"), 0o600))
	_, err := mapspec.Load(broken)
	require.ErrorContains(t, err, "parse")

	empty := filepath.Join(dir, "empty.json")
	require.NoError(t, os.WriteFile(empty, []byte(`{"building":"","floors":[]}`), 0o600))
	_, err = mapspec.Load(empty)
	require.ErrorContains(t, err, "no building or no floors")

	_, err = mapspec.Load(filepath.Join(dir, "missing.json"))
	require.ErrorContains(t, err, "read")
}
