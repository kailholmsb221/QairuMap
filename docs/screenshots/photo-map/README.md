# Photo map in the existing 2.5D scene

The supplied floor photographs are the visual source, not the older images in
`packages/map-data/reference`. The final clarification keeps the existing
exploded slabs, parallax, spring transitions, pulse dots, search dimming and
selection strokes. The background outside the building is clipped out. Printed
captions appear only when focusing a floor.

## Implementation

- `apps/web/public/maps/floor-1-hd.png` is the new unchanged 1086x1448 source.
  `floor-1.png` is a lossless 90-degree rotation to 1448x1086; no upscaling or
  redrawing is used. Floor 2 is unchanged. SHA-256 hashes are recorded and tested.
- `packages/map-data/scripts/photo_map.py` traces source-pixel interiors, closes
  specific doorway connections and checks that all 54 known room codes have
  nonoverlapping regions. Unlabelled spaces retain the existing API identities.
- Source pixels and room contours share one affine transform into the existing
  600x1000 scene coordinates. It preserves aspect ratio and reverses the scene's
  existing -90-degree focus rotation.
- `withPhotoGeometry` changes only room geometry and the slab outline. API IDs,
  types and names remain. The later HD update retires CR from scheduling and
  removes all map actions for 102/102A, CR, CINEMA and first-floor WCs.
  Libraries 102/102A remain discoverable in search: selecting either result
  draws its exact contour and a `HERE` badge without enabling clicks or details.
  Migration 0004 preserves the existing lesson templates (44 CR records verified
  before and after). Nonschedulable rooms no longer materialise daily sessions;
  both lesson creation and moves reject them. Other room statuses are unchanged.
- A protected mask excludes lettering and structural lines from color blending.
  Free rooms retain the photo; other colors use `RoomLiveState.phase`, with
  `room.type === 'admin'` taking precedence. Conflict/delay details remain in the
  board and detail panel, without additional map patterns.
- Distant textures conceal only caption rectangles inside room interiors.
  Focus uses the untouched original image. The two printed 102 and 226 labels
  remain separate rooms, with internal 102A and 226A IDs unchanged.

## Verification Artifacts

- `exploded-desktop.png`, `exploded-mobile.png`: both slabs and existing effects.
- `focus-floor-{1,2}.png`, `focus-mobile.png`: actual running application.
- `contours-floor-{1,2}.png`: source-pixel tracing overlay.
- `actual-native-floor-{1,2}.png`: rendered browser SVG layers at native scale.
- `overlay-native-floor-{1,2}.png`: 50% overlay against the original cutout.

The native-scale comparison embeds the actual browser layer's textures and
resolved colors, cancels only the presentation transform, and omits optional
focus glow. It compares opaque source pixels outside the tint mask (one pixel
of mask-edge antialiasing tolerance, channel tolerance 4). HD update:
floor 1, 0/433,895 differing protected pixels; floor 2, 0/292,211. This checks the
photograph alignment, not a claim that the animated perspective is identical
to a flat photograph.

Browser tests cover all room anchors, curved nonrectangular hit targets,
duplicate IDs, keyboard selection, search, parallax, focus captions and mobile
overflow. Existing engine tests cover the exact soon/start/ending/end boundaries.

Checks include web production build, ESLint, TypeScript, 112 web unit tests,
12 map-data tests, and browser checks including inactive facilities, API move
rejection and cancellation/restoration over direct SSE. Engine and seed tests
cover retired rooms without deleting input templates. The preview uses a fixed
2026-09-08 10:47 +05:00 demo API at port 8081 and the web app at port 3001;
the pre-existing services on ports 3000 and 8080 were not stopped.

## Reproduce

Install the Python dependencies from `packages/map-data/scripts/authoring/requirements.txt`,
then run `pnpm --filter @campuslive/map-data photo:build` at the repository root.
Run `pnpm --filter web exec vitest run --configLoader native` for web unit tests.
The photo browser checks are in `apps/web/e2e/photo-map.spec.ts` and use the same
fixed demo API/time as the existing Playwright suite.

For an independent local instance, `NEXT_DIST_DIR` can isolate the Next output.
Use the existing `API_URL` and `NEXT_PUBLIC_API_URL` settings to select its API,
and include the web origin in the API's CORS configuration. Default deployment
configuration is unchanged.
