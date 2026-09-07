# CampusLive — Design Brief for Claude Design

> How to use: attach the two floor-plan photos (floor 1 and floor 2) to the message, then paste everything below. Ask for the artboards in the order listed; iterate on Artboard 1 until it feels right before moving on — every other screen inherits from it. When finished, export PNGs of every artboard, `tokens.css`, and the two floor plans as SVG into `docs/design/` of the code repo.

---

## What we are designing

**CampusLive** — a real-time "airport departures board" for a university building, combined with an interactive 2.5D map of that building. It lives on one screen with **no scrolling**: a big wall display in the lobby, a kiosk, or a laptop. In one glance a student sees which classes are running right now, in which rooms, who teaches them, and what starts next; the map shows the same information spatially, room by room, floor by floor, and updates the second a lesson starts or ends.

The two attached photos are the real architectural plans of floors 1 and 2. **Use them only for the building's shape, zoning and circulation** — the rooms inside are invented and listed below. The photo of floor 2 is upside-down: rotate it 180° so both floors share the same orientation (straight façade on the right).

## Audience and context

Students and teachers walking past a 55–75″ display, guests in the lobby, and — importantly — people watching a portfolio demo video. It must read from four metres away (board) and reward a closer look (map details, micro-animations). Dark theme is primary; a light theme is a variant, not a priority.

## The one hard rule

Everything essential fits in a **1920×1080** frame with zero scrolling. When content overflows (more classes than rows), the board flips to the next "page" like an airport board — it never scrolls. Design for 1920×1080 first, then show how the same layout holds at 1280×720 and 3840×2160.

## Screen anatomy (1920×1080)

| Zone | Size | Contents |
|---|---|---|
| Header | full width × 64 px | building name + small logo mark · large live clock `10:47:32` with date and "Week 3 · odd" · floor tabs `All · 1 · 2 · 3 · 4` (each with a tiny "busy" count) · search trigger (⌘K) · RU / KZ / EN · theme toggle · kiosk button |
| Map stage | left column, flexible width (~1300 px) | the 2.5D building scene; legend bottom-left; "28 / 41 rooms busy" chip top-right; a thin time-travel bar along the bottom edge that expands on hover into a day timeline |
| Board | right column, 560 px | section `NOW` (classes in progress, sorted by end time) and section `NEXT` (starting within 90 min, sorted by start time); rows `time · room · course · teacher · groups · status`; page-indicator dots |
| Ticker | full width × 40 px | scrolling announcements and auto-generated lines ("213 · Databases starts in 4 min · Akhmetov D."), a small connection dot (live / reconnecting / offline), version |

Gutter 16 px, outer padding 16 px. Overlays (never new pages): a **room detail panel** (420 px glass card sliding over the board), a **search palette** (⌘K), and a hidden **demo admin panel**.

## Visual direction

"Airport flight-information display meets a premium operations dashboard." Deep graphite-navy background, soft glass panels, one cool accent, a strict typographic grid, and information density that feels calm rather than busy. Avoid: neon cyberpunk, gradients everywhere, rounded-bubble consumer UI, stock isometric-city clip art. Reference feelings: the split-flap boards at Zurich or Frankfurt airports; Linear's dark UI; a well-lit architectural model under glass.

### Colour

| Token | Role | Suggested value |
|---|---|---|
| `--bg` / `--bg-elev` | page / raised surfaces | `#0B0F17` / `#111826` |
| `--panel` / `--line` | glass panels / hairlines | `rgba(255,255,255,.04)` / `rgba(255,255,255,.08)` |
| `--text` / `--text-dim` | primary / secondary text | `#E6EAF2` / `#8B94A7` |
| `--accent` | headers, focus, selection | teal `#5EEAD4` |
| `--status-live` | class in progress | teal `#2DD4BF` |
| `--status-soon` | starts within 10 min | amber `#FBBF24` |
| `--status-ending` | last 5 minutes | orange `#FB923C` |
| `--status-cancelled` | cancelled | red `#F87171` |
| `--status-moved` | moved to another room | violet `#A78BFA` |
| `--status-delayed` | delayed | amber-dark `#F59E0B` |
| `--room-free` | idle room fill | `rgba(255,255,255,.10)` |
| `--wing-north` / `--wing-south` / `--wing-core` | faint zoning tints echoing the architect's blue / pink / green | 4–6 % opacity blue / rose / green |
| `--slab` / `--slab-edge` / `--slab-top` | floor plate, its thickness, its lit top edge | `#161E2E` / `#0A0E16` / `rgba(255,255,255,.12)` |

Status must never rely on colour alone: every status has a text label or glyph. Check ≥ 4.5:1 contrast for all text on `--bg`.

### Typography

UI: **Manrope** (or Inter). Board: a monospaced face with real tabular figures — **JetBrains Mono** or IBM Plex Mono — because split-flap cells need fixed widths. Clock: 40–44 px mono. Board rows: 20–22 px at 1920×1080, comfortably legible at 4 m. Room chips on the map: 12–13 px mono, uppercase tracking +4 %.

## The building and the 2.5D map

### Shape (from the photos)

Canonical orientation: north up, **straight façade on the east (right)**, **continuous convex façade on the west (left)**. The north edge sweeps down toward the west with a very large radius (the north-west corner is almost a quarter-ellipse); the south-west corner has a large radius; north-east and south-east corners have small radii; the south edge bows out slightly. Proportions roughly 3 : 5 (width : height).

Inside: a **central hall** runs east–west across the middle (reception, turnstiles, an "island" info desk, entrances at both ends — main entrance on the west). A **vertical strip along the east side** holds the two circulation cores: north core = stairs SF-1 + elevators; south core = stairs SF-2 + elevator P-1, with a small security/dispatch room between them. The **north wing** (blue on the plans) and **south wing** (pink) each have large rooms along the curved outer façade, an inner corridor parallel to the hall, and a compact block of restrooms / technical rooms in the middle. Floor 2 repeats the outline; its hall becomes a gallery around an **atrium void** over the lobby with a bridge, and a hatched **double-height void** sits over the Skywalkers lab in the south wing. Floors 3 and 4 are "typical" teaching floors with the same outline and the atrium closed.

### Rooms to draw (invented; use exactly these codes and names)

**Floor 1** — north wing: `101` Lecture Hall "Alpha" (120, at the curved NW façade) · `102` Open Space Coworking (80) · `103` Canteen + `103A` Kitchen · `104` Student Service Center · `105` Medical Point · `106` Admissions Office · `107` Meeting Room "Bereke" (8) · `108` Wardrobe North · `WC-N1`. Core: `LOBBY` (reception, turnstiles, waiting) · `100` Info Desk island · `109` Security & Dispatch · `CORE-N1` (stairs SF-1 + elevators) · `CORE-S1` (stairs SF-2 + elevator P-1). South wing: `110` Assembly Hall "Aula" (220, big SW room) · `111` Lecture Hall "Beta" (90) · `112` Skywalkers Robotics Lab (30, double-height) · `113` Library & Reading Room (60) · `114` Career Center · `115` Student Clubs Office · `116` Print & Copy · `117` Wardrobe South · `WC-S1`.

**Floor 2** — north wing (offices): `201` Dean's Office · `202` Dept. of Computer Science · `203` Dept. of Cybersecurity · `204` Dept. of Data Science & AI · `205` Faculty Meeting Room (16) · `206` Server Room · `207` Classroom (24) · `208` Classroom (24) · `209` Teachers' Lounge · `WC-N2`. Core: `200` Study Lounge on the atrium gallery · `ATRIUM` void with bridge · `CORE-N2` / `CORE-S2`. South wing (labs): `210` Samsung Innovation Lab (30) · `211` Astana Hub Startup Lab (30) · `212` Skywalkers Mezzanine (void) · `213` Lecture Hall "Gamma" (100, big SW room) · `214` Classroom (30) · `215` Classroom (30) · `216` Computer Lab 1 (25) · `217` Computer Lab 2 (25) · `218` Classroom (20) · `219` Language Lab (20) · `WC-S2`.

**Floors 3–4** — same outline; per floor: one lecture hall (100) in each wing, 7 classrooms (30), one computer lab (25), one specialised lab (3: Cyber Range Lab, 4: AI & GPU Lab), one project room, one faculty office, a study lounge in the core, restrooms.

### How the map should look

- **Exploded view (default)**: four floor plates stacked with a visible gap, tilted about 58° and rotated about −38°, seen slightly from the south-west so the curved façade faces the viewer. Each plate has real thickness (a darker 6 px edge) and a hairline lit top edge. Rooms are readable as tinted shapes; live rooms glow softly teal with a small pulsing dot; soon-to-start rooms blink amber; free rooms are barely there. Cores, stairs and entrances are drawn as fine line glyphs. The building silhouette alone should say "this is that building".
- **Focus view (a floor is selected)**: the chosen plate rotates flat to top-down and scales up to fill the stage; the other plates dim to almost nothing and drift away. Now every schedulable room carries a **chip**: room code, course code, and a countdown ("ends 12 min") with a thin progress arc. Hovering a room shows a tooltip; clicking opens the detail panel.
- **Selected / highlighted**: the selected room gets an accent stroke and glow while the rest fall back to 50 %; a search highlight (e.g. group ПО2308) outlines every matching room with a badge and dims everything else to 35 %.
- Subtle parallax: the whole scene tilts ±2.5° with the pointer. Design it so that it still looks right with parallax off.

## The board

Rows read left to right like a departures board: `08:00` · `213` · `CS201 Databases` · `Akhmetov D.` · `ПО2308, ПО2309` · `LIVE`. Time, room and status use split-flap cells (fixed-width mono characters on dark tiles with a horizontal seam). Course title is proportional type, truncated with an ellipsis, never wrapping. Section headers `NOW · 28` and `NEXT · within 90 min` sit on a thin accent rule. When a session moves from `NEXT` to `NOW`, the row physically slides from one section to the other. Status pills: `LIVE` teal, `STARTS 09:00` amber, `ENDS 5 MIN` orange, `CANCELLED` red with strikethrough on the course, `MOVED → 214` violet, `DELAYED +15` amber-dark, plus a small ⚠ for data conflicts. Show 12–14 rows at 1920×1080; page dots under each section; a paused-on-hover pager.

## Motion spec (design it, don't just describe it)

| Moment | Motion | Timing |
|---|---|---|
| Floor focus / unfocus | plate rotates flat and scales; others fade and drift on Z | spring, ~600 ms settle |
| Row appears / leaves | fade + 8 px vertical slide; moving rows use shared layout | 300 ms, ease-out `cubic-bezier(.16,1,.3,1)` |
| Split-flap change | each character tile flips in two halves, staggered 25 ms per cell | 90 ms per half |
| Live room | 6 px dot pulses (scale 1 → 1.6, opacity 1 → 0) | 2 s loop |
| Soon room | fill opacity 0.6 ↔ 1 | 1 Hz |
| Page flip on the board | whole section flips down like a departure board | 400 ms |
| Ticker | continuous horizontal marquee, pauses on hover | 90 px/s |
| Reduced motion | no parallax, no pulse, no flips — fades only | — |

## Artboards to deliver (1920×1080 unless noted)

1. **Main screen — live, Tuesday 10:47**, exploded map, 28 of 41 rooms busy, both board sections full, ticker running. This is the hero; iterate here first.
2. **Floor 2 focused** with room `213` selected and the room detail panel open (Databases · Akhmetov D. · ПО2308, ПО2309 · progress 62 % · next three sessions).
3. **Search state**: palette open with the query "ПО2308"; map highlighting that group's current and next rooms; board filtered.
4. **Time-travel state**: bar expanded, scrubbed to 14:05, clock tagged `SIMULATED`, a `LIVE` return button.
5. **Kiosk mode** (3840×2160): no interactive chrome, larger type, auto-rotating floor focus, page dots.
6. **After-hours / empty**: 21:30, no classes; a calm "Next class tomorrow 08:00 · 101 · Discrete Math" card; map fully dim with entrances lit.
7. **Reconnecting and error states**: amber connection dot with "reconnecting…" and the last-known board intact; a full API-down state.
8. **1280×720** version of Artboard 1 proving nothing scrolls.
9. **Component sheet**: board row in every status; status pills; split-flap cell; room chip; tooltip; floor tab; legend; connection dot; buttons; the detail panel.
10. **Floor plans, flat** (two artboards, 600×1000 units each): stylised top-down plans of floors 1 and 2 following the photos, every room drawn as a closed shape and named with its code. These become the SVG source for the map, so layer / object names must be exactly `room-101`, `room-213`, `zone-hall`, `zone-north`, `zone-south`, `outline`, `core-n`, `core-s`, `entrance-w`, `entrance-e`, `atrium`.

## Export

- PNG of every artboard at 2×.
- `tokens.css` with all `--*` variables above, finalised.
- Floor plans 1 and 2 as clean SVG (no raster, no effects, closed paths, object names as listed), `viewBox="0 0 600 1000"`, straight façade on the right.
- A one-page motion sheet (durations, easings) as PNG or Markdown.

## Do / Don't

Do keep the dark surfaces slightly warm-blue rather than pure black, keep hairlines at 8 % white, give the floor plates real thickness, let the curved façade be the hero silhouette, and make every status legible in text. Don't add decorative gradients, glassmorphism blur on large areas, a literal "isometric city", drop shadows on text, or any element that only makes sense with sound.
