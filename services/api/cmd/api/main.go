// Command api serves the CampusLive HTTP and SSE API.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "time/tzdata" // the distroless image has no zoneinfo; Asia/Almaty must resolve

	"github.com/kailholmes/campuslive/services/api/internal/config"
	"github.com/kailholmes/campuslive/services/api/internal/httpapi"
	"github.com/kailholmes/campuslive/services/api/internal/mapspec"
	"github.com/kailholmes/campuslive/services/api/internal/realtime"
	"github.com/kailholmes/campuslive/services/api/internal/repo"
	"github.com/kailholmes/campuslive/services/api/internal/schedule"
	"github.com/kailholmes/campuslive/services/api/internal/scheduler"
	"github.com/kailholmes/campuslive/services/api/internal/service"
)

func main() {
	healthcheck := flag.Bool("healthcheck", false, "probe /healthz on this service's own port and exit 0 or 1")
	flag.Parse()

	if *healthcheck {
		os.Exit(runHealthcheck())
	}
	if err := run(); err != nil {
		slog.Error("fatal", slog.Any("err", err))
		os.Exit(1)
	}
}

// runHealthcheck backs the `-healthcheck` flag infra/docker-compose.yml uses as
// the container health probe.
func runHealthcheck() int {
	port := os.Getenv("PORT")
	if port == "" {
		port = fmt.Sprint(config.DefaultPort)
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/healthz") //nolint:noctx // a 3-second probe
	if err != nil {
		fmt.Fprintln(os.Stderr, "healthcheck:", err)
		return 1
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		fmt.Fprintln(os.Stderr, "healthcheck: status", resp.StatusCode)
		return 1
	}
	return 0
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	log := newLogger(cfg.LogLevel)
	slog.SetDefault(log)

	clk, err := cfg.Clock()
	if err != nil {
		return err
	}

	spec, err := mapspec.LoadDefault(cfg.MapDataPath)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if cfg.MigrateOnStart {
		log.Info("applying migrations")
		if err := repo.Migrate(ctx, cfg.DatabaseURL); err != nil {
			return err
		}
	}

	store, err := repo.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer store.Close()

	if cfg.SeedOnStart {
		report, err := schedule.NewSeedSource(store.Pool(), spec, clk, false).Sync(ctx, clk.Now(), clk.Now())
		if err != nil {
			return err
		}
		log.Info("seed on start", slog.String("report", report.String()))
	}

	board := service.NewBoard(store, clk, cfg.Thresholds)
	broker := realtime.New(realtime.Options{Clock: clk})
	defer broker.Close()

	var loop *scheduler.Scheduler
	server := httpapi.NewServer(httpapi.Options{
		Board:           board,
		Broker:          broker,
		Spec:            spec,
		Logger:          log,
		AdminAPIKey:     cfg.AdminAPIKey,
		CORSOrigins:     cfg.CORSOrigins,
		DefaultBuilding: cfg.DefaultBuilding,
		Invalidate:      func(string) { loop.Invalidate() },
		Ready: func(ctx context.Context) (bool, bool) {
			return store.Ping(ctx) == nil, board.Cached(cfg.DefaultBuilding)
		},
	})
	loop = scheduler.New(board, server, clk, log, cfg.DefaultBuilding)

	go broker.Run(ctx)
	go loop.Run(ctx)

	httpServer := &http.Server{
		Addr:              cfg.Addr(),
		Handler:           server.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		// No WriteTimeout: the SSE stream is long-lived by design; per-request
		// deadlines come from the timeout middleware instead.
		IdleTimeout: 120 * time.Second,
		BaseContext: func(net.Listener) context.Context { return ctx },
	}

	errc := make(chan error, 1)
	go func() {
		log.Info("listening",
			slog.String("addr", cfg.Addr()),
			slog.String("clock", string(clk.Mode())),
			slog.String("now", clk.Now().Format(time.RFC3339)),
			slog.String("building", cfg.DefaultBuilding),
			slog.Any("cors", cfg.CORSOrigins),
		)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errc <- err
		}
	}()

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}

	log.Info("shutting down")
	broker.Close()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		return err
	}
	log.Info("bye")
	return nil
}

func newLogger(level string) *slog.Logger {
	var lvl slog.Level
	if err := lvl.UnmarshalText([]byte(level)); err != nil {
		lvl = slog.LevelInfo
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lvl}))
}
