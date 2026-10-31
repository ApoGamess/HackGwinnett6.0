# Implementation and verification — 31 October 2026

Statuses refer to the evidence described in each row. Automated fixtures do not count as physical-device validation.

| Capability | Status | Evidence / limit |
| --- | --- | --- |
| Existing app/framework and visit workflows | IMPLEMENTED AND TESTED | React/Vite retained; build/type checks and existing visit, communication, questions, print and privacy regressions. |
| MapLibre/OpenFreeMap, List/2D/3D and list fallback | IMPLEMENTED AND TESTED | Real Edge/WebGL network render at Grady, actual streets/volumes/attribution; failure and lifecycle tests. |
| Sourced Grady record, coordinate/address provenance | IMPLEMENTED AND TESTED | Official address cross-check and successful bounded OSM lookup; dated seed, identity/dedup/coordinate tests. |
| 3D source geometry | IMPLEMENTED AND TESTED | Actual tile inspection and rendered screenshots. Heights are provider estimates/defaults, not a surveyed hospital. |
| Bounded public discovery, cancellation/cache/validation | IMPLEMENTED AND TESTED | Deterministic adapter/UI tests; live area search failed visibly in this environment, so live service availability is not claimed. |
| Optional Google photorealistic provider | OPTIONAL CONFIGURATION REQUIRED | Provider boundary/disabled setting present. No key or Google renderer integrated/tested; owner setup plus an adapter are required. |
| Browser location/manual starting point and cleanup | IMPLEMENTED AND TESTED | Injected browser-fix accuracy/time tests, manual label, distinct destination and watcher cleanup. Physical location permission/accuracy NOT RUN. |
| Camera stream ownership, errors, pause/switch/stop/hidden cleanup | IMPLEMENTED AND TESTED | Pure lifecycle tests plus generated canvas MediaStream browser tests; real physical camera NOT RUN. |
| COCO-SSD download/backend/inference | IMPLEMENTED AND TESTED | Actual remote model load/warmup/inference on an explicitly generated blank-video fixture. Physical object/person detection and accuracy NOT RUN. |
| Freshness, adaptive scheduling, overlay transforms and text positions | IMPLEMENTED AND TESTED | One-in-flight and fallback scheduler tests; age/session suppression, contained/covered/mirrored/rotated transform tests. |
| English image OCR | IMPLEMENTED AND TESTED | Actual Tesseract recognition of generated sign pixels in production browser; not a photographed physical sign. |
| Spanish image OCR | IMPLEMENTED AND TESTED | Actual production Tesseract recognition of the authored RECEPCIÓN sign fixture. Physical photographed-sign validation NOT RUN. |
| OCR crop, review, cancellation, errors, question/place handoff | IMPLEMENTED AND TESTED | Worker/unit/UI checks, numeric crop, blocked core asset failure, worker-tree cancellation and confirmed reviewed-name handoff to map search. |
| QR decoder, strict payload and confirmed checkpoint | IMPLEMENTED AND TESTED | Actual ZXing decoding of four generated labels and a synthetic shared stream; one camera request, confirmation and stop cleanup. Physical printed scanning NOT RUN. |
| Printable controlled-pilot labels | IMPLEMENTED AND TESTED | Generator and decoding checks. Labels remain synthetic/uninstalled; no Grady deployment. |
| Strict indoor demo graph/closure recalculation | IMPLEMENTED AND TESTED | A → B → no supported route; stairs/closed/unknown/constraint tests. No surveyed real indoor graph. |
| Typed/large-text/two-way communication and shared context | IMPLEMENTED AND TESTED | Existing and new UI regressions; English/Spanish phrases and editable drafts. |
| Browser speech and stop/unavailable handling | IMPLEMENTED AND TESTED | API behavior/fallback tested with browser stubs. Audible hardware playback NOT RUN. |
| Optional gesture shortcuts and microphone transcription | NOT IMPLEMENTED | Typed interaction remains available; no sign-language or microphone claims. |
| Public/session data separation | IMPLEMENTED AND TESTED | Typed JSON schema, real/demo isolation, no private frame/location/message persistence, storage tests. |
| English/Spanish, keyboard, mobile, contrast, large text | IMPLEMENTED AND TESTED | Automated axe/overflow/focus tests including camera Spanish 390px with large text/high contrast. Screen-reader/manual WCAG audit NOT RUN. |
| Thermal/LiDAR/calibrated depth and public wheelchair routing | NOT IMPLEMENTED | No simulated substitutes or safety claims. |
| Real PDF extraction / offline guarantee | NOT IMPLEMENTED | Sample-letter workflow preserved; image OCR is explicitly separate. |
| Real hospital messaging, indoor deployment or partnership | NOT IMPLEMENTED | No staff notification, booking, room recognition or real hospital graph. |
| Physical-camera object/sign/printed-QR workflow | IMPLEMENTED BUT NOT TESTED | Actual processing paths exist; no physical camera, consenting person or installed-venue session was operated. Use the README hardware script. |

## Commands and evidence

- `npm run typecheck`: passed; the final production build also includes TypeScript checks.
- `npm run build`: passed; Vite reports non-failing lazy chunk-size warnings. The Windows sandbox initially blocked Vite realpath access; the authorized normal build succeeded.
- Final run: set both `CARENORI_NETWORK_TESTS=1` and `RUN_VISION_NETWORK_TESTS=1`, then `npm test`. Production build passed and **112 of 113 tests passed in 2.3 minutes**, with zero skipped. The one failure was the old menu expectation omitting the newly added Camera assistance item.
- Updated that menu expectation and ran `npx playwright test tests/carenori.spec.ts -g 'empty workspace' --output test-results-final-rerun --reporter=list`: **1 passed in 2.4 seconds**. All **113 distinct checks now have passing evidence** across the full run and targeted correction; no application failure remains from the suite.
- The full run includes actual COCO download/inference, actual English/Spanish OCR, real ZXing label/shared-stream decoding, blocked camera/model/OCR assets, stop/restart/late cleanup, stale suppression, overlay transforms, strict routes, provenance, cache, geolocation, privacy and English/Spanish accessibility checks.
- Separate targeted integration evidence: all 12 OCR/QR production-preview tests passed in 24 seconds; real Grady/OpenFreeMap 2D/3D rendering was separately inspected against the live provider.
- No lint script exists in the retained project.

Generated local evidence is excluded from publication: `artifacts/carenori-grady-real-2d.png`, `artifacts/carenori-grady-real-3d.png`, `artifacts/real-map-browser-evidence.json`, `artifacts/ocr-english-synthetic-fixture.png`, and Playwright reports/traces. Durable source inspection evidence is retained under `docs/`.

## Required physical demonstration: NOT RUN

No consenting physical camera session, photographed real sign, printed-label scan, hardware geolocation, audible voice playback, manual screen reader, or printer was operated in this development session. Follow the eight-step physical demonstration in the README. Never present generated video/sign fixtures as hardware validation.

## Remaining external limitations

The live Overpass area discovery attempt timed out/failed while the real seeded record and map remained usable. Availability and completeness of third-party public records are not guaranteed. Actual model and English/Spanish OCR downloads succeeded; uncached assets still need network access. COCO's official loader has no AbortSignal: a slow download receives a visible delay notice after 30 seconds, a camera stop still releases tracks, and a late model is disposed, but an in-flight model download itself can finish after exit. No Google credentials, surveyed venue data or deployment credentials were supplied.

GitHub publication is a separate operation. Repository/branch identified as `bunny2027/HackGwinnett5.0`, `main`; initial Git authentication was missing. No successful push is claimed without a verified remote commit hash.
