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
| `CR` | Конференц-бөлме (CR) | Conference Room | seminar | south | 24 | **да** |
| `CINEMA` | Кинозал | Cinema | lecture | south | 60 | нет |
| `WC-1` | Дәретхана | Restrooms | service | south | — | нет |
| `WC-2` | Дәретхана | Restrooms | service | south | — | нет |
| `CAFE` | Асхана | Cafe | service | core | 120 | нет |
| `ATRIUM-N` | Солтүстік атриум | North Atrium | service | north | — | нет |
| `CORE-N1` | Баспалдақ және лифт | Stairs & Lifts | service | core | — | нет |
| `CORE-S1` | Баспалдақ | Stairs | service | core | — | нет |

Floor 1 schedulable: **`100`, `101`, `CR`** (3).

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
| `227` | IT департаменті | IT Department | admin | south | east | 15 | нет |
| `228` | Коворкинг | Coworking | coworking | north | core | 30 | нет |
| `229` | Қызметтік бөлме | Staff Room | service | south | core | — | нет |
| `231` | Қойма бөлмесі | Storage Room | service | north | core | — | нет |
| `232` | Қызметтік бөлме | Staff Room | service | south | core | — | нет |

Floor 2 schedulable: **`200`, `201`, `204`, `AI-LAB`, `219`, `222`, `223`, `224`, `226`, `226A`** (10).

**Total: 51 spaces, 13 schedulable.**

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

Every room polygon is the one the real plan draws. The two reference renders in
`packages/map-data/reference/floor-{1,2}.png` are segmented directly: white
background is flood-filled from the border, the remaining plate is split into
fills and wall strokes, the fill mask is eroded so doorway gaps stop leaking one
room into the next, and the surviving cores are grown back geodesically so each
label meets its neighbour in the middle of the wall. The resulting outlines and
room polygons are committed as
`packages/map-data/scripts/authoring/traced.json`, in `viewBox 0 0 600 1000`.

Each floor therefore carries **its own** silhouette rather than a shared one.
Floor 2's plan is drawn 90° clockwise from floor 1's, so it is rotated back
(`x' = H − y`, `y' = x`) before both plates are fitted into the shared box; that
is why the two outlines nearly, but not exactly, coincide — they are two separate
drawings of the same building.

Each room on the plan carries its number in white type, and on a narrow room
those glyphs touch the walls. Traced as-is the contour wrapped around the
letters and bit number-shaped notches out of the polygon, so the captions are
healed first: small enclosed white blobs are dilated and merged back into the
room, and exempted from the wall-edge pass. With that done every labelled room
separates on its own — 13/13 on floor 1 and 37/37 on floor 2.

Five spaces per floor are drawn white on the plan and so cannot be segmented —
`LOBBY`, `CAFE`, `TECH-N1`, `CORE-N1`, `CORE-S1` on floor 1 and `CORE-N2`,
`CORE-S2` on floor 2. They keep the fallback rectangles in
`scripts/authoring/geometry.mjs`, clipped to their own floor's outline.

`ATRIUM-N` (the north hall) and `LOBBY` (the middle band) are container spaces:
`TECH-N1…N3` stand inside the hall and `CAFE` inside the lobby, exactly as the
plan shows. Every other pair of rooms is disjoint.

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
