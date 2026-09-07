// Package realtime is the SSE broker: one hub per building, a bounded buffer
// per client and a full snapshot on every change (ARCHITECTURE §8.4).
//
// Snapshots are complete states, never deltas, so dropping a slow client costs
// nothing: it reconnects and immediately receives the current snapshot again.
package realtime

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/kailholmes/campuslive/services/api/internal/clock"
)

// Event names carried on the stream (contract: `streamEvents`).
const (
	EventSnapshot     = "snapshot"
	EventAnnouncement = "announcement"
	EventHeartbeat    = "heartbeat"
)

// Defaults from ARCHITECTURE §8.4 and §16.
const (
	DefaultBufferSize        = 16
	DefaultHeartbeatInterval = 25 * time.Second
	DefaultMaxPerIP          = 20
)

// ErrTooManyConnections is returned when one IP holds too many streams open.
var ErrTooManyConnections = errors.New("realtime: too many connections from this address")

// Event is one server-sent event.
type Event struct {
	Name string
	Data []byte
}

// Options configure a Broker. Zero values fall back to the defaults above.
type Options struct {
	BufferSize        int
	HeartbeatInterval time.Duration
	MaxPerIP          int
	Clock             clock.Clock
}

// Broker fans events out to the subscribers of each building.
type Broker struct {
	opts Options

	mu        sync.Mutex
	hubs      map[string]map[*Subscriber]struct{}
	latest    map[string]Event // the last snapshot per building, replayed on subscribe
	perIP     map[string]int
	closed    bool
	dropped   int
	delivered int
}

// Subscriber is one open stream.
type Subscriber struct {
	ch       chan Event
	broker   *Broker
	building string
	ip       string

	once sync.Once
}

// Events is the channel the HTTP handler ranges over. It is closed when the
// subscriber is dropped or unsubscribed.
func (s *Subscriber) Events() <-chan Event { return s.ch }

// New builds a broker.
func New(opts Options) *Broker {
	if opts.BufferSize <= 0 {
		opts.BufferSize = DefaultBufferSize
	}
	if opts.HeartbeatInterval <= 0 {
		opts.HeartbeatInterval = DefaultHeartbeatInterval
	}
	if opts.MaxPerIP <= 0 {
		opts.MaxPerIP = DefaultMaxPerIP
	}
	if opts.Clock == nil {
		opts.Clock = clock.Real{}
	}
	return &Broker{
		opts:   opts,
		hubs:   map[string]map[*Subscriber]struct{}{},
		latest: map[string]Event{},
		perIP:  map[string]int{},
	}
}

// Subscribe opens a stream for one building. The caller's IP is used only for
// the per-address connection cap (ARCHITECTURE §16). The current snapshot, when
// the broker has one, is queued immediately so the first frame a client sees is
// always a full state.
func (b *Broker) Subscribe(building, ip string) (*Subscriber, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.closed {
		return nil, errors.New("realtime: broker is shut down")
	}
	if b.perIP[ip] >= b.opts.MaxPerIP {
		return nil, ErrTooManyConnections
	}

	sub := &Subscriber{
		ch:       make(chan Event, b.opts.BufferSize),
		broker:   b,
		building: building,
		ip:       ip,
	}
	if b.hubs[building] == nil {
		b.hubs[building] = map[*Subscriber]struct{}{}
	}
	b.hubs[building][sub] = struct{}{}
	b.perIP[ip]++

	if ev, ok := b.latest[building]; ok {
		sub.ch <- ev // the buffer is empty, this cannot block
	}
	return sub, nil
}

// Unsubscribe closes a stream. It is safe to call more than once.
func (b *Broker) Unsubscribe(sub *Subscriber) {
	if sub == nil {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.removeLocked(sub)
}

func (b *Broker) removeLocked(sub *Subscriber) {
	hub, ok := b.hubs[sub.building]
	if !ok {
		return
	}
	if _, ok := hub[sub]; !ok {
		return
	}
	delete(hub, sub)
	if len(hub) == 0 {
		delete(b.hubs, sub.building)
	}
	if n := b.perIP[sub.ip]; n <= 1 {
		delete(b.perIP, sub.ip)
	} else {
		b.perIP[sub.ip] = n - 1
	}
	sub.once.Do(func() { close(sub.ch) })
}

// Publish sends an event to every subscriber of a building.
//
// A client whose buffer is full is dropped rather than blocking the publisher:
// it will reconnect and get a fresh full snapshot, so nothing is lost.
func (b *Broker) Publish(building, name string, data []byte) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if name == EventSnapshot {
		b.latest[building] = Event{Name: name, Data: data}
	}

	hub := b.hubs[building]
	var slow []*Subscriber
	for sub := range hub {
		select {
		case sub.ch <- Event{Name: name, Data: data}:
			b.delivered++
		default:
			slow = append(slow, sub)
		}
	}
	for _, sub := range slow {
		b.dropped++
		b.removeLocked(sub)
	}
}

// Run emits a heartbeat to every hub until ctx is cancelled, so that proxies
// keep the connections open (ARCHITECTURE §8.4).
func (b *Broker) Run(ctx context.Context) {
	ticker := time.NewTicker(b.opts.HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			b.heartbeat()
		}
	}
}

func (b *Broker) heartbeat() {
	payload := []byte(`{"at":"` + b.opts.Clock.Now().UTC().Format(time.RFC3339) + `"}`)
	for _, building := range b.Buildings() {
		b.Publish(building, EventHeartbeat, payload)
	}
}

// Buildings lists the buildings that currently have subscribers.
func (b *Broker) Buildings() []string {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]string, 0, len(b.hubs))
	for building := range b.hubs {
		out = append(out, building)
	}
	return out
}

// Count reports how many streams are open for a building.
func (b *Broker) Count(building string) int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.hubs[building])
}

// Stats reports the delivered and dropped event counters, for logging.
func (b *Broker) Stats() (delivered, dropped int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.delivered, b.dropped
}

// Close drops every subscriber; used by graceful shutdown.
func (b *Broker) Close() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.closed = true
	for _, hub := range b.hubs {
		for sub := range hub {
			sub.once.Do(func() { close(sub.ch) })
		}
	}
	b.hubs = map[string]map[*Subscriber]struct{}{}
	b.perIP = map[string]int{}
}

// HasLatest reports whether a snapshot has already been published for a
// building and would therefore be replayed to a new subscriber.
func (b *Broker) HasLatest(building string) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	_, ok := b.latest[building]
	return ok
}
