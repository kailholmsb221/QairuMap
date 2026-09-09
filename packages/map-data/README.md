# @campuslive/map-data

The one geometry artifact for building A. Two floors, 51 spaces, one shared
`viewBox 0 0 600 1000`, one silhouette per floor.

```
reference/floor-{1,2}.png  →  segmentation  →  scripts/authoring/traced.json
scripts/authoring/{traced.json,geometry,build-svg}.mjs   →  svg/floor-{1,2}.svg
svg/floor-{1,2}.svg  →  scripts/svg2map.ts  →  building-a.json   (committed)
```

`building-a.json` is what `apps/web` renders and what `cmd/seed` inserts, so
nothing anywhere else may hard-code room coordinates.

## The two steps

**`pnpm --filter @campuslive/map-data run svg:author`** regenerates the two SVGs.
Almost every room is the polygon segmented from the real plan and committed in
`scripts/authoring/traced.json`; the handful of spaces the plan draws white — the
lobby, the cafe, the stair cores — fall back to the axis-aligned rectangles in
`scripts/authoring/geometry.mjs`, clipped to their own floor's silhouette. The
corridors are the white gaps left between them. The generator refuses to write if
a space clips away to nothing, drops below 26×26, escapes the outline, or (for the
fallback rectangles only) overlaps a room it should not.

**`pnpm --filter @campuslive/map-data run build`** (a.k.a. `pnpm map:build`)
parses the SVGs and writes `building-a.json`, validating it against
`docs/BUILDING.md`: two floors, 51 spaces, and the exact schedulable set of each
floor.

## The SVGs are the source of truth, not the tables

`svg2map.ts` only ever reads `svg/floor-{1,2}.svg`. The authoring generator is a
convenience for laying a whole floor out at once — **the SVGs may equally be
hand-edited afterwards**, and `building-a.json` is always built from whatever the
SVGs currently say. Re-running `svg:author` overwrites hand edits, so either keep
a change in the tables or stop using the generator for that floor.

A floor SVG has to carry, in this order:

| element | notes |
|---|---|
| `<svg viewBox="0 0 600 1000" data-floor data-building>` | |
| `<path id="outline">` | the traced silhouette, identical on both floors |
| `<g id="zones">` | `zone-north`, `zone-hall`, `zone-south` |
| `<g id="rooms">` | `<path id="room-{CODE}" data-name data-type data-wing data-capacity data-schedulable d>` |
| `<g id="cores">` | `core-n`, `core-s`, each with `data-name` — emitted as rooms `CORE-{N,S}{floor}` too |
| `<g id="landmarks">` | `<use id="stairs-sf1" …>` |
| `<g id="entrances">` | `entrance-w` with `data-main="true"`, `entrance-e` |
| `<path id="atrium">` | floor 2 only — emitted as the room `VOID-2` |

`data-name` is the **English** name; the Russian one is added by the Go seed.
Codes are upper-case alphanumeric with hyphens (`100`, `102A`, `AI-LAB`,
`WC-N2`, `CORE-S1`) and are unique building-wide.

## Where the geometry comes from

`reference/` holds the two real floor-plan renders and `authored-check.png` — each
generated plate beside the plan it came from, which is how the geometry is
verified. Both plans are segmented directly: the background is flood-filled from
the border, the plate is split into fills and wall strokes, the fill mask is
eroded so doorway gaps stop leaking one room into the next, and the surviving
cores are grown back so neighbours meet in the middle of the wall. Each floor
keeps **its own** silhouette; floor 2's plan is drawn 90° clockwise from floor
1's and is rotated back before both are fitted into the shared box.
`docs/BUILDING.md` is the authoritative room programme and records the two
doorway-fused pairs that are cut apart by hand.

## Consumers

`src/index.ts` is the typed loader (`floorOf`, `roomsOf`, `findRoom`,
`schedulableCodes`, …). It is floor-count agnostic; adding or removing a floor
means adding or removing an SVG and updating the counts in `scripts/svg2map.ts`.
