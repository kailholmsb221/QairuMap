import data from '@campuslive/map-data/photo-map.json';
import type { MapRoom, MapSpec, RoomLiveState } from '@campuslive/contracts';

type PhotoRoom = Pick<MapRoom, 'path' | 'bbox' | 'label'> & {
  sourcePath: string;
  sourceLabel: { x: number; y: number };
};

export type PhotoFloor = {
  width: number;
  height: number;
  image: string;
  distantImage: string;
  mask: string;
  distantMask: string;
  transform: string;
  outline: string;
  sourceOutline: string;
  sha256: string;
  rooms: Record<string, PhotoRoom>;
};

export const photoFloors: Readonly<Record<number, PhotoFloor>> = data.floors;

/** Keep API identity and schedule metadata; adapt only the presentation geometry. */
export function withPhotoGeometry(spec: MapSpec): MapSpec {
  return {
    ...spec,
    floors: spec.floors.map((floor) => {
      const photo = photoFloors[floor.number];
      if (!photo) return floor;
      return {
        ...floor,
        outline: photo.outline,
        rooms: floor.rooms.map((room) => {
          const shape = photo.rooms[room.code];
          return shape ? { ...room, path: shape.path, label: shape.label, bbox: shape.bbox } : room;
        }),
      };
    }),
  };
}

export function photoPhase(room: Pick<MapRoom, 'type'>, state?: RoomLiveState) {
  return room.type === 'admin' ? 'admin' : room.type === 'void' ? 'void' : (state?.phase ?? 'free');
}
