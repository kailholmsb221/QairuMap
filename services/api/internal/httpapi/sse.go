package httpapi

import (
	"context"
	"fmt"
	"net/http"

	"github.com/kailholmes/campuslive/services/api/internal/realtime"
)

// sseResponse streams one building's events until the client goes away
// (ARCHITECTURE §8.4). It is a hand-written response object rather than the
// generated `text/event-stream` one, because that one copies a fixed io.Reader
// and would never flush.
type sseResponse struct {
	ctx    context.Context //nolint:containedctx // the strict server hands the request context to the handler, not to Visit
	broker *realtime.Broker
	sub    *realtime.Subscriber
}

func (s sseResponse) VisitStreamEventsResponse(w http.ResponseWriter) error {
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	// Tell nginx-style proxies not to buffer; Caddy is configured with
	// flush_interval -1 for the same reason.
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	flusher, _ := w.(http.Flusher)
	flush := func() {
		if flusher != nil {
			flusher.Flush()
		}
	}

	defer s.broker.Unsubscribe(s.sub)

	// An opening comment makes EventSource fire `open` immediately.
	if _, err := fmt.Fprint(w, ": campuslive stream open\n\n"); err != nil {
		return nil //nolint:nilerr // the client hung up before the first byte
	}
	flush()

	for {
		select {
		case <-s.ctx.Done():
			return nil
		case ev, ok := <-s.sub.Events():
			if !ok {
				// Dropped as a slow client, or the broker is shutting down.
				return nil
			}
			if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Name, ev.Data); err != nil {
				return nil //nolint:nilerr // a disconnected client is not a server error
			}
			flush()
		}
	}
}
