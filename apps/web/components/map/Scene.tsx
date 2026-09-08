'use client';

import { useEffect, useMemo, useRef } from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'motion/react';
import type { MapFloor, MapSpec, RoomLiveState } from '@campuslive/contracts';
import type { RoomDisplayPhase } from '@/features/board/selectors';
import {
  EXPLODED_RX,
  EXPLODED_RZ,
  PERSPECTIVE,
  PLATE_GAP,
  fitExploded,
  fitFocus,
  samplePath,
  type ExplodedFit,
  type FocusFit,
} from '@/lib/map-geometry';
import { FloorLayer, SlabUnder, type RoomLabeller } from './FloorLayer';

const SPRING = { stiffness: 120, damping: 18, mass: 1 } as const;
const PARALLAX_SPRING = { stiffness: 60, damping: 20, mass: 1 } as const;
const PARALLAX_DEG = 2.5;

export type SceneProps = {
  spec: MapSpec;
  phases: Record<number, Record<string, RoomDisplayPhase>>;
  states: Record<string, RoomLiveState>;
  stageWidth: number;
  stageHeight: number;
  focusedFloor: number | null;
  selectedRoom: string | null;
  highlight: ReadonlySet<string>;
  lit?: boolean;
  kiosk?: boolean;
  reducedMotion?: boolean;
  travelOpen?: boolean;
  label: RoomLabeller;
  onSelectRoom?: (code: string) => void;
  onHoverRoom?: (code: string | null) => void;
  onFits?: (fits: { exploded: ExplodedFit; focus: FocusFit }) => void;
};

export function Scene({
  spec,
  phases,
  states,
  stageWidth,
  stageHeight,
  focusedFloor,
  selectedRoom,
  highlight,
  lit,
  kiosk,
  reducedMotion,
  travelOpen,
  label,
  onSelectRoom,
  onHoverRoom,
  onFits,
}: SceneProps) {
  const floors = spec.floors;
  const outline = useMemo(() => samplePath(floors[0]?.outline ?? ''), [floors]);

  const fit = useMemo(
    () =>
      fitExploded(
        outline,
        floors.length,
        stageWidth,
        stageHeight,
        travelOpen ? { shiftY: -34, margin: { x: 110, y: 78 } } : {},
      ),
    [outline, floors.length, stageWidth, stageHeight, travelOpen],
  );

  const focus = useMemo(() => fitFocus(stageWidth, stageHeight), [stageWidth, stageHeight]);

  useEffect(() => {
    onFits?.({ exploded: fit, focus });
  }, [fit, focus, onFits]);

  const focused = focusedFloor != null;
  const focusIdx = focused ? floors.findIndex((f) => f.number === focusedFloor) : -1;
  const sceneScale = fit.k > 0 ? focus.s / fit.k : 1;

  const rx = useSpring(EXPLODED_RX, SPRING);
  const rz = useSpring(EXPLODED_RZ, SPRING);
  const sc = useSpring(1, SPRING);
  const tx = useSpring(fit.tx, SPRING);
  const ty = useSpring(fit.ty, SPRING);

  const pRx = useSpring(useMotionValue(0), PARALLAX_SPRING);
  const pRz = useSpring(useMotionValue(0), PARALLAX_SPRING);

  useEffect(() => {
    rx.set(focused ? 0 : EXPLODED_RX);
    rz.set(focused ? -90 : EXPLODED_RZ);
    sc.set(focused ? sceneScale : 1);
    tx.set(focused ? 0 : fit.tx);
    ty.set(focused ? -4 : fit.ty);
  }, [focused, sceneScale, fit.tx, fit.ty, rx, rz, sc, tx, ty]);

  const totalRx = useTransform([rx, pRx], ([a, b]: number[]) => (a ?? 0) + (b ?? 0));
  const totalRz = useTransform([rz, pRz], ([a, b]: number[]) => (a ?? 0) + (b ?? 0));
  const transform = useMotionTemplate`translate(${tx}px, ${ty}px) rotateX(${totalRx}deg) rotateZ(${totalRz}deg) scale(${sc})`;

  const hostRef = useRef<HTMLDivElement>(null);
  const parallaxOn = !kiosk && !reducedMotion;

  useEffect(() => {
    if (!parallaxOn) {
      pRx.set(0);
      pRz.set(0);
      return;
    }
    const el = hostRef.current;
    if (!el) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      pRx.set(-ny * 2 * PARALLAX_DEG);
      pRz.set(nx * 2 * PARALLAX_DEG);
    };
    const leave = () => {
      pRx.set(0);
      pRz.set(0);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [parallaxOn, pRx, pRz]);

  const layerTarget = (i: number) => {
    if (!focused) {
      return { z: (i - 1.5) * PLATE_GAP, opacity: 1, x: 0, y: 0 };
    }
    if (i === focusIdx) return { z: 0, opacity: 1, x: 0, y: 0 };
    if (i === focusIdx - 1) {
      // the ghost of the floor below, offset by (−22, 18) on screen
      return { z: -2, opacity: 0.07, x: -18 / sceneScale, y: -22 / sceneScale };
    }
    return { z: -60 * Math.abs(i - focusIdx), opacity: 0.06, x: 0, y: 0 };
  };

  return (
    <div
      ref={hostRef}
      data-testid="scene"
      data-mode={focused ? 'focus' : 'exploded'}
      style={{
        position: 'absolute',
        inset: 0,
        perspective: `${PERSPECTIVE}px`,
        perspectiveOrigin: '50% 50%',
        opacity: lit ? 0.75 : 1,
        transition: 'opacity var(--dur-slow) var(--ease-out)',
      }}
    >
      <motion.div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: fit.width,
          height: fit.height,
          marginLeft: -fit.width / 2,
          marginTop: -fit.height / 2,
          transformStyle: 'preserve-3d',
          transform,
        }}
      >
        {floors.map((floor: MapFloor, i) => {
          const target = layerTarget(i);
          const isFocused = focused && i === focusIdx;
          return (
            <motion.div
              key={floor.number}
              data-floor-layer={floor.number}
              initial={false}
              animate={target}
              transition={reducedMotion ? { duration: 0.2 } : { type: 'spring', ...SPRING }}
              style={{
                position: 'absolute',
                inset: 0,
                transformStyle: 'preserve-3d',
                pointerEvents: focused && !isFocused ? 'none' : undefined,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  transform: 'translateZ(-6px)',
                }}
                aria-hidden="true"
              >
                <SlabUnder outline={floor.outline} width={fit.width} height={fit.height} />
              </div>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  // the single focused plate is the only element allowed a filter
                  filter: isFocused ? 'drop-shadow(0 30px 40px rgba(0,0,0,.45))' : undefined,
                }}
              >
                <FloorLayer
                  floor={floor}
                  phases={phases[floor.number] ?? {}}
                  states={states}
                  mode={focused ? 'focus' : 'exploded'}
                  width={fit.width}
                  height={fit.height}
                  selected={isFocused ? selectedRoom : null}
                  highlight={highlight}
                  lit={lit}
                  dots={!focused}
                  interactive={!kiosk && (!focused || isFocused)}
                  label={label}
                  onSelect={onSelectRoom}
                  onHover={onHoverRoom}
                />
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
