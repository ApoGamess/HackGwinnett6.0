# CareNori

One React / TypeScript / Vite app for sourced place exploration, real camera assistance and shared visit communication. Existing appointment, access-card, questions, notes, sample-letter, printing and constrained demo-route workflows remain available.

## Run

Use Node.js 22.12+ and npm (verified here with Node 24). No API key is required.

```sh
npm ci
npm run dev
npm run typecheck
npm run build
npm test
```

Predev/prebuild copies four matching Tesseract loader/WASM pairs from pinned dependencies into public/vision/tesseract. Deploy the complete dist directory, including workers/WASM. Generated assets, dist, node_modules, .env, credentials, traces and reports are excluded from source control. The included .env.example contains only the optional public map-style URL.

Camera and geolocation require **HTTPS or localhost**. An HTTP LAN address, direct file URL or restrictive editor can block permission; use a standalone HTTPS tab. No device permission is requested on page load. No microphone feature is installed. No account, paid resource or deployment is provisioned. For subdirectory hosting use `npm run build -- --base=/YOUR_PATH/`; the GitHub source folder does not determine the deployment URL.

## Connected demonstration

1. Open **Places & access**, initially the real Grady area, not your location. Filter loaded places for **Grady Memorial Hospital**, select it and inspect address, sources, dates and unknown access information.
2. Compare **List / 2D / 3D**, zoom, pan, reset orientation and fit results. **Search this area** explicitly requests nearby public features; typing filters existing records locally.
3. Optionally use browser location, inspect accuracy/time and stop tracking. Manual coordinates are labeled **Selected starting point**. Destination and start/current position stay distinct.
4. Open **Camera assistance → Start camera**. The actual video stream feeds COCO-SSD. Choose another camera if available.
5. Use **Describe this view**, **Find an object** or **Find a person in view**. Boxes have a matching text list. Supported targets: person, chair, bench, backpack, handbag, bottle, cup, book, laptop, cell phone. A chair is not a wheelchair; person does not imply identity or profession.
6. **Read a sign**: capture/choose a photo, crop using numeric controls, choose English/Spanish and start OCR. Correct text before reading, copying, displaying or adding a question. Confirm a reviewed place name before passing it to local search.
7. **Help me communicate** is available from map, camera and visit. Edit a phrase, display large text, explicitly speak or exchange typed replies. Nothing is sent to staff.
8. Stop camera. Leaving the page or hiding the app releases tracks; returning requires intentional start. Reset session clears personal content and checkpoint confirmation.

**Camera assistance can miss objects. It does not determine whether a path is safe.** Zero detections never means all clear. There are no thermal/depth/distance, identity, health, staff-role, room-recognition or world-anchored navigation claims.

## Geographic evidence

The seed is [OSM way 270880941](https://www.openstreetmap.org/way/270880941), center `[-84.382073, 33.7517332]`, cross-checked against the [official Grady location](https://www.gradyhealth.org/locations/grady-memorial-hospital/): **80 Jesse Hill Jr Drive SE, Atlanta, GA 30303**. This is a building display point and exploration reference, not an entrance, partnership, indoor deployment or user position. The minimal public seed retains tags and distinct retrieval/update provenance. Missing access tags remain unknown.

[OpenFreeMap Liberty](https://openfreemap.org/quick_start/) provides real streets/footprints. [MapLibre's ESM worker](https://maplibre.org/maplibre-gl-js/docs/) and CSS are bundled with Vite. Existing building extrusion layers are reused, labels/attribution preserved, and style reloads cannot duplicate layers.

The actual Grady-area tile contains 74 building footprints, 67 with positive render heights and a polygon containing the hospital point. Its render_height=5 is a **provider visualization estimate/default**, not a surveyed hospital height: the OSM hospital way has no height/levels tag. The UI labels estimates. Tilt, extruded footprints and photorealism are different. See [source evidence](docs/real-map-evidence.md) and [tile inspection](docs/grady-building-evidence.json).

Overpass uses explicit bounded GET requests, cancellation, validation, body/element limits, deduplication, request spacing and a six-entry five-minute memory cache. Cached records retain retrieval dates; stale records are explicitly offered after failure. Panning never queries automatically. No appointment text, public Nominatim autocomplete or CORS proxy is used. Nearby entrances, parking, restrooms and providers remain independent. Map/network errors preserve the list and communication.

```sh
node scripts/import-grady.mjs
node scripts/inspect-map-source.mjs
```

These are explicit source refresh/inspection scripts, not startup requests or field surveys. The importer verifies official/OSM identity and address before replacing the seed; review resulting source diffs.

## Camera and privacy

CameraService owns one video-only stream with permission/error states, switching, late-permission cleanup and intentional resume. OCR/QR read its frames without another camera session. Pause analysis keeps the preview; stop releases the device.

COCO-SSD uses adaptive new-frame scheduling at about 640-pixel input width. One inference runs at a time, including replacement lifecycles. Diagnostics show actual backend, size, inference duration, analyses/second, timestamp, age and errors—never promised frame rates or end-to-end latency. Results expire after 1,500 ms. Old sessions/dimensions cannot produce current boxes or speech. Stabilization only smooths currently matched objects; absent objects never linger. Speech replaces the prior utterance and offers stop.

Tesseract.js 6.0.1 reuses a local worker with matching core 6.1.2. A supervisor worker supports cancellation during initialization. Pinned language data downloads separately from local image recognition. ZXing decodes current frame copies on demand. Unused analysis stops; the map unmounts on the camera page. See [OCR/QR implementation and sources](docs/OCR-QR.md).

Visit details, messages, photos, OCR text, detections, checkpoint confirmations and positions stay in memory. No frames, location history, identity matches, analytics or clinical text enter the public repository. Only public models/language assets may be cached. **Full offline operation is unverified.** Browser speech may use platform processing; user text is never silently translated.

Only language/display settings persist automatically. Explicitly saved barrier reports remain local/unverified, do not change source facts or closures, and never contact hospitals. Do not include personal data in reports. Copied/printed/downloaded content is outside session reset. Storage is typed JSON plus memory, not SQLite or durable server storage.

## Controlled QR pilot and demo routing

Four [printable labels](public/demo-checkpoints/labels.html) cover entrance, reception, waiting and help desk. Regenerate with `npm run generate:qr`. Strict site/checkpoint/revision validation uses src/navigation/checkpoints.json. Arbitrary URLs/content are rejected, never executed/opened. Scanned/manual entries require confirmation, showing **Last confirmed checkpoint**, method and timestamp. Copied QR codes do not prove location.

**These labels are not installed at Grady.** In an authorized venue, physically place/check labels, survey segments and constraints, record sources/measurements, replace dataset/revision and verify the graph before claiming a surveyed pilot. Supplied labels and routes remain synthetic.

Constrained Dijkstra excludes stairs, closures, unknown required attributes and violations of width/incline/kerb/surface limits. Parking → upper consultation uses A (176 m), switches to B (242 m) when A closes, and reports no supported route when both close. Constraints never silently relax. The earlier starter bundle was unavailable; the existing authored replacement remains labeled. See [schema/routing](docs/navigation-data.md).

## Optional capabilities

Only MapLibre/OpenFreeMap is enabled. No authorized Google key was configured, so Google photorealistic 3D is disabled and no Google engine/imagery loads. [Google Demo Key docs](https://developers.google.com/maps/documentation/javascript/demo-key) restrict eligibility/features and say daily limits can change; the fetched page supplied no numeric quota. Do not assume all photorealistic APIs qualify. A future adapter must verify exact API/channel, coverage, restrictions, quotas and production billing against [3D Maps docs](https://developers.google.com/maps/documentation/javascript/3d/overview). Never load both engines or mix Google-derived content into OSM.

Not implemented: optional gestures, voice transcription, PDF extraction, thermal/calibrated depth, public wheelchair routing, hospital messaging, real indoor positioning or offline guarantees. Typed communication and sample-letter review remain usable.

## Tests and hardware checks

See [feature matrix and verification](docs/verification.md). Tests use installed Microsoft Edge. For Playwright Chromium, install it and set PLAYWRIGHT_CHANNEL=chromium. No lint script is configured. Type/build/behavior/axe checks target WCAG 2.2 AA, not certification. Large lazy map/vision chunks emit non-failing size warnings.

Required physical-device checks, with consent and no sensitive content in view:

1. Load/select Grady; inspect sources, streets, real 2D/3D geometry and height-estimate note.
2. Request location, inspect accuracy/time, stop; try a labeled manual point.
3. Start a physical camera, find chair/bottle, remove it and observe text/boxes update. Optionally detect a consenting generic person.
4. Pause/resume, switch camera, hide/return and intentionally resume. Confirm stale speech is suppressed.
5. Photograph a printed sign, crop, recognize, correct text and add a question; cancel/retry.
6. Print/scan a demo QR, confirm name/time, reject an unrelated QR and try manual entry.
7. Display/speak a question and stop; check typed reply and access card.
8. Stop/leave camera and confirm the device indicator turns off. No microphone permission should occur.

These remain **NOT RUN** until physically performed. Generated sign/QR images and canvas video fixtures are automated tests, not physical-camera validation.

## Licenses and sources

| Component | License / source |
| --- | --- |
| React | MIT, [React](https://github.com/facebook/react) |
| MapLibre GL JS 6.16.0 | BSD-3-Clause, [MapLibre](https://github.com/maplibre/maplibre-gl-js) |
| OpenFreeMap/OpenMapTiles/OSM | Preserve attribution; OSM ODbL 1.0, [copyright](https://www.openstreetmap.org/copyright), [building schema](https://openmaptiles.org/docs/schema/#building) |
| TFJS 4.22.0 / COCO-SSD 2.2.3 | Apache-2.0, [model/defaults](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd), [classes](https://github.com/tensorflow/tfjs-models/blob/master/coco-ssd/src/classes.ts). Endpoint comes from installed package; COCO data has separate image/annotation terms. |
| Tesseract.js 6.0.1 / core 6.1.2 | Apache-2.0, [Tesseract](https://github.com/naptha/tesseract.js), [core](https://github.com/naptha/tesseract.js-core); core LICENSE copied with generated assets |
| English/Spanish data | Apache-2.0, [official distribution](https://github.com/naptha/tessdata); pinned @tesseract.js-data/{eng,spa}@1.0.0/4.0.0_best_int on jsDelivr |
| ZXing browser 0.1.5 / library | MIT wrapper / Apache-2.0 decoder, [ZXing](https://github.com/zxing-js/browser) |
| qrcode 1.5.4 | MIT, [node-qrcode](https://github.com/soldair/node-qrcode), development-only label generator |
| Grady name/address | Minimal factual record linked to official location; no institutional affiliation |

Metadata: src/camera/modelMetadata.ts, src/vision/modelMetadata.ts, place seed and generated OCR manifest. Exact dependencies and transitive assets are in package-lock.json.
