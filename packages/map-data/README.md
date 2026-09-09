# @campuslive/map-data

The one geometry artifact for building A. Two floors, 54 spaces, one shared
`viewBox 0 0 600 1000`, one silhouette per floor.

```
reference/floor-{1,2}.png                       the two real plan renders
  └─ scripts/authoring/{plan,geometry,rooms}.py     trace · straighten · fit
       └─ scripts/authoring/build_svg.py  →  svg/floor-{1,2}.svg
            └─ scripts/svg2map.ts         →  building-a.json   (committed)
```

`building-a.json` is what `apps/web` renders and what `cmd/seed` inserts, so
nothing anywhere else may hard-code room coordinates.

## The two steps

**`pnpm --filter @campuslive/map-data run svg:author`** re-traces the two plans
and rewrites the SVGs. Every space is the polygon the plan itself draws; the only
hand-placed shape is the tag the plan prints `cafe` inside, which has no fill of
its own to segment (`SHAPES` in `scripts/authoring/rooms.py`). Needs the Python
packages in `scripts/authoring/requirements.txt`; `map:build` does not.

**`pnpm --filter @campuslive/map-data run build`** (a.k.a. `pnpm map:build`)
parses the SVGs and writes `building-a.json`, validating it against
`docs/BUILDING.md`: two floors, 54 spaces, and the exact schedulable set of each
floor.

**`pnpm --filter @campuslive/map-data run svg:check`** renders each authored
plate beside the plan it came from into `reference/authored-check.png`, and
prints how much of each drawn room still overlaps the cell it was traced from.
Those two are how the geometry is verified — a room that sits where the plan does
not put it shows up in both.

## The SVGs are the source of truth, not the plans

`svg2map.ts` only ever reads `svg/floor-{1,2}.svg`, so **the SVGs may equally be
hand-edited afterwards**. Re-running `svg:author` overwrites hand edits, so
either keep a change in the tracer or stop using it for that floor.

A floor SVG has to carry, in this order:

| element | notes |
|---|---|
| `<svg viewBox="0 0 600 1000" data-floor data-building>` | |
| `<path id="outline">` | the traced silhouette, one per floor |
| `<g id="zones">` | `zone-north`, `zone-hall`, `zone-south` |
| `<g id="corridors">` | every space the plan draws but does not number — circulation, partitions, closets — as `corridor-{n}` |
| `<g id="rooms">` | `<path id="room-{CODE}" data-name data-type data-wing data-capacity data-schedulable d>` |
| `<g id="cores">` | `core-n`, `core-s`, each with `data-name` — emitted as rooms `CORE-{N,S}{floor}` too |
| `<g id="landmarks">` | `<use id="stairs-nf1" …>` |
| `<g id="entrances">` | `entrance-w` with `data-main="true"`, `entrance-e` |
| `<path id="atrium">` | floor 2 only — emitted as the room `VOID-2` |

`data-name` is the **English** name; the Russian one is added by the Go seed.
Codes are upper-case alphanumeric with hyphens (`100`, `102A`, `AI-LAB`,
`WC-N2`, `CORE-S1`) and are unique building-wide.

## How the tracer works

`scripts/authoring/plan.py` segments a plan render into cells:

- **walls** are the Scharr ridge of the luminance. The white room captions are
  inpainted first, so a number neither bites a notch out of its own room nor
  erases the wall it happens to sit on.
- **doorways** are the gaps the plan draws in an otherwise straight wall. They
  are sealed by *oriented line closings*: a gap in a straight wall is collinear,
  so a line kernel bridges it while a room, which is not a line, never fills in.
- **cells** are the components of the plate minus the *thin* walls. That is the
  room, crisply, with its notches and partitions intact — every one of them, down
  to a service closet.
- **seeds** are the components left when the sealed walls are cut out instead.
  They round off corners and swallow the smallest rooms whole, so they are used
  only to say **which cells a doorway joins**: a cell holding two seeds is two
  rooms and is split between them by nearest seed; a cell holding one is that
  room; a cell holding none is a room the sealing erased, and keeps its own shape
  as a cell of its own. The wall band itself goes to the nearest cell, so two
  neighbours meet on the centre line of the wall between them.

`scripts/authoring/rooms.py` names the cells. A room is an **anchor** — a point
in plan pixels that falls inside it — rather than a cell number, so re-tuning the
segmentation cannot silently renumber the building. Several anchors mean the plan
draws the space in more than one piece (`220`, whose two stub partitions stop
short of the far wall) and the pieces are merged; the build fails if they turn
out not to touch.

`scripts/authoring/geometry.py` turns a pixel contour into drawn walls, twice
over. A trace is not geometry: every wall comes back as a staircase that wobbles
a degree either side of true.

**`rectify`** works on one space, **in its own frame** — the building is an arc,
so its rooms fan out around the curve and there is no single axis to snap the
plate to. A room here is a rectangle that happens to be rotated: the polygon is
turned onto the axis its own walls run at, every edge is forced to the nearer of
the two axes, runs that end up parallel are merged, walls shorter than
`MIN_EDGE` are swallowed, a step shallower than `JOG` between two walls facing
the same way is flattened (a serration the trace left on a soft edge, not a notch
the plan drew), and the ring is rebuilt from those lines. What comes out is
rectilinear: straight walls, square corners, no stray diagonals. A partition
traced from an open line drawing has no reliable axis of its own, so it is
squared to the room beside it — which is what keeps a block of them a grid.

**`consolidate`** then works on the whole floor at once, because a wall is
shared: every edge becomes a line, and lines that are nearly parallel and nearly
coincident are one wall the trace saw twice, replaced by their common average.

A straightening that would move more than 18 % of a space's area, or throw a wall
more than a tenth of its size out of place, is rejected; the space keeps a softer
pass that straightens only the walls near its own axis, which is what the handful
of spaces the plan genuinely does not draw square need. Both guards are judged
**after** clipping to the façade — a room on the outer wall is rectified like any
other, which throws its curved edge a long way out, and the clip is what puts it
back. Finally each space is pulled off the centre line of its wall, which is what
draws the wall as a line on the plate.

Floor 2's plan is drawn 90° clockwise from floor 1's and is turned back
(`x' = H − y`, `y' = x`) before both plates are fitted into the shared box, so a
room on the west façade of one sits over the room on the west façade of the
other. The two outlines nearly, but not exactly, coincide — they are two separate
drawings of the same building.

Every cell that carries no code — the circulation, the stub partitions, the
service closets, the line work of floor 1's south-east block — is emitted as
`<g id="corridors">` and drawn under the rooms, filled and stroked. It is what
you walk through and what divides the rooms, not what you are looking for, so it
is never labelled and never clickable.

`build_svg.py` refuses to write unless every code in `docs/BUILDING.md` found a
home, every anchor lands on the plate, no cell is claimed twice, no room is
narrower than 8 units, no two rooms of a floor overlap, and no room escapes the
silhouette (the north hall deliberately contains `TECH-N2` and `TECH-N3`, as the
plan draws them).

## Consumers

`src/index.ts` is the typed loader (`floorOf`, `roomsOf`, `findRoom`,
`schedulableCodes`, …). It is floor-count agnostic; adding or removing a floor
means adding or removing an SVG and updating the counts in `scripts/svg2map.ts`.
