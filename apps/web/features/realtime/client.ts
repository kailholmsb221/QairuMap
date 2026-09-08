import type { Announcement, Heartbeat, Snapshot } from '@campuslive/contracts';
import { eventsUrl } from '@/lib/api/client';

export type RealtimeHandlers = {
  onSnapshot: (s: Snapshot) => void;
  onAnnouncement: (a: Announcement) => void;
  onHeartbeat: (h: Heartbeat) => void;
  /** Fired on the first successful connect and on every reconnect. */
  onOpen: (reconnected: boolean) => void;
  /** `closed` is true when the browser gave up on the stream (readyState CLOSED). */
  onError: (closed: boolean) => void;
};

export interface RealtimeClient {
  start(): void;
  stop(): void;
}

/** `GET /api/v1/events?building=A` over `EventSource`. */
export class SseClient implements RealtimeClient {
  private source: EventSource | null = null;
  private opened = false;

  constructor(
    private readonly building: string,
    private readonly handlers: RealtimeHandlers,
  ) {}

  start(): void {
    if (this.source || typeof EventSource === 'undefined') return;
    const es = new EventSource(eventsUrl(this.building));
    this.source = es;

    es.onopen = () => {
      const reconnected = this.opened;
      this.opened = true;
      this.handlers.onOpen(reconnected);
    };

    es.onerror = () => {
      this.handlers.onError(es.readyState === EventSource.CLOSED);
    };

    es.addEventListener('snapshot', (e) => {
      const data = parse<Snapshot>(e);
      if (data) this.handlers.onSnapshot(data);
    });

    es.addEventListener('announcement', (e) => {
      const data = parse<Announcement>(e);
      if (data) this.handlers.onAnnouncement(data);
    });

    es.addEventListener('heartbeat', (e) => {
      const data = parse<Heartbeat>(e);
      this.handlers.onHeartbeat(data ?? { at: new Date().toISOString() });
    });
  }

  stop(): void {
    this.source?.close();
    this.source = null;
    this.opened = false;
  }
}

function parse<T>(e: Event): T | null {
  const data = (e as MessageEvent<string>).data;
  if (typeof data !== 'string' || data.length === 0) return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}
