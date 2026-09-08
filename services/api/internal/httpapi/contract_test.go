package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers"
	"github.com/getkin/kin-openapi/routers/legacy"
	"github.com/stretchr/testify/require"

	"github.com/kailholmes/campuslive/services/api/internal/clock"
	"github.com/kailholmes/campuslive/services/api/internal/engine"
	"github.com/kailholmes/campuslive/services/api/internal/httpapi"
	"github.com/kailholmes/campuslive/services/api/internal/mapspec"
	"github.com/kailholmes/campuslive/services/api/internal/realtime"
	"github.com/kailholmes/campuslive/services/api/internal/repo"
	"github.com/kailholmes/campuslive/services/api/internal/schedule"
	"github.com/kailholmes/campuslive/services/api/internal/service"
)

// specPath is the contract these tests validate every response against.
const specPath = "../../../../packages/contracts/openapi.yaml"

const (
	testAdminKey = "test-admin-key"
	// The design's hero instant: Tuesday 8 Sep 2026, 10:47 local.
	fixedNow = "2026-09-08T10:47:00+05:00"
)

// ---------------------------------------------------------------- fixture --

type fixture struct {
	t      *testing.T
	server *httptest.Server
	router routers.Router
	doc    *openapi3.T
	broker *realtime.Broker
	board  *service.Board
}

var (
	specOnce sync.Once
	specDoc  *openapi3.T
	specRtr  routers.Router
	specErr  error
)

func loadSpec(t *testing.T) (*openapi3.T, routers.Router) {
	t.Helper()
	specOnce.Do(func() {
		loader := openapi3.NewLoader()
		loader.IsExternalRefsAllowed = true
		specDoc, specErr = loader.LoadFromFile(specPath)
		if specErr != nil {
			return
		}
		// The contract is OpenAPI 3.1 and uses the 3.1 `examples` array on
		// schemas. kin-openapi v0.132 models only 3.0's singular `example` and
		// rejects `examples` as an unknown sibling field, so it is dropped
		// before validation. Nothing else is touched: the very schemas the
		// responses are checked against are the ones in the file. (The
		// document itself is linted by `redocly lint` in packages/contracts.)
		specDoc, specErr = withoutExamples(specDoc)
		if specErr != nil {
			return
		}
		if specErr = specDoc.Validate(loader.Context); specErr != nil {
			return
		}
		// The contract declares http://localhost:8080; the tests run on an
		// ephemeral httptest port, so route matching must ignore the host.
		specDoc.Servers = nil
		specRtr, specErr = legacy.NewRouter(specDoc)
	})
	require.NoError(t, specErr, "packages/contracts/openapi.yaml must load")
	return specDoc, specRtr
}

// withoutExamples round-trips the document with every `examples` keyword
// removed; see the comment in loadSpec.
func withoutExamples(doc *openapi3.T) (*openapi3.T, error) {
	raw, err := doc.MarshalJSON()
	if err != nil {
		return nil, err
	}
	var tree any
	if err := json.Unmarshal(raw, &tree); err != nil {
		return nil, err
	}
	stripped, err := json.Marshal(stripKey(tree, "examples"))
	if err != nil {
		return nil, err
	}
	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = true
	return loader.LoadFromData(stripped)
}

func stripKey(node any, key string) any {
	switch v := node.(type) {
	case map[string]any:
		delete(v, key)
		for k, child := range v {
			v[k] = stripKey(child, key)
		}
		return v
	case []any:
		for i, child := range v {
			v[i] = stripKey(child, key)
		}
		return v
	default:
		return node
	}
}

// newFixture migrates and seeds TEST_DATABASE_URL and starts the real router.
//
// Deliberate deviation from ARCHITECTURE §14: the integration tests connect to
// an existing PostgreSQL instead of starting one with testcontainers-go, which
// needs a Docker daemon. They skip when TEST_DATABASE_URL is unset.
func newFixture(t *testing.T) *fixture {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set; skipping the database-backed contract tests")
	}

	doc, router := loadSpec(t)
	ctx := context.Background()

	require.NoError(t, repo.Migrate(ctx, dsn))

	store, err := repo.New(ctx, dsn)
	require.NoError(t, err)
	t.Cleanup(store.Close)

	spec, err := mapspec.LoadDefault("")
	require.NoError(t, err)

	at, err := time.Parse(time.RFC3339, fixedNow)
	require.NoError(t, err)
	clk := clock.NewFixed(at)

	_, err = schedule.NewSeedSource(store.Pool(), spec, clk, true).Sync(ctx, at, at)
	require.NoError(t, err)

	board := service.NewBoard(store, clk, engine.DefaultThresholds())
	broker := realtime.New(realtime.Options{Clock: clk, HeartbeatInterval: time.Hour})
	t.Cleanup(broker.Close)

	srv := httpapi.NewServer(httpapi.Options{
		Board:           board,
		Broker:          broker,
		Spec:            spec,
		Logger:          slog.New(slog.NewTextHandler(io.Discard, nil)),
		AdminAPIKey:     testAdminKey,
		CORSOrigins:     []string{"http://localhost:3000"},
		DefaultBuilding: "A",
		Ready:           func(ctx context.Context) (bool, bool) { return store.Ping(ctx) == nil, true },
	})

	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	return &fixture{t: t, server: ts, router: router, doc: doc, broker: broker, board: board}
}

// call performs a request and validates the response against the contract.
func (f *fixture) call(method, path string, body any, headers map[string]string) (*http.Response, []byte) {
	f.t.Helper()

	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		require.NoError(f.t, err)
		reader = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(context.Background(), method, f.server.URL+path, reader)
	require.NoError(f.t, err)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := f.server.Client().Do(req)
	require.NoError(f.t, err)
	defer func() { _ = resp.Body.Close() }()

	raw, err := io.ReadAll(resp.Body)
	require.NoError(f.t, err)

	f.validate(req, resp, raw)
	return resp, raw
}

// validate runs kin-openapi's response validator: status, headers and body
// schema, for every operation of the contract.
func (f *fixture) validate(req *http.Request, resp *http.Response, body []byte) {
	f.t.Helper()

	route, pathParams, err := f.router.FindRoute(req)
	require.NoError(f.t, err, "%s %s is not in the contract", req.Method, req.URL.Path)

	input := &openapi3filter.ResponseValidationInput{
		RequestValidationInput: &openapi3filter.RequestValidationInput{
			Request:    req,
			PathParams: pathParams,
			Route:      route,
			Options:    &openapi3filter.Options{AuthenticationFunc: openapi3filter.NoopAuthenticationFunc},
		},
		Status:  resp.StatusCode,
		Header:  resp.Header,
		Options: &openapi3filter.Options{IncludeResponseStatus: true},
	}
	if len(body) > 0 {
		input.SetBodyBytes(body)
	}

	err = openapi3filter.ValidateResponse(context.Background(), input)
	require.NoError(f.t, err, "%s %s → %d does not match the contract\nbody: %s",
		req.Method, req.URL.Path, resp.StatusCode, truncate(body))
}

func truncate(b []byte) string {
	if len(b) > 800 {
		return string(b[:800]) + "…"
	}
	return string(b)
}

func decode[T any](t *testing.T, raw []byte) T {
	t.Helper()
	var v T
	require.NoError(t, json.Unmarshal(raw, &v), "body: %s", truncate(raw))
	return v
}

// ------------------------------------------------------------------- ops --

func TestContractOps(t *testing.T) {
	f := newFixture(t)

	resp, body := f.call(http.MethodGet, "/healthz", nil, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.JSONEq(t, `{"status":"ok"}`, string(body))

	resp, body = f.call(http.MethodGet, "/readyz", nil, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.JSONEq(t, `{"status":"ok","db":true,"snapshot":true}`, string(body))
}

// -------------------------------------------------------------- read side --

func TestContractListBuildings(t *testing.T) {
	f := newFixture(t)

	resp, body := f.call(http.MethodGet, "/api/v1/buildings", nil, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	buildings := decode[[]httpapi.Building](t, body)
	require.Len(t, buildings, 1)
	require.Equal(t, "A", buildings[0].Code)
	require.Equal(t, "Asia/Almaty", buildings[0].Timezone)
	require.EqualValues(t, 2, buildings[0].Floors)
}

func TestContractMap(t *testing.T) {
	f := newFixture(t)

	resp, body := f.call(http.MethodGet, "/api/v1/buildings/A/map", nil, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	etag := resp.Header.Get("ETag")
	require.NotEmpty(t, etag)
	require.True(t, strings.HasPrefix(etag, `"`), "the ETag must be a strong validator")

	spec := decode[httpapi.MapSpec](t, body)
	require.Equal(t, "A", spec.Building)
	require.Len(t, spec.Floors, 2, "the real building has two floors")
	require.Equal(t, []int{18, 33}, []int{
		len(spec.Floors[0].Rooms), len(spec.Floors[1].Rooms),
	})

	// Floor 2 is the only one with an atrium void.
	require.Nil(t, spec.Floors[0].Atrium)
	require.NotNil(t, spec.Floors[1].Atrium)

	// The same ETag comes back as 304.
	resp, body = f.call(http.MethodGet, "/api/v1/buildings/A/map", nil, map[string]string{"If-None-Match": etag})
	require.Equal(t, http.StatusNotModified, resp.StatusCode)
	require.Empty(t, body)
	require.Equal(t, etag, resp.Header.Get("ETag"))

	// A stale ETag gets the whole payload again.
	resp, _ = f.call(http.MethodGet, "/api/v1/buildings/A/map", nil, map[string]string{"If-None-Match": `"stale"`})
	require.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestContractMapUnknownBuilding(t *testing.T) {
	f := newFixture(t)

	resp, body := f.call(http.MethodGet, "/api/v1/buildings/ZZ/map", nil, nil)
	require.Equal(t, http.StatusNotFound, resp.StatusCode)

	e := decode[httpapi.Error](t, body)
	require.Equal(t, httpapi.ErrorBodyCode("not_found"), e.Error.Code)
}

func TestContractBoard(t *testing.T) {
	f := newFixture(t)

	resp, body := f.call(http.MethodGet, "/api/v1/buildings/A/board", nil, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	etag := resp.Header.Get("ETag")
	require.NotEmpty(t, etag)

	snap := decode[httpapi.Snapshot](t, body)
	require.Equal(t, "A", snap.Building)
	require.Equal(t, "2026-09-08", snap.Date)
	require.EqualValues(t, 3, snap.WeekNumber, "8 Sep 2026 is teaching week 3")
	require.Equal(t, httpapi.WeekParity("odd"), snap.WeekParity)
	require.Equal(t, "2026-09-08T05:47:00Z", snap.At.UTC().Format(time.RFC3339))
	require.EqualValues(t, 13, snap.Stats.RoomsTotal)
	require.GreaterOrEqual(t, len(snap.Now), 8, "the demo instant shows a busy building")
	require.NotEmpty(t, snap.Next)
	require.Len(t, snap.Rooms, 51, "every space of the building, schedulable or not")
	require.NotNil(t, snap.NextTransitionAt)

	// The demo instant's anchor row: the two-slot HK1105 lecture in the Assembly
	// Hall (100), live until 11:50 local (06:50 UTC).
	var found bool
	for _, s := range snap.Now {
		if s.RoomCode == "100" && s.CourseCode == "HK1105" {
			found = true
			require.Equal(t, httpapi.Phase("live"), s.Phase)
			require.Equal(t, "Преподаватель 7", s.Teacher.ShortName)
			require.Equal(t, []string{"Группа 1", "Группа 2", "Группа 3"}, s.Groups)
			require.Equal(t, "2026-09-08T06:50:00Z", s.EndAt.UTC().Format(time.RFC3339))
		}
	}
	require.True(t, found, "100 must be running HK1105 at 10:47")

	// A cancelled, a moved and a delayed row are all visible.
	var cancelled, moved bool
	for _, s := range snap.Next {
		switch s.Status {
		case "cancelled":
			cancelled = true
		case "moved":
			moved = true
			require.NotNil(t, s.MovedFromRoomCode)
		}
	}
	require.True(t, cancelled, "NEXT holds the cancelled lab")
	require.True(t, moved, "NEXT holds the moved lab")

	var delayed bool
	for _, s := range snap.Now {
		if s.Status == "delayed" {
			delayed = true
			require.NotNil(t, s.DelayMinutes)
			require.EqualValues(t, 15, *s.DelayMinutes)
		}
	}
	require.True(t, delayed, "NOW holds the delayed lab")

	resp, _ = f.call(http.MethodGet, "/api/v1/buildings/A/board", nil, map[string]string{"If-None-Match": etag})
	require.Equal(t, http.StatusNotModified, resp.StatusCode)
}

func TestContractBoardTimeTravel(t *testing.T) {
	f := newFixture(t)

	// 21:30 local: nothing is running and nothing is left today.
	resp, body := f.call(http.MethodGet, "/api/v1/buildings/A/board?at=2026-09-08T16:30:00Z", nil, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	snap := decode[httpapi.Snapshot](t, body)
	require.Empty(t, snap.Now)
	require.Empty(t, snap.Next)
	require.Nil(t, snap.NextTransitionAt)
	require.Zero(t, snap.Stats.RoomsBusy)

	// 14:05 local: a different, equally busy building.
	resp, body = f.call(http.MethodGet, "/api/v1/buildings/A/board?at=2026-09-08T09:05:00Z", nil, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	afternoon := decode[httpapi.Snapshot](t, body)
	require.NotEmpty(t, afternoon.Now)

	// Time travel must not disturb the live cache.
	resp, body = f.call(http.MethodGet, "/api/v1/buildings/A/board", nil, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	live := decode[httpapi.Snapshot](t, body)
	require.Equal(t, "2026-09-08T05:47:00Z", live.At.UTC().Format(time.RFC3339))
}

func TestContractBoardBadDate(t *testing.T) {
	f := newFixture(t)

	resp, body := f.call(http.MethodGet, "/api/v1/buildings/A/board?date=8-9-2026", nil, nil)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, httpapi.ErrorBodyCode("bad_request"), decode[httpapi.Error](t, body).Error.Code)
}

func TestContractTimeline(t *testing.T) {
	f := newFixture(t)

	resp, body := f.call(http.MethodGet, "/api/v1/buildings/A/timeline?date=2026-09-08", nil, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	tl := decode[httpapi.Timeline](t, body)
	require.Equal(t, "A", tl.Building)
	require.Equal(t, "2026-09-08", tl.Date)
	require.NotEmpty(t, tl.Sessions)

	for i := 1; i < len(tl.Sessions); i++ {
		require.False(t, tl.Sessions[i].StartAt.Before(tl.Sessions[i-1].StartAt), "sorted by startAt")
	}
}

func TestContractDayViews(t *testing.T) {
	f := newFixture(t)

	t.Run("room", func(t *testing.T) {
		resp, body := f.call(http.MethodGet, "/api/v1/rooms/100/day?date=2026-09-08", nil, nil)
		require.Equal(t, http.StatusOK, resp.StatusCode)
		day := decode[httpapi.DaySessions](t, body)
		require.Equal(t, "2026-09-08", day.Date)
		require.NotEmpty(t, day.Sessions)
		for _, s := range day.Sessions {
			require.Equal(t, "100", s.RoomCode)
		}
	})

	t.Run("room moved into shows up, moved out does not", func(t *testing.T) {
		_, body := f.call(http.MethodGet, "/api/v1/rooms/101/day?date=2026-09-08", nil, nil)
		into := decode[httpapi.DaySessions](t, body)
		var sawMoved bool
		for _, s := range into.Sessions {
			if s.Status == "moved" {
				sawMoved = true
				require.NotNil(t, s.MovedFromRoomCode)
				require.Equal(t, "226A", *s.MovedFromRoomCode)
			}
		}
		require.True(t, sawMoved, "the 226A lab was moved into 101")

		_, body = f.call(http.MethodGet, "/api/v1/rooms/226A/day?date=2026-09-08", nil, nil)
		for _, s := range decode[httpapi.DaySessions](t, body).Sessions {
			require.NotEqual(t, httpapi.SessionStatus("moved"), s.Status, "a session moved out of 226A must not be listed here")
		}
	})

	t.Run("unknown room", func(t *testing.T) {
		resp, body := f.call(http.MethodGet, "/api/v1/rooms/999/day", nil, nil)
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
		require.Equal(t, httpapi.ErrorBodyCode("not_found"), decode[httpapi.Error](t, body).Error.Code)
	})

	t.Run("group", func(t *testing.T) {
		resp, body := f.call(http.MethodGet, "/api/v1/groups/%D0%93%D1%80%D1%83%D0%BF%D0%BF%D0%B0%201/day?date=2026-09-08", nil, nil)
		require.Equal(t, http.StatusOK, resp.StatusCode)
		day := decode[httpapi.DaySessions](t, body)
		require.NotEmpty(t, day.Sessions)
		for _, s := range day.Sessions {
			require.Contains(t, s.Groups, "Группа 1")
		}
	})

	t.Run("unknown group", func(t *testing.T) {
		resp, _ := f.call(http.MethodGet, "/api/v1/groups/XX0000/day", nil, nil)
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
	})

	t.Run("teacher", func(t *testing.T) {
		_, body := f.call(http.MethodGet, "/api/v1/search?q=%D0%9F%D1%80%D0%B5%D0%BF%D0%BE%D0%B4%D0%B0%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8C%201", nil, nil)
		hits := decode[httpapi.SearchResult](t, body)
		require.NotEmpty(t, hits.Teachers)
		id := hits.Teachers[0].Id

		resp, body := f.call(http.MethodGet, "/api/v1/teachers/"+id.String()+"/day?date=2026-09-08", nil, nil)
		require.Equal(t, http.StatusOK, resp.StatusCode)
		day := decode[httpapi.DaySessions](t, body)
		require.NotEmpty(t, day.Sessions)
		for _, s := range day.Sessions {
			require.Equal(t, id, s.Teacher.Id)
		}
	})

	t.Run("unknown teacher", func(t *testing.T) {
		resp, _ := f.call(http.MethodGet, "/api/v1/teachers/00000000-0000-0000-0000-000000000000/day", nil, nil)
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
	})
}

func TestContractSearch(t *testing.T) {
	f := newFixture(t)

	t.Run("cyrillic group code", func(t *testing.T) {
		resp, body := f.call(http.MethodGet, "/api/v1/search?q=%D0%93%D1%80%D1%83%D0%BF%D0%BF%D0%B0%201", nil, nil)
		require.Equal(t, http.StatusOK, resp.StatusCode)
		hits := decode[httpapi.SearchResult](t, body)
		require.NotEmpty(t, hits.Groups)
		require.Equal(t, "Группа 1", hits.Groups[0].Code, "an exact code sorts first")
		require.NotNil(t, hits.Teachers)
		require.NotNil(t, hits.Rooms)
		require.NotNil(t, hits.Courses)
	})

	t.Run("case-insensitive", func(t *testing.T) {
		// Room codes are the latin part of the data set; the roster is Cyrillic.
		_, body := f.call(http.MethodGet, "/api/v1/search?q=ai-LaB", nil, nil)
		hits := decode[httpapi.SearchResult](t, body)
		require.NotEmpty(t, hits.Rooms)
		require.Equal(t, "AI-LAB", hits.Rooms[0].Code)

		_, body = f.call(http.MethodGet, "/api/v1/search?q=%D0%9F%D1%80%D0%B5%D0%BF%D0%BE%D0%B4%D0%B0%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8C", nil, nil)
		require.NotEmpty(t, decode[httpapi.SearchResult](t, body).Teachers)
	})

	t.Run("at most five per kind by default", func(t *testing.T) {
		_, body := f.call(http.MethodGet, "/api/v1/search?q=a", nil, nil)
		hits := decode[httpapi.SearchResult](t, body)
		require.LessOrEqual(t, len(hits.Teachers), 5)
		require.LessOrEqual(t, len(hits.Groups), 5)
		require.LessOrEqual(t, len(hits.Rooms), 5)
		require.LessOrEqual(t, len(hits.Courses), 5)
	})

	t.Run("limit is honoured", func(t *testing.T) {
		// Only five courses exist, so the roster is what can exceed the default
		// page of five: there are twenty-four groups named "Группа N".
		_, body := f.call(http.MethodGet, "/api/v1/search?q=%D0%93%D1%80%D1%83%D0%BF%D0%BF%D0%B0&limit=10", nil, nil)
		hits := decode[httpapi.SearchResult](t, body)
		require.LessOrEqual(t, len(hits.Groups), 10)
		require.Greater(t, len(hits.Groups), 5)
	})

	t.Run("empty query", func(t *testing.T) {
		resp, body := f.call(http.MethodGet, "/api/v1/search?q=%20", nil, nil)
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		require.Equal(t, httpapi.ErrorBodyCode("bad_request"), decode[httpapi.Error](t, body).Error.Code)
	})
}

func TestContractTime(t *testing.T) {
	f := newFixture(t)

	resp, body := f.call(http.MethodGet, "/api/v1/time", nil, nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	info := decode[httpapi.TimeInfo](t, body)
	require.Equal(t, httpapi.ClockMode("fixed"), info.Mode)
	require.Equal(t, "Asia/Almaty", info.Timezone)
	require.Equal(t, "2026-09-08T05:47:00Z", info.Now.UTC().Format(time.RFC3339))
}

// ------------------------------------------------------------------ admin --

func TestContractAdminRequiresKey(t *testing.T) {
	f := newFixture(t)

	for _, tc := range []struct {
		name, method, path string
		body               any
	}{
		{"create override", http.MethodPost, "/api/v1/admin/overrides", map[string]any{"date": "2026-09-08", "kind": "cancel"}},
		{"delete override", http.MethodDelete, "/api/v1/admin/overrides/00000000-0000-0000-0000-000000000000", nil},
		{"announcement", http.MethodPost, "/api/v1/admin/announcements", map[string]any{"text": "hi"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			resp, body := f.call(tc.method, tc.path, tc.body, nil)
			require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
			require.Equal(t, httpapi.ErrorBodyCode("unauthorized"), decode[httpapi.Error](t, body).Error.Code)
		})
	}

	resp, body := f.call(http.MethodPost, "/api/v1/admin/announcements",
		map[string]any{"text": "hi"}, map[string]string{"X-Api-Key": "wrong"})
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	require.Equal(t, httpapi.ErrorBodyCode("unauthorized"), decode[httpapi.Error](t, body).Error.Code)
}

func (f *fixture) adminHeaders() map[string]string {
	return map[string]string{"X-Api-Key": testAdminKey}
}

// lessonInRoom finds a templated lesson that runs in a room on the fixed date.
func (f *fixture) lessonInRoom(code string) string {
	f.t.Helper()
	for _, s := range f.roomDay(code) {
		if s.LessonId != nil && s.Status == "scheduled" {
			return s.LessonId.String()
		}
	}
	f.t.Fatalf("no scheduled session in room %s on 2026-09-08", code)
	return ""
}

// liveLessonInRoom finds the lesson that is running in a room right now.
func (f *fixture) liveLessonInRoom(code string) string {
	f.t.Helper()
	_, body := f.call(http.MethodGet, "/api/v1/buildings/A/board", nil, nil)
	for _, s := range decode[httpapi.Snapshot](f.t, body).Now {
		if s.RoomCode == code && s.LessonId != nil && s.Status == "scheduled" {
			return s.LessonId.String()
		}
	}
	f.t.Fatalf("nothing is running in room %s at the fixed instant", code)
	return ""
}

// someTeacher is the first of the placeholder roster, read through the
// reference endpoint the admin panel uses.
func (f *fixture) someTeacher() httpapi.TeacherRef {
	f.t.Helper()
	_, body := f.call(http.MethodGet, "/api/v1/teachers", nil, nil)
	list := decode[httpapi.TeacherList](f.t, body).Teachers
	require.NotEmpty(f.t, list)
	return list[0]
}

// otherTeacher is any placeholder other than the given one.
func (f *fixture) otherTeacher(notID string) httpapi.TeacherRef {
	f.t.Helper()
	_, body := f.call(http.MethodGet, "/api/v1/teachers", nil, nil)
	for _, x := range decode[httpapi.TeacherList](f.t, body).Teachers {
		if x.Id.String() != notID {
			return x
		}
	}
	f.t.Fatal("only one teacher exists")
	return httpapi.TeacherRef{}
}

// freeTeacherAt is a teacher with nothing booked in that weekday and slot.
func (f *fixture) freeTeacherAt(weekday, slot int) httpapi.TeacherRef {
	f.t.Helper()
	_, body := f.call(http.MethodGet,
		fmt.Sprintf("/api/v1/admin/lessons?weekday=%d", weekday), nil, f.adminHeaders())
	busy := map[string]bool{}
	for _, l := range decode[httpapi.LessonList](f.t, body).Lessons {
		if int(l.SlotIdx) <= slot && slot < int(l.SlotIdx)+int(l.SlotSpan) {
			busy[l.TeacherId.String()] = true
		}
	}
	_, body = f.call(http.MethodGet, "/api/v1/teachers", nil, nil)
	for _, x := range decode[httpapi.TeacherList](f.t, body).Teachers {
		if !busy[x.Id.String()] {
			return x
		}
	}
	f.t.Fatalf("every teacher is busy on weekday %d slot %d", weekday, slot)
	return httpapi.TeacherRef{}
}

// courseByCode is one of the five subjects, read through the reference endpoint.
func (f *fixture) courseByCode(code string) httpapi.SearchCourse {
	f.t.Helper()
	_, body := f.call(http.MethodGet, "/api/v1/courses", nil, nil)
	for _, c := range decode[httpapi.CourseList](f.t, body).Courses {
		if c.Code == code {
			return c
		}
	}
	f.t.Fatalf("no course %s", code)
	return httpapi.SearchCourse{}
}

// someSemester is the current term.
func (f *fixture) someSemester() httpapi.Semester {
	f.t.Helper()
	_, body := f.call(http.MethodGet, "/api/v1/semesters", nil, nil)
	list := decode[httpapi.SemesterList](f.t, body).Semesters
	require.NotEmpty(f.t, list)
	return list[0]
}

// roomDay is the room's sessions on the fixed demo date.
func (f *fixture) roomDay(code string) []httpapi.SessionView {
	f.t.Helper()
	_, body := f.call(http.MethodGet, "/api/v1/rooms/"+code+"/day?date=2026-09-08", nil, nil)
	return decode[httpapi.DaySessions](f.t, body).Sessions
}

// statusOfLesson reads a lesson's materialised status off the day timeline.
func (f *fixture) statusOfLesson(lessonID string) httpapi.SessionStatus {
	f.t.Helper()
	_, body := f.call(http.MethodGet, "/api/v1/buildings/A/timeline?date=2026-09-08", nil, nil)
	for _, s := range decode[httpapi.Timeline](f.t, body).Sessions {
		if s.LessonId != nil && s.LessonId.String() == lessonID {
			return s.Status
		}
	}
	f.t.Fatalf("lesson %s is not on the timeline", lessonID)
	return ""
}

func TestContractCreateOverrideKinds(t *testing.T) {
	f := newFixture(t)

	t.Run("cancel by lessonId", func(t *testing.T) {
		id := f.liveLessonInRoom("100")
		resp, body := f.call(http.MethodPost, "/api/v1/admin/overrides", map[string]any{
			"date": "2026-09-08", "kind": "cancel", "lessonId": id, "note": "contract test",
		}, f.adminHeaders())
		require.Equal(t, http.StatusCreated, resp.StatusCode)

		ov := decode[httpapi.Override](t, body)
		require.Equal(t, httpapi.OverrideKind("cancel"), ov.Kind)
		require.NotNil(t, ov.LessonId)
		require.Equal(t, id, ov.LessonId.String())
		require.NotNil(t, ov.Note)

		// It takes effect on the materialised day straight away…
		require.Equal(t, httpapi.SessionStatus("cancelled"), f.statusOfLesson(id))

		// …and a cancelled session no longer occupies its room.
		_, body = f.call(http.MethodGet, "/api/v1/buildings/A/board", nil, nil)
		for _, r := range decode[httpapi.Snapshot](t, body).Rooms {
			if r.RoomCode == "100" {
				require.Equal(t, httpapi.RoomPhase("free"), r.Phase)
			}
		}

		// Rolling it back restores the row.
		resp, _ = f.call(http.MethodDelete, "/api/v1/admin/overrides/"+ov.Id.String(), nil, f.adminHeaders())
		require.Equal(t, http.StatusNoContent, resp.StatusCode)
		require.Equal(t, httpapi.SessionStatus("scheduled"), f.statusOfLesson(id))
	})

	t.Run("cancel by sessionId", func(t *testing.T) {
		id := f.lessonInRoom("101")
		resp, body := f.call(http.MethodPost, "/api/v1/admin/overrides", map[string]any{
			"date": "2026-09-08", "kind": "cancel", "sessionId": id + ":2026-09-08",
		}, f.adminHeaders())
		require.Equal(t, http.StatusCreated, resp.StatusCode)
		ov := decode[httpapi.Override](t, body)
		require.Equal(t, id, ov.LessonId.String())
		f.call(http.MethodDelete, "/api/v1/admin/overrides/"+ov.Id.String(), nil, f.adminHeaders())
	})

	t.Run("move", func(t *testing.T) {
		id := f.lessonInRoom("100")
		resp, body := f.call(http.MethodPost, "/api/v1/admin/overrides", map[string]any{
			"date": "2026-09-08", "kind": "move", "lessonId": id, "newRoomCode": "224",
		}, f.adminHeaders())
		require.Equal(t, http.StatusCreated, resp.StatusCode)
		ov := decode[httpapi.Override](t, body)
		require.NotNil(t, ov.NewRoomCode)
		require.Equal(t, "224", *ov.NewRoomCode)
		require.Equal(t, httpapi.SessionStatus("moved"), f.statusOfLesson(id))
		f.call(http.MethodDelete, "/api/v1/admin/overrides/"+ov.Id.String(), nil, f.adminHeaders())
	})

	t.Run("delay", func(t *testing.T) {
		id := f.lessonInRoom("100")
		resp, body := f.call(http.MethodPost, "/api/v1/admin/overrides", map[string]any{
			"date": "2026-09-08", "kind": "delay", "lessonId": id, "delayMinutes": 20,
		}, f.adminHeaders())
		require.Equal(t, http.StatusCreated, resp.StatusCode)
		ov := decode[httpapi.Override](t, body)
		require.NotNil(t, ov.DelayMinutes)
		require.EqualValues(t, 20, *ov.DelayMinutes)
		require.Equal(t, httpapi.SessionStatus("delayed"), f.statusOfLesson(id))
		f.call(http.MethodDelete, "/api/v1/admin/overrides/"+ov.Id.String(), nil, f.adminHeaders())
	})

	t.Run("reassign_teacher", func(t *testing.T) {
		teacher := f.someTeacher()

		id := f.lessonInRoom("100")
		resp, body := f.call(http.MethodPost, "/api/v1/admin/overrides", map[string]any{
			"date": "2026-09-08", "kind": "reassign_teacher", "lessonId": id, "newTeacherId": teacher.Id.String(),
		}, f.adminHeaders())
		require.Equal(t, http.StatusCreated, resp.StatusCode)
		ov := decode[httpapi.Override](t, body)
		require.NotNil(t, ov.NewTeacherId)
		f.call(http.MethodDelete, "/api/v1/admin/overrides/"+ov.Id.String(), nil, f.adminHeaders())
	})

	t.Run("extra", func(t *testing.T) {
		teacher := f.someTeacher()

		resp, body := f.call(http.MethodPost, "/api/v1/admin/overrides", map[string]any{
			"date": "2026-09-08", "kind": "extra",
			"courseCode": "HK1105", "roomCode": "CR", "teacherId": teacher.Id.String(),
			"slotIdx": 9, "groupCodes": []string{"Группа 1"}, "note": "one-off",
		}, f.adminHeaders())
		require.Equal(t, http.StatusCreated, resp.StatusCode)

		ov := decode[httpapi.Override](t, body)
		require.Equal(t, httpapi.OverrideKind("extra"), ov.Kind)
		require.Nil(t, ov.LessonId)
		require.NotNil(t, ov.RoomCode)
		require.Equal(t, "CR", *ov.RoomCode)
		require.NotNil(t, ov.SlotIdx)
		require.EqualValues(t, 9, *ov.SlotIdx)

		// The one-off session is on the day's timeline with an `x:` id.
		_, body = f.call(http.MethodGet, "/api/v1/buildings/A/timeline?date=2026-09-08", nil, nil)
		var seen bool
		for _, s := range decode[httpapi.Timeline](t, body).Sessions {
			if s.SessionId == "x:"+ov.Id.String() {
				seen = true
				require.Nil(t, s.LessonId)
				require.Equal(t, "HK1105", s.CourseCode)
				require.Equal(t, []string{"Группа 1"}, s.Groups)
			}
		}
		require.True(t, seen, "the extra session must be materialised")

		f.call(http.MethodDelete, "/api/v1/admin/overrides/"+ov.Id.String(), nil, f.adminHeaders())
	})
}

func TestContractCreateOverrideValidation(t *testing.T) {
	f := newFixture(t)
	id := f.lessonInRoom("100")

	cases := []struct {
		name   string
		body   map[string]any
		status int
	}{
		{"no target", map[string]any{"date": "2026-09-08", "kind": "cancel"}, http.StatusBadRequest},
		{"bad date", map[string]any{"date": "08.09.2026", "kind": "cancel", "lessonId": id}, http.StatusBadRequest},
		{"sessionId without a date", map[string]any{"date": "2026-09-08", "kind": "cancel", "sessionId": id}, http.StatusBadRequest},
		{"sessionId with the wrong date", map[string]any{"date": "2026-09-08", "kind": "cancel", "sessionId": id + ":2026-09-09"}, http.StatusBadRequest},
		{"move without a room", map[string]any{"date": "2026-09-08", "kind": "move", "lessonId": id}, http.StatusBadRequest},
		{"move to a missing room", map[string]any{"date": "2026-09-08", "kind": "move", "lessonId": id, "newRoomCode": "999"}, http.StatusNotFound},
		{"delay without minutes", map[string]any{"date": "2026-09-08", "kind": "delay", "lessonId": id}, http.StatusBadRequest},
		{"negative delay", map[string]any{"date": "2026-09-08", "kind": "delay", "lessonId": id, "delayMinutes": -5}, http.StatusBadRequest},
		{"reassign without a teacher", map[string]any{"date": "2026-09-08", "kind": "reassign_teacher", "lessonId": id}, http.StatusBadRequest},
		{"unknown lesson", map[string]any{"date": "2026-09-08", "kind": "cancel", "lessonId": "00000000-0000-0000-0000-000000000000"}, http.StatusNotFound},
		{"extra without its fields", map[string]any{"date": "2026-09-08", "kind": "extra"}, http.StatusBadRequest},
		{"extra with an unknown course", map[string]any{
			"date": "2026-09-08", "kind": "extra", "courseCode": "ZZ999", "roomCode": "107",
			"teacherId": "00000000-0000-0000-0000-000000000000", "slotIdx": 9,
		}, http.StatusNotFound},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp, _ := f.call(http.MethodPost, "/api/v1/admin/overrides", tc.body, f.adminHeaders())
			require.Equal(t, tc.status, resp.StatusCode)
		})
	}
}

func TestContractDeleteUnknownOverride(t *testing.T) {
	f := newFixture(t)

	resp, body := f.call(http.MethodDelete,
		"/api/v1/admin/overrides/00000000-0000-0000-0000-000000000000", nil, f.adminHeaders())
	require.Equal(t, http.StatusNotFound, resp.StatusCode)
	require.Equal(t, httpapi.ErrorBodyCode("not_found"), decode[httpapi.Error](t, body).Error.Code)
}

func TestContractAnnouncement(t *testing.T) {
	f := newFixture(t)

	resp, body := f.call(http.MethodPost, "/api/v1/admin/announcements", map[string]any{
		"text": "Contract test line", "severity": "warning",
	}, f.adminHeaders())
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	a := decode[httpapi.Announcement](t, body)
	require.Equal(t, "A", a.Building)
	require.Equal(t, "Contract test line", a.Text)
	require.Equal(t, httpapi.Severity("warning"), a.Severity)
	// The default TTL is 30 minutes from the server's own now.
	require.Equal(t, 30*time.Minute, a.EndsAt.Sub(a.StartsAt))
	require.Equal(t, "2026-09-08T05:47:00Z", a.StartsAt.UTC().Format(time.RFC3339))

	t.Run("empty text", func(t *testing.T) {
		resp, _ := f.call(http.MethodPost, "/api/v1/admin/announcements",
			map[string]any{"text": "  "}, f.adminHeaders())
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})

	t.Run("window that ends before it starts", func(t *testing.T) {
		resp, _ := f.call(http.MethodPost, "/api/v1/admin/announcements", map[string]any{
			"text": "bad window", "startsAt": "2026-09-08T10:00:00Z", "endsAt": "2026-09-08T09:00:00Z",
		}, f.adminHeaders())
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})
}

// ------------------------------------------------------------------- SSE --

// An override must reach an open stream in well under a second
// (ARCHITECTURE §12.2, prompt phase 4).
func TestSSEOverrideReachesTheStreamWithinASecond(t *testing.T) {
	f := newFixture(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, f.server.URL+"/api/v1/events?building=A", nil)
	require.NoError(t, err)
	resp, err := f.server.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, "text/event-stream", resp.Header.Get("Content-Type"))
	require.Equal(t, "no-cache", resp.Header.Get("Cache-Control"))
	require.Equal(t, "no", resp.Header.Get("X-Accel-Buffering"))

	events := make(chan sseEvent, 8)
	go readSSE(resp.Body, events)

	// The first frame is the current snapshot.
	first := waitEvent(t, events, 3*time.Second)
	require.Equal(t, "snapshot", first.name)
	before := decode[httpapi.Snapshot](t, []byte(first.data))
	require.NotEmpty(t, before.Now)

	// Cancel a running session…
	id := f.liveLessonInRoom("100")
	postResp, postBody := f.call(http.MethodPost, "/api/v1/admin/overrides", map[string]any{
		"date": "2026-09-08", "kind": "cancel", "lessonId": id, "note": "sse test",
	}, f.adminHeaders())
	require.Equal(t, http.StatusCreated, postResp.StatusCode)
	ov := decode[httpapi.Override](t, postBody)

	// …and the next snapshot arrives with it applied.
	second := waitEvent(t, events, time.Second)
	require.Equal(t, "snapshot", second.name)
	after := decode[httpapi.Snapshot](t, []byte(second.data))

	var stillRunning bool
	for _, s := range after.Now {
		if s.LessonId != nil && s.LessonId.String() == id {
			stillRunning = true
		}
	}
	require.False(t, stillRunning, "the cancelled session must be gone from NOW")
	require.Less(t, after.Stats.RoomsBusy, before.Stats.RoomsBusy)

	// A new announcement arrives on the same stream.
	_, _ = f.call(http.MethodPost, "/api/v1/admin/announcements",
		map[string]any{"text": "sse announcement"}, f.adminHeaders())

	var sawAnnouncement bool
	deadline := time.After(2 * time.Second)
	for !sawAnnouncement {
		select {
		case ev := <-events:
			if ev.name == "announcement" {
				sawAnnouncement = true
				a := decode[httpapi.Announcement](t, []byte(ev.data))
				require.Equal(t, "sse announcement", a.Text)
			}
		case <-deadline:
			t.Fatal("no announcement event arrived")
		}
	}

	f.call(http.MethodDelete, "/api/v1/admin/overrides/"+ov.Id.String(), nil, f.adminHeaders())
}

func TestSSEUnknownBuilding(t *testing.T) {
	f := newFixture(t)

	resp, body := f.call(http.MethodGet, "/api/v1/events?building=ZZ", nil, nil)
	require.Equal(t, http.StatusNotFound, resp.StatusCode)
	require.Equal(t, httpapi.ErrorBodyCode("not_found"), decode[httpapi.Error](t, body).Error.Code)
}

type sseEvent struct{ name, data string }

// readSSE parses the `event:` / `data:` frames of a text/event-stream body.
func readSSE(r io.Reader, out chan<- sseEvent) {
	defer close(out)
	buf := make([]byte, 64*1024)
	var pending, name, data string

	for {
		n, err := r.Read(buf)
		if n > 0 {
			pending += string(buf[:n])
			for {
				line, rest, ok := strings.Cut(pending, "\n")
				if !ok {
					break
				}
				pending = rest
				line = strings.TrimSuffix(line, "\r")
				switch {
				case strings.HasPrefix(line, "event: "):
					name = strings.TrimPrefix(line, "event: ")
				case strings.HasPrefix(line, "data: "):
					data = strings.TrimPrefix(line, "data: ")
				case line == "":
					if name != "" {
						out <- sseEvent{name: name, data: data}
						name, data = "", ""
					}
				}
			}
		}
		if err != nil {
			return
		}
	}
}

func waitEvent(t *testing.T, events <-chan sseEvent, within time.Duration) sseEvent {
	t.Helper()
	select {
	case ev, ok := <-events:
		require.True(t, ok, "the stream closed unexpectedly")
		return ev
	case <-time.After(within):
		t.Fatalf("no SSE event within %s", within)
		return sseEvent{}
	}
}
