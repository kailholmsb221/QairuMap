// Package httpapi is the HTTP surface of the service. Every route, request
// object and response object in gen.go is generated from
// packages/contracts/openapi.yaml — the contract is the source of truth, and no
// DTO is ever hand-written (CLAUDE.md).
//
//go:generate sh -c "cd ../.. && oapi-codegen -config oapi.yaml ../../packages/contracts/openapi.yaml"
package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kailholmes/campuslive/services/api/internal/clock"
	"github.com/kailholmes/campuslive/services/api/internal/domain"
	"github.com/kailholmes/campuslive/services/api/internal/mapspec"
	"github.com/kailholmes/campuslive/services/api/internal/realtime"
	"github.com/kailholmes/campuslive/services/api/internal/repo"
	"github.com/kailholmes/campuslive/services/api/internal/service"
)

// requestTimeout bounds every request except the SSE stream.
const requestTimeout = 20 * time.Second

// Options configure the server.
type Options struct {
	Board           *service.Board
	Broker          *realtime.Broker
	Spec            *mapspec.Spec
	Logger          *slog.Logger
	AdminAPIKey     string
	CORSOrigins     []string
	DefaultBuilding string
	// Invalidate pokes the scheduler so an admin change rebuilds and is
	// broadcast immediately (ARCHITECTURE §8.3).
	Invalidate func(building string)
	// Ready reports whether the service may serve traffic; `/readyz`.
	Ready func(ctx context.Context) (db bool, snapshot bool)
	// AdminRateLimit is the admin token-bucket capacity per minute per IP.
	AdminRateLimit int
}

// Server implements the generated strict server interface.
type Server struct {
	opts Options
	log  *slog.Logger

	mapMu    sync.Mutex
	mapCache map[string]rendered
}

type rendered struct {
	body []byte
	etag string
}

// NewServer builds the server.
func NewServer(opts Options) *Server {
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	if opts.DefaultBuilding == "" {
		opts.DefaultBuilding = "A"
	}
	if opts.AdminRateLimit <= 0 {
		opts.AdminRateLimit = 60
	}
	srv := &Server{opts: opts, log: opts.Logger, mapCache: map[string]rendered{}}
	if srv.opts.Invalidate == nil {
		// Without a scheduler wired in (contract tests, embedded use) the
		// server rebuilds and broadcasts the change itself, so an override
		// still reaches every client immediately.
		srv.opts.Invalidate = srv.rebuildAndPublish
	}
	return srv
}

// requestKey carries the raw request into the strict handlers, which otherwise
// only receive a context (needed for the caller's address).
type requestKey struct{}

func withRequest(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestKey{}, r)))
	})
}

func requestFrom(ctx context.Context) *http.Request {
	r, _ := ctx.Value(requestKey{}).(*http.Request)
	return r
}

func ipFrom(ctx context.Context) string {
	if r := requestFrom(ctx); r != nil {
		return clientIP(r)
	}
	return "unknown"
}

func ifNoneMatch(ctx context.Context) string {
	if r := requestFrom(ctx); r != nil {
		return r.Header.Get("If-None-Match")
	}
	return ""
}

// Handler builds the chi router with every middleware in place.
func (s *Server) Handler() http.Handler {
	limiter := newRateLimiter(s.opts.AdminRateLimit, time.Minute, nil)

	r := chi.NewRouter()
	r.Use(
		recoverMiddleware(s.log),
		loggingMiddleware(s.log),
		corsMiddleware(s.opts.CORSOrigins),
		timeoutMiddleware(requestTimeout),
		withRequest,
	)

	// The three /admin/* operations are the only ones behind the shared key and
	// the token bucket (ARCHITECTURE §16).
	adminGuard := func(next http.Handler) http.Handler {
		auth := adminAuthMiddleware(s.opts.AdminAPIKey)(next)
		limited := limiter.middleware(auth)
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			if strings.HasPrefix(req.URL.Path, "/api/v1/admin/") {
				limited.ServeHTTP(w, req)
				return
			}
			next.ServeHTTP(w, req)
		})
	}

	strict := NewStrictHandler(s, nil)
	HandlerWithOptions(strict, ChiServerOptions{
		BaseRouter:  r,
		Middlewares: []MiddlewareFunc{adminGuard},
		ErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, err error) {
			writeError(w, http.StatusBadRequest, CodeBadRequest, err.Error())
		},
	})

	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotFound, CodeNotFound, "no such endpoint")
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusMethodNotAllowed, CodeBadRequest, "method not allowed")
	})
	return r
}

// ------------------------------------------------------------ raw responses --

// rawJSON writes a pre-marshalled body so that the bytes the ETag was computed
// over are exactly the bytes on the wire.
type rawJSON struct {
	body  []byte
	etag  string
	cache string
}

func (r rawJSON) write(w http.ResponseWriter) error {
	h := w.Header()
	h.Set("Content-Type", "application/json")
	if r.etag != "" {
		h.Set("ETag", r.etag)
	}
	if r.cache != "" {
		h.Set("Cache-Control", r.cache)
	}
	w.WriteHeader(http.StatusOK)
	_, err := w.Write(r.body)
	return err
}

func (r rawJSON) VisitGetBoardResponse(w http.ResponseWriter) error       { return r.write(w) }
func (r rawJSON) VisitGetBuildingMapResponse(w http.ResponseWriter) error { return r.write(w) }

type notModified struct{ etag string }

func (n notModified) write(w http.ResponseWriter) error {
	w.Header().Set("ETag", n.etag)
	w.WriteHeader(http.StatusNotModified)
	return nil
}

func (n notModified) VisitGetBoardResponse(w http.ResponseWriter) error       { return n.write(w) }
func (n notModified) VisitGetBuildingMapResponse(w http.ResponseWriter) error { return n.write(w) }

// strongETag is the sha256 of the payload, quoted — a strong validator, as the
// contract promises.
func strongETag(body []byte) string {
	sum := sha256.Sum256(body)
	return `"` + hex.EncodeToString(sum[:]) + `"`
}

// etagMatches implements the If-None-Match comparison for strong validators.
func etagMatches(header, etag string) bool {
	if header == "" {
		return false
	}
	for _, candidate := range strings.Split(header, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "*" || candidate == etag {
			return true
		}
	}
	return false
}

// -------------------------------------------------------------------- ops --

// Healthz answers as long as the process is running.
func (s *Server) Healthz(_ context.Context, _ HealthzRequestObject) (HealthzResponseObject, error) {
	return Healthz200JSONResponse{Status: "ok"}, nil
}

// Readyz reports whether the database answered and the first snapshot is built.
func (s *Server) Readyz(ctx context.Context, _ ReadyzRequestObject) (ReadyzResponseObject, error) {
	db, snapshot := true, true
	if s.opts.Ready != nil {
		db, snapshot = s.opts.Ready(ctx)
	}
	body := Ready{Db: db, Snapshot: snapshot, Status: "ok"}
	if !db || !snapshot {
		body.Status = "degraded"
		return Readyz503JSONResponse(body), nil
	}
	return Readyz200JSONResponse(body), nil
}

// -------------------------------------------------------------- buildings --

// ListBuildings returns every building.
func (s *Server) ListBuildings(ctx context.Context, _ ListBuildingsRequestObject) (ListBuildingsResponseObject, error) {
	buildings, err := s.opts.Board.Repo().ListBuildings(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Building, 0, len(buildings))
	for _, b := range buildings {
		out = append(out, buildingDTO(b))
	}
	return ListBuildings200JSONResponse(out), nil
}

// GetBuildingMap serves the floor geometry. The payload only changes when the
// map data or the room table does, so it is rendered once and cached with a
// strong ETag.
func (s *Server) GetBuildingMap(ctx context.Context, request GetBuildingMapRequestObject) (GetBuildingMapResponseObject, error) {
	building, err := s.opts.Board.Repo().GetBuilding(ctx, request.Code)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return GetBuildingMap404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, "no such building"))}, nil
		}
		return nil, err
	}

	s.mapMu.Lock()
	entry, ok := s.mapCache[building.Code]
	s.mapMu.Unlock()

	if !ok {
		rooms, err := s.opts.Board.Repo().ListRooms(ctx, building.ID)
		if err != nil {
			return nil, err
		}
		body, err := json.Marshal(mapSpecDTO(s.opts.Spec, rooms))
		if err != nil {
			return nil, err
		}
		entry = rendered{body: body, etag: strongETag(body)}
		s.mapMu.Lock()
		s.mapCache[building.Code] = entry
		s.mapMu.Unlock()
	}

	if etagMatches(ifNoneMatch(ctx), entry.etag) {
		return notModified{etag: entry.etag}, nil
	}
	return rawJSON{body: entry.body, etag: entry.etag, cache: "public, max-age=60"}, nil
}

// GetBoard serves the snapshot: the live one, or the board as it was (or will
// be) at `at` for the time-travel scrubber.
func (s *Server) GetBoard(ctx context.Context, request GetBoardRequestObject) (GetBoardResponseObject, error) {
	var (
		date *domain.Date
		err  error
	)
	if request.Params.Date != nil {
		d, perr := service.ParseDate(*request.Params.Date)
		if perr != nil {
			return GetBoard400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, perr.Error()))}, nil
		}
		date = &d
	}

	var snap domain.Snapshot
	switch {
	case request.Params.At != nil:
		snap, _, err = s.opts.Board.At(ctx, request.Code, *request.Params.At, date)
	case date != nil:
		// A date without an instant means "that day at the server's own clock
		// time", which is what the room panel and the scrubber ask for.
		day, derr := s.opts.Board.LoadDay(ctx, request.Code, *date)
		if derr != nil {
			err = derr
			break
		}
		at := noonIfOtherDay(s.opts.Board.Clock(), day)
		snap, _, err = s.opts.Board.At(ctx, request.Code, at, date)
	default:
		snap, _, err = s.opts.Board.Live(ctx, request.Code)
	}
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return GetBoard404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, err.Error()))}, nil
		}
		return nil, err
	}

	body, err := json.Marshal(snapshotDTO(snap, s.opts.Board.Thresholds()))
	if err != nil {
		return nil, err
	}
	etag := strongETag(body)
	if etagMatches(ifNoneMatch(ctx), etag) {
		return notModified{etag: etag}, nil
	}
	return rawJSON{body: body, etag: etag, cache: "no-cache"}, nil
}

// noonIfOtherDay picks the instant a bare `?date=` should be evaluated at: the
// server's own "now" when the date is today, and the same wall-clock time on
// the requested day otherwise, so the board is never mysteriously empty.
func noonIfOtherDay(clk clock.Clock, day *service.Day) time.Time {
	now := clk.Now()
	if domain.DateIn(now, day.Building.Location).Equal(day.Date) {
		return now
	}
	local := now.In(day.Building.Location)
	return day.Date.At(day.Building.Location, local.Hour(), local.Minute())
}

// GetTimeline serves every session of one local date.
func (s *Server) GetTimeline(ctx context.Context, request GetTimelineRequestObject) (GetTimelineResponseObject, error) {
	day, resp, err := dayFor(ctx, s, request.Code, request.Params.Date, func(msg string) GetTimelineResponseObject {
		return GetTimeline400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, msg))}
	}, func(msg string) GetTimelineResponseObject {
		return GetTimeline404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, msg))}
	})
	if resp != nil || err != nil {
		return resp, err
	}
	return GetTimeline200JSONResponse{
		Building: day.Building.Code,
		Date:     day.Date.String(),
		Sessions: sessionViews(day.Sessions, s.opts.Board.Now(), s.opts.Board.Thresholds()),
	}, nil
}

// dayFor resolves the `?date=` parameter and materialises the day. It is a
// free function because Go methods may not carry type parameters, and every
// day-shaped endpoint has its own generated 400/404 response type.
func dayFor[T any](ctx context.Context, s *Server, code string, raw *string, bad, notFound func(string) T) (*service.Day, T, error) {
	var zero T
	building, err := s.opts.Board.Repo().GetBuilding(ctx, code)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return nil, notFound("no such building"), nil
		}
		return nil, zero, err
	}

	date := s.opts.Board.LocalDate(building)
	if raw != nil {
		d, perr := service.ParseDate(*raw)
		if perr != nil {
			return nil, bad(perr.Error()), nil
		}
		date = d
	}

	day, err := s.opts.Board.LoadDay(ctx, building.Code, date)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return nil, notFound(err.Error()), nil
		}
		return nil, zero, err
	}
	return day, zero, nil
}

// --------------------------------------------------------------- day views --

// GetRoomDay lists the sessions that take place in one room on a date. A
// session moved *into* the room appears; one moved out does not.
func (s *Server) GetRoomDay(ctx context.Context, request GetRoomDayRequestObject) (GetRoomDayResponseObject, error) {
	room, err := s.opts.Board.Repo().GetRoom(ctx, request.Code)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return GetRoomDay404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, "no such room"))}, nil
		}
		return nil, err
	}

	day, resp, err := dayFor(ctx, s, s.opts.DefaultBuilding, request.Params.Date, func(msg string) GetRoomDayResponseObject {
		return GetRoomDay400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, msg))}
	}, func(msg string) GetRoomDayResponseObject {
		return GetRoomDay404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, msg))}
	})
	if resp != nil || err != nil {
		return resp, err
	}

	sessions := service.SessionsFor(day, func(x domain.Session) bool { return x.Room.ID == room.ID })
	return GetRoomDay200JSONResponse{
		Date:     day.Date.String(),
		Sessions: sessionViews(sessions, s.opts.Board.Now(), s.opts.Board.Thresholds()),
	}, nil
}

// GetTeacherDay lists one teacher's sessions on a date.
func (s *Server) GetTeacherDay(ctx context.Context, request GetTeacherDayRequestObject) (GetTeacherDayResponseObject, error) {
	teacher, err := s.opts.Board.Repo().GetTeacher(ctx, request.Id)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return GetTeacherDay404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, "no such teacher"))}, nil
		}
		return nil, err
	}

	day, resp, err := dayFor(ctx, s, s.opts.DefaultBuilding, request.Params.Date, func(msg string) GetTeacherDayResponseObject {
		return GetTeacherDay400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, msg))}
	}, func(msg string) GetTeacherDayResponseObject {
		return GetTeacherDay404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, msg))}
	})
	if resp != nil || err != nil {
		return resp, err
	}

	sessions := service.SessionsFor(day, func(x domain.Session) bool { return x.Teacher.ID == teacher.ID })
	return GetTeacherDay200JSONResponse{
		Date:     day.Date.String(),
		Sessions: sessionViews(sessions, s.opts.Board.Now(), s.opts.Board.Thresholds()),
	}, nil
}

// GetGroupDay lists one student group's sessions on a date.
func (s *Server) GetGroupDay(ctx context.Context, request GetGroupDayRequestObject) (GetGroupDayResponseObject, error) {
	group, err := s.opts.Board.Repo().GetGroup(ctx, request.Code)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return GetGroupDay404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, "no such group"))}, nil
		}
		return nil, err
	}

	day, resp, err := dayFor(ctx, s, s.opts.DefaultBuilding, request.Params.Date, func(msg string) GetGroupDayResponseObject {
		return GetGroupDay400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, msg))}
	}, func(msg string) GetGroupDayResponseObject {
		return GetGroupDay404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, msg))}
	})
	if resp != nil || err != nil {
		return resp, err
	}

	sessions := service.SessionsFor(day, func(x domain.Session) bool {
		for _, code := range x.Groups {
			if code == group.Code {
				return true
			}
		}
		return false
	})
	return GetGroupDay200JSONResponse{
		Date:     day.Date.String(),
		Sessions: sessionViews(sessions, s.opts.Board.Now(), s.opts.Board.Thresholds()),
	}, nil
}

// ------------------------------------------------------------------ search --

// Search runs the unified case-insensitive search.
func (s *Server) Search(ctx context.Context, request SearchRequestObject) (SearchResponseObject, error) {
	q := strings.TrimSpace(request.Params.Q)
	if q == "" {
		return Search400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, "q must not be empty"))}, nil
	}
	limit := 5
	if request.Params.Limit != nil {
		limit = int(*request.Params.Limit)
	}
	if limit < 1 || limit > 25 {
		return Search400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, "limit must be between 1 and 25"))}, nil
	}

	res, err := s.opts.Board.Repo().Search(ctx, q, limit)
	if err != nil {
		return nil, err
	}
	return Search200JSONResponse(searchResultDTO(res)), nil
}

// ------------------------------------------------------------------- clock --

// GetTime reports the server instant and clock mode so clients can compute
// their own drift.
func (s *Server) GetTime(ctx context.Context, _ GetTimeRequestObject) (GetTimeResponseObject, error) {
	clk := s.opts.Board.Clock()
	info := TimeInfo{
		Now:      clk.Now().UTC(),
		Mode:     ClockMode(clk.Mode()),
		Timezone: s.opts.Spec.Timezone,
	}
	if building, err := s.opts.Board.Repo().GetBuilding(ctx, s.opts.DefaultBuilding); err == nil {
		info.Timezone = building.Timezone
	}
	if clk.Mode() == clock.ModeOffset {
		off := clk.Offset().String()
		info.Offset = &off
	}
	return GetTime200JSONResponse(info), nil
}

// ---------------------------------------------------------------- realtime --

// StreamEvents opens the SSE stream for one building.
func (s *Server) StreamEvents(ctx context.Context, request StreamEventsRequestObject) (StreamEventsResponseObject, error) {
	code := request.Params.Building
	if _, err := s.opts.Board.Repo().GetBuilding(ctx, code); err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return StreamEvents404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, "no such building"))}, nil
		}
		return nil, err
	}

	// Make sure the broker has a snapshot to replay, so the very first frame a
	// client sees is a full state even if the scheduler has not ticked yet.
	if !s.opts.Broker.HasLatest(code) {
		if snap, _, err := s.opts.Board.Live(ctx, code); err == nil {
			s.PublishSnapshot(code, snap)
		}
	}

	sub, err := s.opts.Broker.Subscribe(code, ipFrom(ctx))
	if err != nil {
		if errors.Is(err, realtime.ErrTooManyConnections) {
			return StreamEvents400JSONResponse{BadRequestJSONResponse(
				errorBody(CodeBadRequest, "too many event streams from this address"))}, nil
		}
		return nil, err
	}
	return sseResponse{ctx: ctx, broker: s.opts.Broker, sub: sub}, nil
}

// PublishSnapshot serialises a snapshot and broadcasts it. The scheduler and
// the admin endpoints both go through here, so the SSE payload and the
// `/board` body are produced by exactly the same code.
func (s *Server) PublishSnapshot(building string, snap domain.Snapshot) {
	body, err := json.Marshal(snapshotDTO(snap, s.opts.Board.Thresholds()))
	if err != nil {
		s.log.Error("marshal snapshot", slog.String("building", building), slog.Any("err", err))
		return
	}
	s.opts.Broker.Publish(building, realtime.EventSnapshot, body)
}

// ------------------------------------------------------------------- admin --

// CreateOverride applies a point change and rebuilds the board immediately.
func (s *Server) CreateOverride(ctx context.Context, request CreateOverrideRequestObject) (CreateOverrideResponseObject, error) {
	bad := func(msg string) CreateOverrideResponseObject {
		return CreateOverride400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, msg))}
	}
	missing := func(msg string) CreateOverrideResponseObject {
		return CreateOverride404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, msg))}
	}
	if request.Body == nil {
		return bad("a body is required"), nil
	}
	body := *request.Body

	date, err := service.ParseDate(body.Date)
	if err != nil {
		return bad(err.Error()), nil
	}

	params := repo.InsertOverrideParams{Date: date, Kind: domain.OverrideKind(body.Kind), Note: deref(body.Note)}

	if body.Kind != Extra {
		lessonID, resp := s.resolveOverrideLesson(body, date, bad)
		if resp != nil {
			return resp, nil
		}
		exists, err := s.opts.Board.Repo().LessonExists(ctx, *lessonID)
		if err != nil {
			return nil, err
		}
		if !exists {
			return missing("no such lesson"), nil
		}
		params.LessonID = lessonID
	}

	switch body.Kind {
	case Cancel:
		// Nothing else to resolve.

	case Move:
		if body.NewRoomCode == nil || *body.NewRoomCode == "" {
			return bad("move requires newRoomCode"), nil
		}
		room, err := s.opts.Board.Repo().GetRoom(ctx, *body.NewRoomCode)
		if err != nil {
			if errors.Is(err, repo.ErrNotFound) {
				return missing("no such room " + *body.NewRoomCode), nil
			}
			return nil, err
		}
		id := room.ID
		params.NewRoomID = &id

	case Delay:
		if body.DelayMinutes == nil || *body.DelayMinutes <= 0 {
			return bad("delay requires a positive delayMinutes"), nil
		}
		m := int(*body.DelayMinutes)
		params.DelayMinutes = &m

	case ReassignTeacher:
		if body.NewTeacherId == nil {
			return bad("reassign_teacher requires newTeacherId"), nil
		}
		teacher, err := s.opts.Board.Repo().GetTeacher(ctx, *body.NewTeacherId)
		if err != nil {
			if errors.Is(err, repo.ErrNotFound) {
				return missing("no such teacher"), nil
			}
			return nil, err
		}
		id := teacher.ID
		params.NewTeacherID = &id

	case Extra:
		resp, err := s.resolveExtra(ctx, body, &params, bad, missing)
		if resp != nil || err != nil {
			return resp, err
		}

	default:
		return bad("unknown override kind"), nil
	}

	id, err := s.opts.Board.Repo().InsertOverride(ctx, params)
	if err != nil {
		return nil, err
	}
	record, err := s.opts.Board.Repo().GetOverride(ctx, id)
	if err != nil {
		return nil, err
	}

	s.refresh(s.opts.DefaultBuilding)
	s.log.Info("override created",
		slog.String("id", id.String()), slog.String("kind", string(body.Kind)), slog.String("date", date.String()))

	return CreateOverride201JSONResponse(overrideDTO(record)), nil
}

// resolveOverrideLesson accepts either `lessonId` or a `sessionId` of the
// documented `{lessonId}:{date}` shape. (The recurring-schedule admin handlers
// have their own resolveLesson in admin.go, which validates a whole placement.)
func (s *Server) resolveOverrideLesson(body OverrideRequest, date domain.Date, bad func(string) CreateOverrideResponseObject) (*uuid.UUID, CreateOverrideResponseObject) {
	if body.LessonId != nil {
		id := *body.LessonId
		return &id, nil
	}
	if body.SessionId == nil || *body.SessionId == "" {
		return nil, bad("one of lessonId or sessionId is required")
	}
	raw, suffix, ok := strings.Cut(*body.SessionId, ":")
	if !ok {
		return nil, bad(`sessionId must look like "{lessonId}:{date}"`)
	}
	if suffix != date.String() {
		return nil, bad("sessionId date " + suffix + " does not match date " + date.String())
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return nil, bad("sessionId does not start with a lesson id")
	}
	return &id, nil
}

// resolveExtra fills in the one-off session fields.
func (s *Server) resolveExtra(ctx context.Context, body OverrideRequest, params *repo.InsertOverrideParams,
	bad, missing func(string) CreateOverrideResponseObject,
) (CreateOverrideResponseObject, error) {
	if body.CourseCode == nil || body.RoomCode == nil || body.TeacherId == nil || body.SlotIdx == nil {
		return bad("extra requires courseCode, roomCode, teacherId and slotIdx"), nil
	}

	course, err := s.opts.Board.Repo().GetCourse(ctx, *body.CourseCode)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return missing("no such course " + *body.CourseCode), nil
		}
		return nil, err
	}
	room, err := s.opts.Board.Repo().GetRoom(ctx, *body.RoomCode)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return missing("no such room " + *body.RoomCode), nil
		}
		return nil, err
	}
	teacher, err := s.opts.Board.Repo().GetTeacher(ctx, *body.TeacherId)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return missing("no such teacher"), nil
		}
		return nil, err
	}
	building, err := s.opts.Board.Repo().GetBuilding(ctx, s.opts.DefaultBuilding)
	if err != nil {
		return nil, err
	}
	slot, err := s.opts.Board.Repo().GetTimeSlot(ctx, building.ID, int(*body.SlotIdx))
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return missing(fmt.Sprintf("no such slot %d", *body.SlotIdx)), nil
		}
		return nil, err
	}

	courseID, roomID, teacherID, slotID := course.ID, room.ID, teacher.ID, slot.ID
	params.CourseID = &courseID
	params.NewRoomID = &roomID
	params.NewTeacherID = &teacherID
	params.SlotID = &slotID
	if body.GroupCodes != nil {
		params.GroupCodes = *body.GroupCodes
	}
	return nil, nil
}

// DeleteOverride rolls an override back and rebuilds the board.
func (s *Server) DeleteOverride(ctx context.Context, request DeleteOverrideRequestObject) (DeleteOverrideResponseObject, error) {
	if err := s.opts.Board.Repo().DeleteOverride(ctx, request.Id); err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return DeleteOverride404JSONResponse{NotFoundJSONResponse(errorBody(CodeNotFound, "no such override"))}, nil
		}
		return nil, err
	}
	s.refresh(s.opts.DefaultBuilding)
	s.log.Info("override deleted", slog.String("id", request.Id.String()))
	return DeleteOverride204Response{}, nil
}

// CreateAnnouncement stores a ticker line and pushes it to every client.
func (s *Server) CreateAnnouncement(ctx context.Context, request CreateAnnouncementRequestObject) (CreateAnnouncementResponseObject, error) {
	bad := func(msg string) CreateAnnouncementResponseObject {
		return CreateAnnouncement400JSONResponse{BadRequestJSONResponse(errorBody(CodeBadRequest, msg))}
	}
	if request.Body == nil {
		return bad("a body is required"), nil
	}
	body := *request.Body
	if strings.TrimSpace(body.Text) == "" {
		return bad("text must not be empty"), nil
	}

	building := s.opts.DefaultBuilding
	if body.Building != nil && *body.Building != "" {
		building = *body.Building
	}
	severity := domain.SeverityInfo
	if body.Severity != nil {
		severity = domain.Severity(*body.Severity)
	}

	startsAt := s.opts.Board.Now()
	if body.StartsAt != nil {
		startsAt = *body.StartsAt
	}
	ttl := 30 * time.Minute
	if body.TtlMinutes != nil {
		if *body.TtlMinutes <= 0 {
			return bad("ttlMinutes must be positive"), nil
		}
		ttl = time.Duration(*body.TtlMinutes) * time.Minute
	}
	endsAt := startsAt.Add(ttl)
	if body.EndsAt != nil {
		endsAt = *body.EndsAt
	}
	if !endsAt.After(startsAt) {
		return bad("endsAt must be after startsAt"), nil
	}

	stored, err := s.opts.Board.Repo().InsertAnnouncement(ctx, domain.Announcement{
		Building: building,
		Text:     body.Text,
		Severity: severity,
		StartsAt: startsAt,
		EndsAt:   endsAt,
	})
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return bad("no such building " + building), nil
		}
		return nil, err
	}

	dto := announcementDTO(stored)
	if payload, err := json.Marshal(dto); err == nil {
		s.opts.Broker.Publish(building, realtime.EventAnnouncement, payload)
	}
	s.log.Info("announcement posted", slog.String("id", stored.ID.String()), slog.String("building", building))

	return CreateAnnouncement201JSONResponse(dto), nil
}

// refresh drops the cached day and pokes the scheduler, which rebuilds and
// broadcasts, so an admin change reaches every open screen in well under a
// second (ARCHITECTURE §12.2).
func (s *Server) refresh(building string) {
	s.opts.Board.Invalidate(building)
	s.opts.Invalidate(building)
}

// rebuildAndPublish is the fallback used when no scheduler is wired in.
func (s *Server) rebuildAndPublish(building string) {
	ctx, cancel := context.WithTimeout(context.Background(), requestTimeout)
	defer cancel()
	snap, _, err := s.opts.Board.Rebuild(ctx, building)
	if err != nil {
		s.log.Error("rebuild after admin change", slog.String("building", building), slog.Any("err", err))
		return
	}
	s.PublishSnapshot(building, snap)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// Compile-time proof that every operation of the contract is implemented.
var _ StrictServerInterface = (*Server)(nil)
