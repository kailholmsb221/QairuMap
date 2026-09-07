// Command seed fills the database with the deterministic demo timetable
// (ARCHITECTURE §13). It always migrates first, so a fresh database needs
// nothing but `go run ./cmd/seed --reset`.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	_ "time/tzdata" // the distroless image has no zoneinfo; Asia/Almaty must resolve

	"github.com/kailholmes/campuslive/services/api/internal/config"
	"github.com/kailholmes/campuslive/services/api/internal/mapspec"
	"github.com/kailholmes/campuslive/services/api/internal/repo"
	"github.com/kailholmes/campuslive/services/api/internal/schedule"
)

func main() {
	reset := flag.Bool("reset", false, "truncate every table before seeding")
	flag.Parse()

	if err := run(*reset); err != nil {
		slog.Error("seed failed", slog.Any("err", err))
		os.Exit(1)
	}
}

func run(reset bool) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	clk, err := cfg.Clock()
	if err != nil {
		return err
	}

	path, err := mapspec.Resolve(cfg.MapDataPath)
	if err != nil {
		return err
	}
	spec, err := mapspec.Load(path)
	if err != nil {
		return err
	}
	log.Info("map data loaded", slog.String("path", path), slog.Int("rooms", spec.RoomCount()))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := repo.Migrate(ctx, cfg.DatabaseURL); err != nil {
		return err
	}

	store, err := repo.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer store.Close()

	source := schedule.NewSeedSource(store.Pool(), spec, clk, reset)
	report, err := source.Sync(ctx, clk.Now(), clk.Now())
	if err != nil {
		return err
	}
	log.Info("seed complete", slog.String("report", report.String()))

	rooms, lessons, err := store.Counts(ctx)
	if err != nil {
		return err
	}
	fmt.Printf("rooms=%d lessons=%d\n", rooms, lessons)

	if report.Skipped {
		fmt.Println("nothing written — pass --reset to rebuild the demo data")
	}
	return nil
}
