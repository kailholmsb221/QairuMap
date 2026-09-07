package realtime_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kailholmes/campuslive/services/api/internal/clock"
	"github.com/kailholmes/campuslive/services/api/internal/realtime"
)

func recv(t *testing.T, sub *realtime.Subscriber) realtime.Event {
	t.Helper()
	select {
	case ev, ok := <-sub.Events():
		require.True(t, ok, "the stream was closed")
		return ev
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for an event")
		return realtime.Event{}
	}
}

func TestPublishReachesEverySubscriberOfTheBuilding(t *testing.T) {
	t.Parallel()
	b := realtime.New(realtime.Options{})
	defer b.Close()

	a1, err := b.Subscribe("A", "10.0.0.1")
	require.NoError(t, err)
	a2, err := b.Subscribe("A", "10.0.0.2")
	require.NoError(t, err)
	other, err := b.Subscribe("B", "10.0.0.3")
	require.NoError(t, err)

	require.Equal(t, 2, b.Count("A"))
	require.Equal(t, 1, b.Count("B"))

	b.Publish("A", realtime.EventSnapshot, []byte(`{"building":"A"}`))

	for _, sub := range []*realtime.Subscriber{a1, a2} {
		ev := recv(t, sub)
		require.Equal(t, realtime.EventSnapshot, ev.Name)
		require.JSONEq(t, `{"building":"A"}`, string(ev.Data))
	}
	select {
	case ev := <-other.Events():
		t.Fatalf("building B must not see building A's events, got %v", ev)
	default:
	}
}

// A new subscriber gets the current snapshot immediately, so its first frame is
// always a full state (ARCHITECTURE §8.4).
func TestSnapshotIsReplayedOnSubscribe(t *testing.T) {
	t.Parallel()
	b := realtime.New(realtime.Options{})
	defer b.Close()

	b.Publish("A", realtime.EventSnapshot, []byte(`{"n":1}`))

	sub, err := b.Subscribe("A", "10.0.0.1")
	require.NoError(t, err)

	ev := recv(t, sub)
	require.Equal(t, realtime.EventSnapshot, ev.Name)
	require.JSONEq(t, `{"n":1}`, string(ev.Data))
}

func TestOnlySnapshotsAreReplayed(t *testing.T) {
	t.Parallel()
	b := realtime.New(realtime.Options{})
	defer b.Close()

	b.Publish("A", realtime.EventAnnouncement, []byte(`{"text":"stale"}`))

	sub, err := b.Subscribe("A", "10.0.0.1")
	require.NoError(t, err)
	select {
	case ev := <-sub.Events():
		t.Fatalf("a late joiner must not receive an old announcement, got %v", ev)
	case <-time.After(50 * time.Millisecond):
	}
}

// A client that stops reading fills its 16-message buffer and is dropped rather
// than blocking the publisher.
func TestSlowClientIsDropped(t *testing.T) {
	t.Parallel()
	b := realtime.New(realtime.Options{BufferSize: 4})
	defer b.Close()

	slow, err := b.Subscribe("A", "10.0.0.1")
	require.NoError(t, err)
	fast, err := b.Subscribe("A", "10.0.0.2")
	require.NoError(t, err)

	// The fast client reads every event as it arrives; the slow one never
	// reads at all. Publishing is synchronous, so this is deterministic.
	read := 0
	for i := 0; i < 8; i++ {
		b.Publish("A", realtime.EventSnapshot, []byte(`{}`))
		recv(t, fast)
		read++
	}

	require.Equal(t, 1, b.Count("A"), "the slow client is gone, the fast one stays")
	require.Equal(t, 8, read, "Publish never blocked on the slow client")
	_, dropped := b.Stats()
	require.Equal(t, 1, dropped)

	// The dropped client's channel is closed, which is how the HTTP handler
	// learns to end the response.
	drained := 0
	for range slow.Events() {
		drained++
	}
	require.Equal(t, 4, drained, "it keeps the four events that fit in its buffer")
}

func TestHeartbeat(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 9, 8, 5, 47, 0, 0, time.UTC)
	b := realtime.New(realtime.Options{
		HeartbeatInterval: 10 * time.Millisecond,
		Clock:             clock.NewFixed(at),
	})
	defer b.Close()

	sub, err := b.Subscribe("A", "10.0.0.1")
	require.NoError(t, err)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go b.Run(ctx)

	ev := recv(t, sub)
	require.Equal(t, realtime.EventHeartbeat, ev.Name)
	require.JSONEq(t, `{"at":"2026-09-08T05:47:00Z"}`, string(ev.Data))
}

func TestHeartbeatStopsWithContext(t *testing.T) {
	t.Parallel()
	b := realtime.New(realtime.Options{HeartbeatInterval: 5 * time.Millisecond})
	defer b.Close()

	ctx, cancel := context.WithCancel(context.Background())
	stopped := make(chan struct{})
	go func() { b.Run(ctx); close(stopped) }()

	cancel()
	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Fatal("Run did not return when its context was cancelled")
	}
}

func TestPerIPConnectionCap(t *testing.T) {
	t.Parallel()
	b := realtime.New(realtime.Options{MaxPerIP: 2})
	defer b.Close()

	first, err := b.Subscribe("A", "10.0.0.1")
	require.NoError(t, err)
	_, err = b.Subscribe("A", "10.0.0.1")
	require.NoError(t, err)

	_, err = b.Subscribe("A", "10.0.0.1")
	require.ErrorIs(t, err, realtime.ErrTooManyConnections)

	// Another address is unaffected, and freeing a slot lets the first one back.
	_, err = b.Subscribe("A", "10.0.0.2")
	require.NoError(t, err)

	b.Unsubscribe(first)
	_, err = b.Subscribe("A", "10.0.0.1")
	require.NoError(t, err)
}

func TestUnsubscribeIsIdempotent(t *testing.T) {
	t.Parallel()
	b := realtime.New(realtime.Options{})
	defer b.Close()

	sub, err := b.Subscribe("A", "10.0.0.1")
	require.NoError(t, err)

	b.Unsubscribe(sub)
	b.Unsubscribe(sub)
	b.Unsubscribe(nil)
	require.Equal(t, 0, b.Count("A"))

	_, ok := <-sub.Events()
	require.False(t, ok, "the channel is closed exactly once")
}

func TestCloseDropsEveryone(t *testing.T) {
	t.Parallel()
	b := realtime.New(realtime.Options{})

	a, err := b.Subscribe("A", "10.0.0.1")
	require.NoError(t, err)
	bb, err := b.Subscribe("B", "10.0.0.2")
	require.NoError(t, err)

	b.Close()

	_, ok := <-a.Events()
	require.False(t, ok)
	_, ok = <-bb.Events()
	require.False(t, ok)
	require.Empty(t, b.Buildings())

	_, err = b.Subscribe("A", "10.0.0.1")
	require.Error(t, err, "a shut-down broker takes no new subscribers")
}

func TestDefaultsAreApplied(t *testing.T) {
	t.Parallel()
	b := realtime.New(realtime.Options{})
	defer b.Close()

	sub, err := b.Subscribe("A", "10.0.0.1")
	require.NoError(t, err)

	// The default buffer holds 16 messages before a client is considered slow.
	for i := 0; i < realtime.DefaultBufferSize; i++ {
		b.Publish("A", realtime.EventAnnouncement, []byte(`{}`))
	}
	require.Equal(t, 1, b.Count("A"))
	b.Publish("A", realtime.EventAnnouncement, []byte(`{}`))
	require.Equal(t, 0, b.Count("A"))
	_ = sub
}
