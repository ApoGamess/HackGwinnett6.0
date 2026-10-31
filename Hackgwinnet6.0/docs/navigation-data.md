# Navigation data and routing

## Dataset origin

The request referred to a `carenori_accessibility_starter` attachment containing a SQLite database, JSON/SQL seed, GeoJSON, `route_demo.py`, tests and phrases. That bundle was not present in the supplied attachments or in the targeted search of Downloads, Documents and Desktop. **The original database, seed, phrases and reference algorithm were not used.**

`src/navigation/seed.json` is an authored fictional replacement, explicitly identified in its metadata and the demo interface. Its counts match the requested structure; this does not imply compatibility with the unavailable original records or reference tests. All demo places, building geometry, measurements, feature states and appointment information are fictional.

| Table | Records | Purpose |
| --- | ---: | --- |
| `places` | 18 | Healthcare, pharmacy, entrances, ramp, parking/drop-off, elevators, restrooms, waiting/quiet spaces, assistance and consultation destinations |
| `accessibility_features` | 30 | Individual four-state feature records, each associated with a place and source |
| `route_nodes` | 19 | Authored local-meter positions and explicit ground/upper floors |
| `route_edges` | 23 | Measured fictional segments with access attributes and endpoint references |
| `communication_phrases` | 24 | Authored English/Spanish phrases in six groups |
| `sample_documents` | 1 | Fictional administrative appointment letter in English and Spanish |
| `accessibility_reports` | 0 initially | Reports are stored separately in the browser only after explicit submission |
| `metadata` | One object | Schema version, replacement disclosure, coordinate and persistence boundaries |

The bilingual replacement phrases preserve the existing prototype's familiar communication shortcuts. They must not be described as the phrases supplied in the unavailable starter bundle.

## Repository and boundaries

This static application reads JSON. **It does not open or query SQLite.** `NavigationRepository` deep-freezes a copied seed and exposes query methods. Components obtain places, features, graph data, phrases and documents through this repository rather than constructing independent datasets.

Stable identifiers and references connect features/documents to places, places to route nodes, and edges to nodes. The data tests check those references and the required counts. Demo/public arrays are separate. `listPlaces(mode, filters)` never combines them. Feature filters require `yes` for every selected feature; `no`, `limited`, missing records and `unknown` do not match.

Public imports replace the current area result and deduplicate by OSM element type and ID. A node and a way with the same numeric ID remain different records. Import rejects fictional records, mismatched OSM identities, invalid coordinates and demo route-node references. Public search results remain in memory. Refreshing replaces discoveries with the separate saved `public-seed.json` Grady Memorial Hospital record. The real seed is OSM way 270880941, center `[-84.382073, 33.7517332]`, with official name/address cross-check, dated source provenance and unknown access features. It has no route node or indoor graph. See [real-map-evidence.md](real-map-evidence.md) for the source import and actual vector-tile height evidence.

Personal messages, conversation replies, preferences, appointment details, questions and visit notes are not fields in this place repository. Their existing session-memory boundaries remain separate. Non-sensitive interface settings continue to use their existing settings key.

## Fictional coordinates and buildings

Demo nodes store local-meter coordinates and a floor. For MapLibre rendering only, meters are divided by 111320 to produce small longitude/latitude-like values around `[0, 0]`. This convention is not a real campus location and must never be used as geographic directions.

`demoBuildings` contains two authored schematic floor volumes, from local `[-55, -20]` to `[85, 80]` meters, with fictional heights of 4 meters per floor. They are not measured surveys, room boundaries, indoor floor plans or positioning data. The demo uses a blank style without real-world tiles.

## Constrained graph search

`route.ts` implements Dijkstra over the graph's supported edges. It returns ordered node/edge identifiers, summed edge distance, bilingual directions, floor transitions, and reasons for excluded segments. It does not draw a direct line as a substitute for routing and does not estimate arrival times.

The strict profile excludes:

- Stairs and edges closed in the data or by the explicit demo elevator controls.
- Missing required openness, width, incline, kerb or surface information.
- Invalid/non-positive lengths and invalid measurements.
- Width below, incline/kerb above, or surfaces outside the selected constraints.

Defaults are **demo test values**, not clinical recommendations or legal thresholds: minimum width 95 cm, maximum absolute incline 6%, maximum kerb 2 cm; allowed surfaces are paved, concrete, asphalt and tiles. Users can change constraints in the route UI. Unknown data never becomes a positive access claim, and unsupported routes never fall back to stairs.

The tested default journey is `parking` → `consultation`:

| Demo controls | Computed behavior | Edge distance |
| --- | --- | ---: |
| Both elevators open | Uses elevator A | 176 m |
| Elevator A closed | Uses elevator B | 242 m |
| Elevators A and B closed | No supported route | No route distance claimed |

The route is recalculated from the actual graph and constraints. A report about an apparent lift issue does not change any graph edge. Only the clearly labeled demo closure controls do so.

## Public OSM adapter

`overpass.ts` performs GET reads only when called by the explicit Search this area action. It uses the official public Overpass interpreter directly and never uploads reports, edits OSM or invokes a route service. Name/category filtering only searches loaded records and sends no appointment or OCR text to a public service. GET was validated after this development environment returned HTTP 406 for POST; no public proxy is used.

Bounds and resource limits:

- Circle radius: 100–1500 m, default 750 m at the adapter level; the current interface explicitly selects 800 m.
- Bounding box: validated coordinates, no antimeridian crossing or longitude-wrap spans, maximum 3 km diagonal.
- Server query timeout 15 seconds; client cancellation at 20 seconds.
- Maximum 1500 response elements and 5 MiB response body; oversized and incomplete responses produce errors rather than truncated success.
- Caller `AbortSignal` support, one request in flight, at least 1.5 seconds between network requests and no automatic retries. Up to six successful public responses stay in memory with a 5-minute freshness window. Stale cached records are offered explicitly after a failed refresh, with their original retrieval date; they are never labeled live. This bounded request cache contains public area queries, not a live-location history. `clearPublicCache()` clears it. Per-client limits do not replace deployment-wide service capacity planning.
- Invalid JSON/response shape and Overpass `remark` responses are rejected. Non-coordinate/non-relevant OSM elements cannot become display records.

Queries request healthcare facilities/hospital buildings/pharmacies and documented nearby entrances, elevators, toilets, parking/disabled parking/drop-off spaces, wheelchair ramps, benches, reception desks and information offices. Every result remains an independent source record. A nearby entrance is not automatically assigned to a hospital. Way/relation centers are labeled as display coordinates and cannot support entrance-level directions. The cached hospital is an initial exploration area; browser location is requested only by the user and remains distinct from a selected destination.

Original OSM string tags, including descriptions, comments, `note`, `fixme`, wheelchair details and partial-access values, are retained. The adapter recognizes `yes`, `no`, `limited`, and documented `designated` values; unsupported/missing values remain `unknown`. Examples of deliberately narrow interpretation:

- A mapped elevator indicates a listed feature, not a live operating status.
- A wheelchair-accessible entrance does not establish access to every room or restroom.
- A restroom's own wheelchair tag, or an explicit `toilets:wheelchair` tag, can describe restroom access. The facility's general wheelchair tag does not imply restroom access.
- A bench supports a seating feature, not a quiet-waiting claim.
- No supported source tag means written communication, quiet waiting, wheelchair assistance and loan availability stay unknown.
- An assistance desk in the fictional dataset does not establish that a loan wheelchair is available.
- A negative ramp tag cannot create a ramp pin. Contradictory steps/wheelchair tags or a portable ramp do not establish a step-free entrance.
- Impossible calendar dates are omitted from the displayed source dates while their original tags remain inspectable.

Map and public-search requests go to third-party services and require internet access. They are independent of the local fictional demo. No failed or empty public query substitutes demo pins. The application makes no claim that OSM records are verified healthcare-accessibility information.

## Source dates

Source metadata separates:

- `updatedAt`: the OSM element's supplied edit timestamp.
- `retrievedAt`: when this response was successfully read by the adapter. Cached results retain the original retrieval date.
- `inspectedAt`: a source-supplied `survey:date`, if valid. This is a reported survey date, not a CareNori inspection or certification.

`check_date` is retained in the original tags but is not promoted to a field-inspection date: a check can be remote. Downloading a record never creates a verified-today or inspected-today label. Fictional demo source creation/update dates are not field inspections.

## Local barrier reports

Reports use `carenori-local-barrier-reports-v1` in browser localStorage only after explicit Save. Each has a selected target, mode, report kind, short note, creation time and the fixed status `unverified_local`. Notes must contain 1–600 characters; the local store is limited to 100 reports. The form asks users not to include patient or identifying information.

Reports are not published, reviewed, sent to a hospital or merged into source feature values. They are listed separately from source information. Public reports do not close real elevators or alter the fictional routing graph. A failed storage write throws an error and does not announce a successful save. Clearing reports has a separate control from clearing personal session content; demo reset reopens simulated elevators and clears demo reports without deleting the visit plan.

## Sources consulted

- [Overpass QL syntax and output](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)
- [Wheelchair access tagging](https://wiki.openstreetmap.org/wiki/Key:wheelchair)
- [Entrance tagging and supported access attributes](https://wiki.openstreetmap.org/wiki/Key:entrance)
- [Elevator tagging](https://wiki.openstreetmap.org/wiki/Tag:highway%3Delevator)
- [Toilet tagging](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dtoilets)
- [Check-date semantics](https://wiki.openstreetmap.org/wiki/Key:check_date)
- [OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright)

## Validation and limits

Thirteen automated route/data tests pass. They verify table counts and references, A/B/no-route computation, graph-distance sums, exclusions, missing and conflicting public access, calendar-valid source dates, comment preservation, mode isolation, import identity/deduplication, reports/storage failures, bounded queries including longitude-wrap rejection, response errors, cache behavior and late cancellation. Adapter tests mock public responses; they do not certify the availability or accuracy of the live Overpass service.

No public wheelchair routing, live lift status, equipment availability, hospital notification, crowdsourced verification, original-starter compatibility or indoor GPS positioning is implemented. Browser rendering, speech, external tiles and public services have their own availability limits; list/text/typed interactions remain the baseline.
