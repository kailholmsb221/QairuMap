# The real building — room programme (authoritative)

This file replaces Appendix A of `ARCHITECTURE.md`. The building has **two floors**.
Everything below is traced from the two real floor-plan photos in
`packages/map-data/reference/floor-1.png` and `floor-2.png` (floor 2 already
rotated 180° so its labels read correctly).

Room **codes**, **types** and **schedulable** flags here are the contract between
`packages/map-data` (geometry), `services/api` (seed) and `apps/web` (render).
Nothing may invent a code that is not in this table.

## Display names

Every room carries a Kazakh/Russian display name and an English one. The seed
writes the Russian name into `rooms.name` (that is what the UI shows) and the
English one into the map data `data-name`, so both are available.

The **displayed** name is not the seeded one, though: `apps/web/messages/{ru,kk,en}.json`
carries a `rooms.<CODE>` entry for every space, so switching language renames the
whole plan — Кітапхана · Библиотека · Library. `features/rooms/useRoomName.ts`
resolves it and falls back to whatever the API sent, so a room added to the
building shows under its seeded name until it is translated.

It also writes a third string, `rooms.aliases` — the everyday words a visitor
types («кафе», «туалет», «коворкинг», «айти департамент»), in all three
languages at once. Nothing renders it; `SearchRooms` matches on it so that
searching for a place by its ordinary name finds it and the map points at it.
The table lives in `services/api/internal/seed/data.go`.

## Wings

`wing` has exactly three values — `north`, `south`, `core`. That is the `Wing`
enum in `packages/contracts/openapi.yaml`, the `wing` Postgres enum in
`services/api/migrations/0001_init.sql`, and the three tinted zones the map draws
(`zone-north`, `zone-hall`, `zone-south`). It records **which band of the shared
plate** a space sits in, not which façade it faces: a floor-2 room on the west or
east edge of the ring is `north`, `core` or `south` depending on how far down the
plate it lands. Floor 2's table keeps the ring edge in a separate column so the
real arrangement is still readable.

## Floor 1

| Code | Название | Name (EN) | type | wing | cap | Пары |
|---|---|---|---|---|---|---|
| `100` | Мәжіліс залы | Assembly Hall | lecture | south | 180 | **да** |
| `101` | Оқу зертханасы | Teaching Laboratory | lab | south | 30 | **да** |
| `102` | Кітапхана | Library | coworking | south | 60 | нет |
| `102A` | Кітапхана — оқу залы | Library — Reading Room | coworking | south | 40 | нет |
| `103` | Медициналық пункт | Medical Room | service | south | 4 | нет |
| `CR` | Конференц-бөлме (CR) | Conference Room | seminar | south | 24 | нет |
| `CINEMA` | Кинозал | Cinema | lecture | south | 60 | нет |
| `WC-1` | Дәретхана | Restrooms | service | south | — | нет |
| `WC-2` | Дәретхана | Restrooms | service | south | — | нет |
| `CAFE` | Асхана | Cafe | service | core | 120 | нет |
| `ATRIUM-N` | Солтүстік атриум | North Atrium | service | north | — | нет |
| `TECH-N2` | Техникалық бөлме | Technical | service | north | — | нет |
| `TECH-N3` | Техникалық бөлме | Technical | service | north | — | нет |
| `TECH-S1` | Техникалық бөлме | Technical | service | south | — | нет |
| `CORE-N1` | Баспалдақ және лифт | Stairs & Lifts | service | core | — | нет |
| `CORE-S1` | Баспалдақ | Stairs | service | core | — | нет |

Floor 1 schedulable: **`100`, `101`** (2).

The first-floor public facilities `102`, `102A`, `CR`, `CINEMA`, `WC-1` and
`WC-2` are passive on the map. Migration 0004 retires CR from teaching without
deleting existing lesson templates; the timeline excludes nonschedulable rooms.

## Floor 2

Floor 2's rooms form a ring, so the table also records which **edge of the ring**
each room sits on. That is descriptive; the `wing` column is the contract value.

| Code | Название | Name (EN) | type | wing | ring edge | cap | Пары |
|---|---|---|---|---|---|---|---|
| `200` | Дәріс аудиториясы | Lecture Hall | lecture | north | west | 120 | **да** |
| `201` | Кеңес өткізу залы | Conference Hall | seminar | north | west | 40 | **да** |
| `202` | Деканат | Dean's Office | admin | north | north | 10 | нет |
| `203` | Академиялық қызмет департаменті | Department of Academic Activities | admin | north | north | 12 | нет |
| `204` | Оқу зертханасы | Teaching Laboratory | lab | core | core | 25 | **да** |
| `205` | Қойма бөлмесі | Warehouse | service | core | core | — | нет |
| `206` | Ректордың қабылдау бөлмесі | Rector's Reception Office | admin | north | north | 6 | нет |
| `207` | Ректор Тоқсанов Сапар Нұрахметұлы | Rector Sapar Toksanov | admin | north | north | 8 | нет |
| `208` | Бірінші проректор Өмірбаев Серік Мәуленұлы | First Vice-Rector Serik Omirbayev | admin | north | north (outer) | 8 | нет |
| `209` | Проректорлардың қабылдау бөлмесі | Vice-Rectors' Reception | admin | north | north | 6 | нет |
| `210` | Кабинет 210 | Office 210 | admin | north | north | 6 | нет |
| `211` | Кабинет 211 | Office 211 | admin | north | north (outer) | 6 | нет |
| `212` | Кабинет 212 | Office 212 | admin | north | north (outer) | 6 | нет |
| `213` | Ректор кеңесшісі Сабитов Айдын Маратұлы | Advisor to the Rector Aidyn Sabitov | admin | north | north | 4 | нет |
| `214` | Бухгалтерлік есеп департаменті | Accounting Department | admin | north | east | 12 | нет |
| `215` | Кабинет 215 | Office 215 | admin | north | east | 8 | нет |
| `AI-LAB` | AI зертханасы | AI Lab | lab | core | east | 25 | **да** |
| `217` | Маркетинг және қоғаммен байланыс департаменті | Dept. of Marketing and PR | admin | south | east | 12 | нет |
| `218` | Білім беру бағдарламалары мектебі | School of Educational Programs | admin | south | east | 14 | нет |
| `219` | Дәріс аудиториясы | Lecture Hall | lecture | south | east | 100 | **да** |
| `220` | Қызметтік бөлме | Staff Room | service | south | south | 8 | нет |
| `221` | Тіркеу кеңсесі | Registrar's Office | admin | south | south | 10 | нет |
| `222` | Компьютерлік сынып | Computer Lab | lab | south | south | 25 | **да** |
| `223` | Оқу зертханасы | Teaching Laboratory | lab | core | core | 25 | **да** |
| `224` | Дәріс аудиториясы | Lecture Hall | lecture | south | west | 100 | **да** |
| `225` | Қызметтік бөлме | Staff Room | service | south | west | 6 | нет |
| `226` | Оқу зертханасы | Teaching Laboratory | lab | core | west | 30 | **да** |
| `226A` | Оқу зертханасы | Teaching Laboratory | lab | core | core | 25 | **да** |
| `WC-N2` | Дәретхана | Restrooms | service | core | core | — | нет |
| `WC-S2` | Дәретхана | Restrooms | service | core | core | — | нет |
| `VOID-2` | Атриум ойығы | Atrium void | void | core | core | — | нет |
| `CORE-N2` | Баспалдақ және лифт | Stairs & Lifts | service | core | core | — | нет |
| `CORE-S2` | Баспалдақ | Stairs | service | core | core | — | нет |
| `227` | IT департаменті | IT Department | admin | south | east (inner) | 15 | нет |
| `228` | Коворкинг | Coworking | coworking | north | core | 30 | нет |
| `229` | Қызметтік бөлме | Staff Room | service | south | west (outer) | — | нет |
| `231` | Қойма бөлмесі | Storage Room | service | north | core | — | нет |
| `232` | Қызметтік бөлме | Staff Room | service | south | east (inner) | — | нет |

Floor 2 schedulable: **`200`, `201`, `204`, `AI-LAB`, `219`, `222`, `223`, `224`, `226`, `226A`** (10).

**Total: 54 spaces, 12 schedulable.**

`210`, `211`, `212`, `215` appear on the plan but are not in the university's
room list, so they carry a neutral "Кабинет NNN" name. `227`, `228`, `229`, `231` and `232` are
the same case one step further: the plan draws the space but numbers nothing, so
the code is ours. There is deliberately no `230`: the band it was first given is
part of `220`, which runs unbroken from `221` to the façade — the two stub
partitions inside it stop short of the far wall. `227` (IT department) and `228` (coworking) were named by the building's
own staff; `229`–`232` are the leftover service rooms of the inner core. The plan shows the
Teaching Laboratory number `226` twice; the second one is coded `226A`.

`VOID-2` is the floor-2 `<path id="atrium">`: `svg2map` emits it as the floor's
`atrium` **and** as a room, so the void is clickable like anything else. It
replaces the placeholder code `ATRIUM` the invented plans used — anything keying
off that string (today only the dashed-gallery detail in
`apps/web/components/map/RoomShape.tsx`) has to move to `VOID-2`.

## Geometry

Every polygon on the plate is the one the real plan draws. The two renders in
`packages/map-data/reference/floor-{1,2}.png` are traced directly by
`packages/map-data/scripts/authoring/` and written straight to
`svg/floor-{1,2}.svg`; there is no intermediate table of rectangles, and
`pnpm --filter @campuslive/map-data run svg:check` both draws each authored plate
beside its plan and prints how much of every room still overlaps the cell it came
from (median 0.92 on floor 1, 0.93 on floor 2).

Walls are the Scharr ridge of the plan's luminance, with the white room captions
inpainted out first — traced as-is, a number bit its own shape out of the polygon
around it and erased the wall it happened to sit on. **The rooms are the
components of the plate minus those walls**, which is the room crisply, with
every notch, partition and service closet the plan draws still in it. The same
walls with the doorway gaps sealed by oriented line closings give a second,
coarser set of blobs; those are used only to decide **which of the crisp cells a
doorway joins**. A cell holding two of them is two rooms and is split between
them; a cell holding none is a room the sealing erased, and keeps its own shape.
The wall band itself is split down the middle, so two neighbours meet on the same
line.

Each room is named by an **anchor**: a point in plan pixels that falls inside it,
listed in `scripts/authoring/rooms.py`. Re-tuning the segmentation therefore
cannot silently renumber the building. `220` carries three anchors because the
plan runs it unbroken from `221` to the façade with two stub partitions inside,
and `100`, `102A` and `103` two or three each for the same reason.

Each floor carries **its own** silhouette rather than a shared one. Floor 2's
plan is drawn 90° clockwise from floor 1's, so it is rotated back
(`x' = H − y`, `y' = x`) before both plates are fitted into the shared box; that
is why the two outlines nearly, but not exactly, coincide — they are two separate
drawings of the same building.

A pixel trace is not drawn geometry: every wall comes back as a staircase that
wobbles a degree either side of true. `scripts/authoring/geometry.py` straightens
it twice. First **per room, in its own frame** — the building is an arc, so there
is no single axis to snap to, and a room here is a rectangle that happens to be
rotated: it is turned onto the axis its own walls run at, every wall is forced to
the nearer of the two axes, jags and serrations are swallowed, and the ring is
rebuilt from those lines. What comes out is rectilinear: straight walls, square
corners, no stray diagonals. A partition traced from an open line drawing has no
reliable axis of its own and is squared to the room beside it, which is what
keeps a block of them a grid. Then **per floor**, because a wall is shared: every
edge becomes a line, and lines that are nearly parallel and nearly coincident are
one wall the trace saw twice and are averaged into it.

A straightening that would move more than 18 % of a room's area, or throw a wall
more than a tenth of its size out of place, is rejected and the room keeps a
softer pass that only straightens the walls near its own axis — which is what the
handful of spaces the plan genuinely does not draw square need. Both guards are
judged **after** clipping to the façade, so a room on the outer wall keeps
straight party walls and a curved outer edge, exactly as the plan draws it.
Finally every room is pulled back off the centre line of its wall, which is what
draws the wall as a line on the plate.

One space cannot be segmented: the plan gives `CAFE` no fill of its own, only the
rounded tag it prints `cafe` inside in the middle of the lobby. That tag is the
polygon, listed in `SHAPES` in `scripts/authoring/rooms.py`. Everything else on
both floors, the two stair cores included, is traced.

`ATRIUM-N` (the north hall) is a container space: `TECH-N2` and `TECH-N3` stand
inside it, exactly as the plan shows. Every other pair of rooms on a floor is
disjoint, and the build fails if that stops being true.

Every cell that carries no code — the circulation, the stub partitions, the
service closets, the line work of floor 1's south-east block — is emitted as
`<g id="corridors">` and drawn under the rooms, filled and stroked. It is what
you walk through and what divides the rooms, not what you are looking for, so it
is never labelled and never clickable.

## Schedule

Five courses exist in the whole university (first-year programme):

| Code | Дисциплина |
|---|---|
| `AIF1303` | Основы искусственного интеллекта |
| `FC1301` | Основы математического анализа |
| `HK1105` | История Казахстана |
| `ICT1103` | Информационно-коммуникационные технологии |
| `IP1302` | Введение в программирование |

Teachers are placeholders — `Преподаватель 1` … `Преподаватель 12` — and groups are
`Группа 1` … `Группа 24`. Both are renamed from the admin panel; nothing in the code
depends on their text.
