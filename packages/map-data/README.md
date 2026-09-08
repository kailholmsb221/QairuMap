# @campuslive/map-data

The one geometry artifact for building A. Two floors, 51 spaces, one shared
`viewBox 0 0 600 1000`.

```
scripts/authoring/{geometry,build-svg}.mjs   →  svg/floor-{1,2}.svg
svg/floor-{1,2}.svg  →  scripts/svg2map.ts  →  building-a.json   (committed)
```

`building-a.json` is what `apps/web` renders and what `cmd/seed` inserts, so
nothing anywhere else may hard-code room coordinates.

## The two steps

**`pnpm --filter @campuslive/map-data run svg:author`** regenerates the two SVGs
from the room tables in `scripts/authoring/geometry.mjs`. Each room is one
axis-aligned rectangle in viewBox space, clipped to the real building silhouette;
the corridors are the white gaps left between the rectangles. The generator
refuses to write if a room clips away to nothing, drops below 26×26, escapes the
outline, or overlaps a room it should not.

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

`reference/` holds the two real floor-plan photos, the traced outline
(`outline-traced.txt`) and `authored-check.png` — the rendered plans beside the
photos, which is how the placement was verified. Floor 1 is read straight off its
photo through `x' = 0.37911·x − 68.8`, `y' = 0.37911·y + 16.1`; floor 2's photo is
drawn at a different orientation, so it is rotated 90° clockwise and mapped
topologically into the same silhouette. `docs/BUILDING.md` is the authoritative
room programme.

## Consumers

`src/index.ts` is the typed loader (`floorOf`, `roomsOf`, `findRoom`,
`schedulableCodes`, …). It is floor-count agnostic; adding or removing a floor
means adding or removing an SVG and updating the counts in `scripts/svg2map.ts`.
