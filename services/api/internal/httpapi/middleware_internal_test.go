package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// These exercise the pieces that need no database, so they run in CI even
// without TEST_DATABASE_URL.

func TestStrongETagIsStableAndContentAddressed(t *testing.T) {
	t.Parallel()

	a := strongETag([]byte(`{"a":1}`))
	b := strongETag([]byte(`{"a":1}`))
	c := strongETag([]byte(`{"a":2}`))

	require.Equal(t, a, b)
	require.NotEqual(t, a, c)
	require.Regexp(t, `^"[0-9a-f]{64}"$`, a, "a strong sha256 validator")
}

func TestETagMatches(t *testing.T) {
	t.Parallel()

	const etag = `"abc"`
	tests := []struct {
		header string
		want   bool
	}{
		{"", false},
		{`"abc"`, true},
		{`"other"`, false},
		{`"other", "abc"`, true},
		{`*`, true},
		{`W/"abc"`, false}, // weak validators do not match a strong one
	}
	for _, tc := range tests {
		require.Equal(t, tc.want, etagMatches(tc.header, etag), "header %q", tc.header)
	}
}

func TestClientIP(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.1.2.3:54321"
	require.Equal(t, "10.1.2.3", clientIP(req))

	req.Header.Set("X-Forwarded-For", "203.0.113.7, 10.0.0.1")
	require.Equal(t, "203.0.113.7", clientIP(req))

	req.Header.Set("X-Forwarded-For", "203.0.113.9")
	require.Equal(t, "203.0.113.9", clientIP(req))
}

func TestRateLimiterTokenBucket(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 9, 8, 10, 0, 0, 0, time.UTC)
	l := newRateLimiter(3, time.Minute, func() time.Time { return now })

	require.True(t, l.allow("a"))
	require.True(t, l.allow("a"))
	require.True(t, l.allow("a"))
	require.False(t, l.allow("a"), "the fourth request in the same instant is refused")

	// A different address has its own bucket.
	require.True(t, l.allow("b"))

	// After 20 seconds one token has been refilled (3 per minute).
	now = now.Add(21 * time.Second)
	require.True(t, l.allow("a"))
	require.False(t, l.allow("a"))
}

func TestRateLimiterDefaults(t *testing.T) {
	t.Parallel()

	l := newRateLimiter(0, 0, nil)
	require.Equal(t, 30.0, l.capacity)
	require.True(t, l.allow("a"))
}

func TestAdminAuthMiddleware(t *testing.T) {
	t.Parallel()

	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) })
	h := adminAuthMiddleware("secret")(next)

	t.Run("no key", func(t *testing.T) {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/admin/overrides", nil))
		require.Equal(t, http.StatusUnauthorized, rec.Code)
		require.JSONEq(t, `{"error":{"code":"unauthorized","message":"missing or invalid X-Api-Key"}}`, rec.Body.String())
	})

	t.Run("wrong key", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/overrides", nil)
		req.Header.Set("X-Api-Key", "nope")
		h.ServeHTTP(rec, req)
		require.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("right key", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/overrides", nil)
		req.Header.Set("X-Api-Key", "secret")
		h.ServeHTTP(rec, req)
		require.Equal(t, http.StatusTeapot, rec.Code)
	})

	t.Run("an unset key locks the endpoint rather than opening it", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/overrides", nil)
		adminAuthMiddleware("")(next).ServeHTTP(rec, req)
		require.Equal(t, http.StatusUnauthorized, rec.Code)
	})
}

func TestCORSMiddleware(t *testing.T) {
	t.Parallel()

	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })

	t.Run("allowed origin", func(t *testing.T) {
		h := corsMiddleware([]string{"http://localhost:3000"})(next)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/time", nil)
		req.Header.Set("Origin", "http://localhost:3000")
		h.ServeHTTP(rec, req)
		require.Equal(t, "http://localhost:3000", rec.Header().Get("Access-Control-Allow-Origin"))
		require.Contains(t, rec.Header().Get("Access-Control-Expose-Headers"), "ETag")
	})

	t.Run("foreign origin gets no header", func(t *testing.T) {
		h := corsMiddleware([]string{"http://localhost:3000"})(next)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/time", nil)
		req.Header.Set("Origin", "https://evil.example")
		h.ServeHTTP(rec, req)
		require.Empty(t, rec.Header().Get("Access-Control-Allow-Origin"))
	})

	t.Run("wildcard", func(t *testing.T) {
		h := corsMiddleware([]string{"*"})(next)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/time", nil)
		req.Header.Set("Origin", "https://anything.example")
		h.ServeHTTP(rec, req)
		require.Equal(t, "*", rec.Header().Get("Access-Control-Allow-Origin"))
	})

	t.Run("preflight", func(t *testing.T) {
		h := corsMiddleware([]string{"http://localhost:3000"})(next)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodOptions, "/api/v1/admin/overrides", nil)
		req.Header.Set("Origin", "http://localhost:3000")
		h.ServeHTTP(rec, req)
		require.Equal(t, http.StatusNoContent, rec.Code)
		require.Contains(t, rec.Header().Get("Access-Control-Allow-Headers"), "X-Api-Key")
	})
}

func TestRecoverMiddlewareReturnsTheEnvelope(t *testing.T) {
	t.Parallel()

	boom := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") })
	rec := httptest.NewRecorder()
	recoverMiddleware(discardLogger())(boom).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	require.Equal(t, http.StatusInternalServerError, rec.Code)
	require.JSONEq(t, `{"error":{"code":"internal","message":"internal error"}}`, rec.Body.String())
}

func TestTimeoutMiddlewareLetsTheStreamThrough(t *testing.T) {
	t.Parallel()

	var reached bool
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	})
	h := timeoutMiddleware(time.Millisecond)(next)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/events?building=A", nil))
	require.True(t, reached, "the SSE route is exempt from the request timeout")
	require.Equal(t, http.StatusOK, rec.Code)
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelError + 1}))
}
