// Package config reads the service configuration from the environment
// (ARCHITECTURE §8.5). Every value has a documented default so that
// `go run ./cmd/api` works with nothing but DATABASE_URL.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/kailholmes/campuslive/services/api/internal/clock"
	"github.com/kailholmes/campuslive/services/api/internal/engine"
)

// Config is the whole runtime configuration.
type Config struct {
	Port            int
	DatabaseURL     string
	CORSOrigins     []string
	AdminAPIKey     string
	Thresholds      engine.Thresholds
	LogLevel        string
	MigrateOnStart  bool
	SeedOnStart     bool
	MapDataPath     string
	DefaultBuilding string

	ClockMode    string
	ClockFixedAt string
	ClockOffset  string
}

// Defaults.
const (
	DefaultPort        = 8080
	DefaultAdminAPIKey = "dev-admin-key"
	DefaultBuilding    = "A"
)

// Load reads the environment.
func Load() (Config, error) {
	cfg := Config{
		Port:            DefaultPort,
		DatabaseURL:     env("DATABASE_URL", "postgres://campuslive:campuslive@127.0.0.1:5432/campuslive?sslmode=disable"),
		CORSOrigins:     splitCSV(env("CORS_ORIGINS", "http://localhost:3000")),
		AdminAPIKey:     env("ADMIN_API_KEY", DefaultAdminAPIKey),
		LogLevel:        strings.ToLower(env("LOG_LEVEL", "info")),
		MigrateOnStart:  boolEnv("MIGRATE_ON_START", false),
		SeedOnStart:     boolEnv("SEED_ON_START", false),
		MapDataPath:     os.Getenv("MAP_DATA_PATH"),
		DefaultBuilding: env("DEFAULT_BUILDING", DefaultBuilding),
		ClockMode:       os.Getenv("CLOCK_MODE"),
		ClockFixedAt:    os.Getenv("CLOCK_FIXED_AT"),
		ClockOffset:     os.Getenv("CLOCK_OFFSET"),
	}

	// The Dockerfile shipped with the repo historically set MAP_SPEC_PATH;
	// accept it as an alias so an older image keeps working.
	if cfg.MapDataPath == "" {
		cfg.MapDataPath = os.Getenv("MAP_SPEC_PATH")
	}

	if raw := os.Getenv("PORT"); raw != "" {
		p, err := strconv.Atoi(raw)
		if err != nil || p <= 0 || p > 65535 {
			return cfg, fmt.Errorf("config: PORT %q is not a valid port", raw)
		}
		cfg.Port = p
	}

	var err error
	def := engine.DefaultThresholds()
	if cfg.Thresholds.Soon, err = durEnv("SOON_WINDOW", def.Soon); err != nil {
		return cfg, err
	}
	if cfg.Thresholds.Ending, err = durEnv("ENDING_WINDOW", def.Ending); err != nil {
		return cfg, err
	}
	if cfg.Thresholds.NextHorizon, err = durEnv("NEXT_HORIZON", def.NextHorizon); err != nil {
		return cfg, err
	}

	if _, err := clock.FromValues(cfg.ClockMode, cfg.ClockFixedAt, cfg.ClockOffset); err != nil {
		return cfg, err
	}
	return cfg, nil
}

// Clock builds the configured clock.
func (c Config) Clock() (clock.Clock, error) {
	return clock.FromValues(c.ClockMode, c.ClockFixedAt, c.ClockOffset)
}

// Addr is the listen address.
func (c Config) Addr() string { return fmt.Sprintf(":%d", c.Port) }

func env(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func boolEnv(key string, def bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	switch v {
	case "":
		return def
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func durEnv(key string, def time.Duration) (time.Duration, error) {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return def, nil
	}
	d, err := time.ParseDuration(raw)
	if err != nil {
		return def, fmt.Errorf("config: %s %q: %w", key, raw, err)
	}
	if d < 0 {
		return def, fmt.Errorf("config: %s must not be negative", key)
	}
	return d, nil
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
