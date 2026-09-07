// Package clock is the single source of server "now".
//
// time.Now() is called in exactly one place in this repository: Real.Now below.
// Everything else takes a Clock through its constructor, which is what makes
// the engine testable and the demo deterministic (ARCHITECTURE §8.2).
package clock

import (
	"fmt"
	"os"
	"strings"
	"time"
)

// Mode is how a Clock produces "now" (contract: ClockMode).
type Mode string

// Clock modes.
const (
	ModeReal   Mode = "real"
	ModeFixed  Mode = "fixed"
	ModeOffset Mode = "offset"
)

// Clock produces the server's current instant.
type Clock interface {
	// Now returns the current instant.
	Now() time.Time
	// Mode reports how this clock produces Now.
	Mode() Mode
	// Offset reports the shift applied in offset mode; zero otherwise.
	Offset() time.Duration
}

// Real is the wall clock.
type Real struct{}

// NewReal returns the wall clock.
func NewReal() Real { return Real{} }

// Now returns time.Now(). This is the only time.Now() call in the service.
func (Real) Now() time.Time { return time.Now() }

// Mode returns ModeReal.
func (Real) Mode() Mode { return ModeReal }

// Offset returns zero.
func (Real) Offset() time.Duration { return 0 }

// Fixed always returns the same instant. Used by e2e runs and screenshots.
type Fixed struct{ At time.Time }

// NewFixed returns a clock frozen at at.
func NewFixed(at time.Time) Fixed { return Fixed{At: at} }

// Now returns the frozen instant.
func (f Fixed) Now() time.Time { return f.At }

// Mode returns ModeFixed.
func (Fixed) Mode() Mode { return ModeFixed }

// Offset returns zero.
func (Fixed) Offset() time.Duration { return 0 }

// Offset shifts an underlying clock by a constant duration, so that a demo can
// run at "Tuesday 10:47" at any real moment while time still advances.
type OffsetClock struct {
	Base  Clock
	Delta time.Duration
}

// NewOffset shifts the wall clock by delta.
func NewOffset(delta time.Duration) OffsetClock {
	return OffsetClock{Base: Real{}, Delta: delta}
}

// NewOffsetOf shifts base by delta.
func NewOffsetOf(base Clock, delta time.Duration) OffsetClock {
	return OffsetClock{Base: base, Delta: delta}
}

// Now returns the base clock shifted by Delta.
func (o OffsetClock) Now() time.Time {
	base := o.Base
	if base == nil {
		base = Real{}
	}
	return base.Now().Add(o.Delta)
}

// Mode returns ModeOffset.
func (OffsetClock) Mode() Mode { return ModeOffset }

// Offset returns the configured shift.
func (o OffsetClock) Offset() time.Duration { return o.Delta }

// FromEnv builds a Clock from CLOCK_MODE, CLOCK_FIXED_AT and CLOCK_OFFSET
// (ARCHITECTURE §8.5). An empty or absent CLOCK_MODE means `real`.
func FromEnv() (Clock, error) {
	return FromValues(os.Getenv("CLOCK_MODE"), os.Getenv("CLOCK_FIXED_AT"), os.Getenv("CLOCK_OFFSET"))
}

// FromValues builds a Clock from already-read environment values. Exposed
// separately so tests need not touch the process environment.
func FromValues(mode, fixedAt, offset string) (Clock, error) {
	switch Mode(strings.ToLower(strings.TrimSpace(mode))) {
	case "", ModeReal:
		return Real{}, nil

	case ModeFixed:
		v := strings.TrimSpace(fixedAt)
		if v == "" {
			return nil, fmt.Errorf("clock: CLOCK_MODE=fixed requires CLOCK_FIXED_AT")
		}
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return nil, fmt.Errorf("clock: parse CLOCK_FIXED_AT %q: %w", v, err)
		}
		return Fixed{At: t}, nil

	case ModeOffset:
		v := strings.TrimSpace(offset)
		if v == "" {
			return nil, fmt.Errorf("clock: CLOCK_MODE=offset requires CLOCK_OFFSET")
		}
		d, err := time.ParseDuration(v)
		if err != nil {
			return nil, fmt.Errorf("clock: parse CLOCK_OFFSET %q: %w", v, err)
		}
		return OffsetClock{Base: Real{}, Delta: d}, nil

	default:
		return nil, fmt.Errorf("clock: unknown CLOCK_MODE %q (want real|fixed|offset)", mode)
	}
}

// Stopwatch starts measuring real elapsed wall time and returns a function that
// reports how much has passed.
//
// It lives in this package because this is the only place allowed to read the
// process clock. Request durations and rate-limit refills must not follow the
// simulated `fixed` / `offset` clocks: a frozen demo clock would report every
// request as instantaneous and would never refill a token bucket.
func Stopwatch() func() time.Duration {
	start := Real{}.Now()
	return func() time.Duration { return Real{}.Now().Sub(start) }
}

// WallNow is real wall time, for the same reason as Stopwatch. Server "now",
// which the engine and the API report, always comes from a Clock instead.
func WallNow() time.Time { return Real{}.Now() }
