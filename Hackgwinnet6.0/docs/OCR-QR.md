# Sign reading and controlled QR checkpoints

These tools share the camera owned by `CameraService`. Neither OCR nor QR asks for a second media stream. Sign reading also accepts a user-selected JPEG, PNG, WebP or BMP without camera permission. PDF extraction is not implemented here; the existing sample-letter feature remains separate.

## Sign reading

1. Open **Camera assistance → Read a sign**. Start the camera and choose **Capture photo**, or choose a photo from the device.
2. Expand **Crop photo** if needed. All four boundaries are editable percentage number controls; dragging is not required. Photos are reduced to at most 2,400 pixels on the longest edge for bounded memory use.
3. Choose English or Spanish, then **Start recognition**. No inference or language download starts just because the panel or photo was opened.
4. Review and correct the recognized text. An OCR confidence score below 70, a missing score, or empty text shows an uncertainty cue. This threshold is an engineering review cue, not a calibrated correctness probability. Missing words are never completed by another model.
5. Read aloud, stop speech, copy, display in the shared communication panel, or edit and add a question to the shared visit plan. To search, select only a public place name, choose **Use selected text as place name**, and review the confirmation before the name is passed to the map's local search. Public discovery still requires **Search this area**.

`src/vision/ocr.ts` owns a dedicated supervisor worker. The supervisor lazy-loads Tesseract and owns its child recognition worker. Repeated recognition in the same language reuses the engine. Changing languages disposes that engine and initializes the selected one. Cancel, component exit, a hidden page, and a 120-second timeout terminate the worker tree; cancellation during initial loading also ends its child. Late callbacks cannot restore cancelled results. A separate unit check covers restart isolation.

Image bytes, crops, OCR output and user edits remain in memory and are discarded on panel exit or refresh. Only public language assets may be cached by the OCR engine. Selecting **Copy text** explicitly places the reviewed text on the user's clipboard. Map transfer includes only the selected, confirmed name. Model/language downloads are external network requests; they do not upload the image. Full offline operation is **not verified**.

## Printable QR labels and pilot setup

Run `node scripts/generate-checkpoint-labels.mjs` to regenerate the four printable SVG/PNG labels and `public/demo-checkpoints/labels.html`. Open that page through the app's **Printable demo QR labels** link, and print at 100% scale with the white quiet zones intact.

The exact allowlisted payload is:

```text
carenori:v1:demo-controlled:entrance:r1
carenori:v1:demo-controlled:reception:r1
carenori:v1:demo-controlled:waiting:r1
carenori:v1:demo-controlled:help-desk:r1
```

The parser rejects arbitrary URLs, encoded instructions, other sites, unknown checkpoint IDs and mismatched revisions. Decoding never opens a URL. Users review the matching local name and explicitly confirm it. The session stores **Last confirmed checkpoint**, confirmation method and timestamp; it is not a continuously tracked position. Manual IDs provide the same review/confirmation path.

The seed is synthetic and physically uninstalled. **These labels are not installed at Grady Memorial Hospital.** They refer only to authored demo graph nodes (`side`, `reception`, `waiting`, `assistance`), with no real geographic coordinate or surveyed measurement asserted. Opening a demo route requires a separate action and does not move or relabel the user's real geolocation or selected real destination.

For an authorized controlled venue: obtain permission; survey every graph segment and record width, slope, kerb, surface, closure state and source/inspection dates; replace the synthetic dataset and revision; physically place each label at its checked location; then verify the label-to-node mapping and constrained routes in person. A copied QR can be scanned anywhere, so a scan alone is not independent location evidence. A mapped route is not a live path-clearance check.

The scanner lazy-loads `BrowserQRCodeReader` and calls `decodeFromCanvas` on bounded copies of fresh frames from the existing video. It never uses ZXing's stream-creating/stream-disposing methods. It polls at most about three times per second after each completed attempt, skips unchanged frames, and stops on success, explicit stop, camera change/stop, hidden page or panel exit. Blank/damaged symbols use ZXing's stable exception kinds so minification does not turn an ordinary no-result frame into a failure.

## Versions, sources and licenses

| Asset or library | Version/source | License |
| --- | --- | --- |
| Tesseract.js | `6.0.1`, [versioned API](https://github.com/naptha/tesseract.js/blob/v6.0.1/docs/api.md) | Apache-2.0 |
| Tesseract worker | Bundled `tesseract.js/dist/worker.min.js` through Vite `?url`, same version as JS | Apache-2.0 |
| Tesseract WASM core | Installed/pinned `tesseract.js-core` `6.1.2`; matched `tesseract-core*.wasm.js` and `*.wasm` copied locally by `scripts/sync-vision-assets.mjs` | Apache-2.0; upstream notices retained |
| English model | [Pinned official language data](https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz) | Apache-2.0 model data |
| Spanish model | [Pinned official language data](https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa@1.0.0/4.0.0_best_int/spa.traineddata.gz) | Apache-2.0 model data |
| Language-data provenance | [naptha/tessdata documentation](https://github.com/naptha/tessdata), integerized Tessdata Best; [upstream model license](https://github.com/tesseract-ocr/tessdata_best/blob/main/LICENSE) | Apache-2.0 |
| QR decoder | `@zxing/browser` `0.1.5`, [versioned repository/API](https://github.com/zxing-js/browser/tree/v0.1.5) | MIT; underlying `@zxing/library` Apache-2.0 |
| QR label generator | `qrcode` `1.5.4`, [versioned repository](https://github.com/soldair/node-qrcode/tree/v1.5.4); build-time only | MIT |

No paid vision service or external language model is used. Language assets download from the documented Tesseract data distribution; worker/core code is served by the app from matching installed package files.

## Verification commands and boundaries

```powershell
npm run build
node scripts/generate-checkpoint-labels.mjs
npx playwright test -c tests/ocr-qr.config.ts
$env:RUN_VISION_NETWORK_TESTS='1'
npx playwright test -c tests/ocr-qr.config.ts tests/ocr-qr-ui.spec.ts
```

The isolated config uses a production preview at port 4177. The standard repository suite also discovers these tests. Network OCR checks are opt-in because they download official English/Spanish data. They run the actual Tesseract worker on an explicitly authored synthetic sign image, and test reviewed-text-to-question/place handoff. QR data tests use the real ZXing decoder on all four generated label images. The shared-stream QR browser test supplies a clearly labeled synthetic canvas stream through a test-only camera stub, runs actual decoding, and checks one stream request and track cleanup. These are **not physical-camera validation**.

On 2026-10-31, the production-preview command with `RUN_VISION_NETWORK_TESTS=1` passed all **12 tests in 24.0 seconds**. Actual English `RECEPTION` and Spanish `RECEPCIÓN` fixture recognition succeeded, as did the question and confirmed map-query handoff. The browser cancellation test observed all OCR workers close while initial core loading was held. QR/manual and OCR/crop views passed axe checks and 390-pixel overflow checks. Reviewed screenshots are saved as `artifacts/ocr-english-synthetic-fixture.png` and `artifacts/ocr-spanish-synthetic-fixture.png`. The production build passed; dependency-size warnings remain informational.

The hardware demonstration must be run separately on HTTPS/localhost: photograph an actual printed sign and verify/correct its words; scan each printed label in an authorized controlled venue; confirm the label and timestamp; open the synthetic route only in demo mode; stop the camera and verify the browser indicator turns off. Physical-camera OCR, real printed-label scanning, actual label installation/survey, and full offline operation are **NOT RUN** by the automated fixture checks.
