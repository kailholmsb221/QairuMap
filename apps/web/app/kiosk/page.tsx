import type { MapSpec, Snapshot, TimeInfo } from '@campuslive/contracts';
import { spec as staticSpec } from '@campuslive/map-data';
import { KioskApp } from '@/components/kiosk/KioskApp';
import { parseDuration } from '@/lib/duration';
import { apiBase } from '@/lib/api/client';
import { emptySnapshot } from '@/lib/snapshot';

export const dynamic = 'force-dynamic';

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

type Params = Promise<{ building?: string; floorCycle?: string; page?: string }>;

/** `/kiosk?building=A&floorCycle=20s&page=8s` — unattended, no cursor, no chrome. */
export default async function KioskPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const building = params.building ?? 'A';

  const [map, board, time] = await Promise.all([
    getJson<MapSpec>(`/api/v1/buildings/${building}/map`),
    getJson<Snapshot>(`/api/v1/buildings/${building}/board`),
    getJson<TimeInfo>('/api/v1/time'),
  ]);

  const snapshot = board ?? emptySnapshot(building);

  return (
    <KioskApp
      initialSnapshot={snapshot}
      mapSpec={map ?? staticSpec}
      initialTime={time?.now ?? snapshot.at}
      apiDown={board === null}
      floorCycleMs={parseDuration(params.floorCycle, 20_000)}
      pageMs={parseDuration(params.page, 8_000)}
    />
  );
}
