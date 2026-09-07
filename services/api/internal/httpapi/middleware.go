package httpapi

import (
	"crypto/subtle"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/kailholmes/campuslive/services/api/internal/clock"
)

// clientIP is the address a request came from, used for the admin rate limit
// and the per-address SSE cap.
func clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		if first, _, ok := strings.Cut(fwd, ","); ok {
			return strings.TrimSpace(first)
		}
		return strings.TrimSpace(fwd)
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// corsMiddleware allows only the configured origins (ARCHITECTURE §16). A `*`
// entry allows any origin, which is handy for a public read-only demo.
func corsMiddleware(origins []string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(origins))
	any := false
	for _, o := range origins {
		if o == "*" {
			any = true
		}
		allowed[o] = true
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && (any || allowed[origin]) {
				if any {
					w.Header().Set("Access-Control-Allow-Origin", "*")
				} else {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Add("Vary", "Origin")
				}
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Api-Key, If-None-Match")
				w.Header().Set("Access-Control-Expose-Headers", "ETag")
				w.Header().Set("Access-Control-Max-Age", "600")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// adminAuthMiddleware guards the three `/admin/*` operations with the shared
// demo key, answering with the standard envelope rather than a bare 401.
func adminAuthMiddleware(key string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			got := r.Header.Get("X-Api-Key")
			if key == "" || subtle.ConstantTimeCompare([]byte(got), []byte(key)) != 1 {
				writeError(w, http.StatusUnauthorized, CodeUnauthorized, "missing or invalid X-Api-Key")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// rateLimiter is a token bucket per client address (ARCHITECTURE §16).
//
// It refills on real wall time, not on the configurable Clock: a demo running
// with CLOCK_MODE=fixed must still be able to post overrides.
type rateLimiter struct {
	mu       sync.Mutex
	buckets  map[string]*bucket
	capacity float64
	refill   float64 // tokens per second
	now      func() time.Time
}

type bucket struct {
	tokens float64
	last   time.Time
}

func newRateLimiter(capacity int, per time.Duration, now func() time.Time) *rateLimiter {
	if capacity <= 0 {
		capacity = 30
	}
	if per <= 0 {
		per = time.Minute
	}
	if now == nil {
		now = clock.WallNow
	}
	return &rateLimiter{
		buckets:  map[string]*bucket{},
		capacity: float64(capacity),
		refill:   float64(capacity) / per.Seconds(),
		now:      now,
	}
}

// allow consumes one token, refilling by elapsed time first.
func (l *rateLimiter) allow(ip string) bool {
	now := l.now()

	l.mu.Lock()
	defer l.mu.Unlock()

	b, ok := l.buckets[ip]
	if !ok {
		l.buckets[ip] = &bucket{tokens: l.capacity - 1, last: now}
		return true
	}
	if elapsed := now.Sub(b.last).Seconds(); elapsed > 0 {
		b.tokens += elapsed * l.refill
		if b.tokens > l.capacity {
			b.tokens = l.capacity
		}
		b.last = now
	}
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func (l *rateLimiter) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !l.allow(clientIP(r)) {
			w.Header().Set("Retry-After", "1")
			writeError(w, http.StatusTooManyRequests, CodeBadRequest, "too many admin requests, slow down")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// statusRecorder captures the status code for the access log.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	n, err := s.ResponseWriter.Write(b)
	s.bytes += n
	return n, err
}

// Flush forwards to the wrapped writer so SSE keeps streaming through the log
// middleware.
func (s *statusRecorder) Flush() {
	if f, ok := s.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// loggingMiddleware writes one structured line per request (ARCHITECTURE §8.6).
func loggingMiddleware(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			elapsed := clock.Stopwatch()
			rec := &statusRecorder{ResponseWriter: w}
			next.ServeHTTP(rec, r)

			status := rec.status
			if status == 0 {
				status = http.StatusOK
			}
			level := slog.LevelInfo
			if status >= 500 {
				level = slog.LevelError
			} else if status >= 400 {
				level = slog.LevelWarn
			}
			log.LogAttrs(r.Context(), level, "http request",
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.String("query", r.URL.RawQuery),
				slog.Int("status", status),
				slog.Int("bytes", rec.bytes),
				slog.Duration("duration", elapsed()),
				slog.String("ip", clientIP(r)),
			)
		})
	}
}

// recoverMiddleware turns a panic into the standard 500 envelope.
func recoverMiddleware(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					log.Error("panic serving request", slog.Any("panic", rec), slog.String("path", r.URL.Path))
					writeError(w, http.StatusInternalServerError, CodeInternal, "internal error")
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// timeoutMiddleware bounds every request except the SSE stream, which is
// long-lived by design.
func timeoutMiddleware(d time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/v1/events") {
				next.ServeHTTP(w, r)
				return
			}
			http.TimeoutHandler(next, d, `{"error":{"code":"internal","message":"request timed out"}}`).ServeHTTP(w, r)
		})
	}
}
