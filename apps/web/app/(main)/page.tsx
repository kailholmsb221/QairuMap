import type { MapSpec, Snapshot, TimeInfo } from '@campuslive/contracts';
import { spec as staticSpec } from '@campuslive/map-data';
import { CampusLiveApp } from '@/components/CampusLiveApp';
import { apiBase } from '@/lib/api/client';
import { emptySnapshot } from '@/lib/snapshot';

export const dynamic = 'force-dynamic';

const BUILDING = 'A';

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Server Component: the first frame is already live. If the API is unreachable the
 * app still renders — the map draws from the committed `building-a.json` and the
 * board shows the offline card.
 */
export default async function MainPage() {
  const [map, board, time] = await Promise.all([
    getJson<MapSpec>(`/api/v1/buildings/${BUILDING}/map`),
    getJson<Snapshot>(`/api/v1/buildings/${BUILDING}/board`),
    getJson<TimeInfo>('/api/v1/time'),
  ]);

  const snapshot = board ?? emptySnapshot(BUILDING);
  const initialTime = time?.now ?? snapshot.at;

  return (
    <CampusLiveApp
      initialSnapshot={snapshot}
      mapSpec={map ?? staticSpec}
      initialTime={initialTime}
      apiDown={board === null}
    />
  );
}
