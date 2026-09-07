// Package mapspec loads packages/map-data/building-a.json — the single source
// of truth for room geometry (CLAUDE.md). Both cmd/seed and the /map endpoint
// read it: the seed writes the per-room geometry into the database, and the
// endpoint takes the floor-level geometry (outline, zones, corridors, cores,
// landmarks, entrances) straight from here.
package mapspec

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Spec mirrors the contract's MapSpec. The JSON tags reproduce
// packages/map-data/building-a.json exactly, so a round trip through this type
// is lossless.
type Spec struct {
	Building string    `json:"building"`
	Name     string    `json:"name"`
	Timezone string    `json:"timezone"`
	ViewBox  []float64 `json:"viewBox"`
	Floors   []Floor   `json:"floors"`
}

// Floor is one floor plate.
type Floor struct {
	Number    int        `json:"number"`
	PlanKey   string     `json:"planKey"`
	Outline   string     `json:"outline"`
	Zones     []Zone     `json:"zones"`
	Corridors []Zone     `json:"corridors"`
	Rooms     []Room     `json:"rooms"`
	Cores     []Core     `json:"cores"`
	Landmarks []Landmark `json:"landmarks"`
	Entrances []Entrance `json:"entrances"`
	Atrium    *string    `json:"atrium,omitempty"`
}

// Zone is a tinted band (wing or corridor).
type Zone struct {
	ID   string `json:"id"`
	Path string `json:"path"`
}

// BBox is an axis-aligned bounding box.
type BBox struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

// Point is a label anchor.
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Room is one space, with the deterministic UUID v5 the seed reuses.
type Room struct {
	ID          string `json:"id"`
	Code        string `json:"code"`
	Name        string `json:"name"`
	Type        string `json:"type"`
	Wing        string `json:"wing"`
	Schedulable bool   `json:"schedulable"`
	Path        string `json:"path"`
	BBox        BBox   `json:"bbox"`
	Label       Point  `json:"label"`
	Capacity    *int   `json:"capacity,omitempty"`
}

// Core is a vertical circulation core on the east strip.
type Core struct {
	ID    string `json:"id"`
	Code  string `json:"code"`
	Name  string `json:"name"`
	Path  string `json:"path"`
	BBox  BBox   `json:"bbox"`
	Label Point  `json:"label"`
}

// Landmark is a glyph anchor (stairs, elevator…).
type Landmark struct {
	Kind string  `json:"kind"`
	ID   string  `json:"id"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
}

// Entrance is a door in the façade.
type Entrance struct {
	ID   string  `json:"id"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Main bool    `json:"main"`
	Path string  `json:"path"`
}

// RelPath is where building-a.json lives inside the monorepo.
const RelPath = "packages/map-data/building-a.json"

// containerPath is where services/api/Dockerfile copies the file.
const containerPath = "/app/map-data/building-a.json"

// Resolve finds building-a.json. An explicit path (MAP_DATA_PATH) wins;
// otherwise the working directory and each of its parents are probed for
// `packages/map-data/building-a.json`, which works from the module directory
// (`go run ./cmd/seed`), from any package directory (`go test ./...`) and from
// the repo root alike. The container layout is the last resort.
func Resolve(explicit string) (string, error) {
	if explicit != "" {
		abs, err := filepath.Abs(explicit)
		if err != nil {
			return "", fmt.Errorf("mapspec: resolve %q: %w", explicit, err)
		}
		if _, err := os.Stat(abs); err != nil {
			return "", fmt.Errorf("mapspec: MAP_DATA_PATH %q: %w", explicit, err)
		}
		return abs, nil
	}

	cwd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("mapspec: working directory: %w", err)
	}

	var tried []string
	dir := cwd
	for i := 0; i < 12; i++ {
		candidate := filepath.Join(dir, RelPath)
		tried = append(tried, candidate)
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	tried = append(tried, containerPath)
	if _, err := os.Stat(containerPath); err == nil {
		return containerPath, nil
	}
	return "", fmt.Errorf("mapspec: %s not found; set MAP_DATA_PATH (tried %v)", RelPath, tried)
}

// Load reads and parses the map spec at path.
func Load(path string) (*Spec, error) {
	raw, err := os.ReadFile(path) //nolint:gosec // the operator chooses this path
	if err != nil {
		return nil, fmt.Errorf("mapspec: read %s: %w", path, err)
	}
	var spec Spec
	if err := json.Unmarshal(raw, &spec); err != nil {
		return nil, fmt.Errorf("mapspec: parse %s: %w", path, err)
	}
	if spec.Building == "" || len(spec.Floors) == 0 {
		return nil, fmt.Errorf("mapspec: %s has no building or no floors", path)
	}
	return &spec, nil
}

// LoadDefault resolves and loads in one step.
func LoadDefault(explicit string) (*Spec, error) {
	path, err := Resolve(explicit)
	if err != nil {
		return nil, err
	}
	return Load(path)
}

// FloorOf returns the floor plate with this number.
func (s *Spec) FloorOf(number int) *Floor {
	for i := range s.Floors {
		if s.Floors[i].Number == number {
			return &s.Floors[i]
		}
	}
	return nil
}

// RoomCount is the total number of spaces across every floor.
func (s *Spec) RoomCount() int {
	n := 0
	for _, f := range s.Floors {
		n += len(f.Rooms)
	}
	return n
}
