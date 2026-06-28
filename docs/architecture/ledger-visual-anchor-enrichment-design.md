# Ledger Visual Anchor Enrichment Design

## Status

Design proposal for Slice 2F-A. Not yet an accepted ADR.

## 1. Context

Slice 2E made the Verification overlay read the active extracted quantity ledger instead of treating
legacy `door_hits` or `visual_opening_audit` markers as quantity truth.

Slice 2E.1 then checked multiple jobs and found no split-brain across Export, Verification, Review,
and Overlay:

- JM-0060 has active persisted ledger rows.
- JM-0060 has 67 ledger rows, 0 drawable bbox markers, and 67 no-marker rows.
- Older/exported jobs resolve as unavailable / requires rerun under the active ledger authority path.
- O'Neil and 15a / 15 A were not found in live job search.

The next problem is evidence richness. The product needs a safe way for a ledger row to reference a
visual/evidence anchor without allowing an old marker store to become active quantity authority again.

Doctrine to preserve:

- Evidence sources feed the ledger.
- The ledger remains the active quantity authority.
- Overlay is a view of active ledger rows.
- Visual evidence does not create clean quantities by itself.
- Unknown dimensions remain null.
- Assumed heights remain quarantined and must not create clean height or area.

## 2. Current State

The current ledger row evidence shape already allows page and bbox fields:

```ts
type ExtractedQuantityEvidence = {
  sheetId?: string;
  page?: number;
  bbox?: [number, number, number, number];
  text?: string;
  scale?: string;
  witnessIds?: string[];
  sourceFileName?: string;
};
```

However, the current ledger builder mostly emits text-only evidence:

- exterior perimeter: `EnrichedTakeoff.external_wall_lm`
- interior doors: `deterministic interior-door engine confirmed count`
- opening evidence: semicolon text built from `OpeningEvidenceItem`

JM-0060 proves this current state: active ledger rows exist, but none carry usable bbox evidence.

The overlay read model currently splits active ledger rows into:

- `markedRows`: rows whose first usable evidence has bbox
- `unmarkedRows`: rows without bbox

Legacy visual sources are still present as evidence counts and review tables, but Slice 2E labels them
evidence-only and disables legacy correction controls in the ledger overlay path.

## 3. Sources Audited

| Source/path | Current data shape | Bbox/geometry | Coordinate system | Page quality | Run/job scope | Stable IDs | Maps to ledger row IDs today | Dimensions | Status/warnings | Staleness risk | Authority risk | Classification |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `extracted_quantity_rows.evidence_json` / `ExtractedQuantityEvidence` | array of evidence entries on active ledger row | optional `bbox` | unspecified today | optional `page` | row has jobId/runId | row id is stable per run | yes, evidence lives on row | row carries dimensions separately | row carries status/warnings | low when active run filtered | low if read-only | SAFE_EVIDENCE |
| `takeoff_json.extracted_quantities` fallback | same row/evidence shape in enriched JSON | optional `bbox` | unspecified today | optional `page` | current run only through authority selector | row id stable for current run | yes | yes | yes | medium if used outside selector | medium | USE_WITH_MATCHING |
| `visual_opening_audit.openings` | id/type/room/label/height/width/x/y/confidence/evidence/flags | center point only, not bbox | normalized rendered image coordinates | `pageNumber` on parent, nullable | inside takeoff_json run; no row runId per item | visual ids like `visual-opening-*` | no direct ledger row id | yes, sometimes inferred | flags and confidence | high after rerun if reused directly | high if treated as active rows | LEGACY_EVIDENCE_ONLY |
| `door_hits` | type/widthMm/x/y/arcMm/confidence/note | point only | adapter page space, y-down, view-origin-relative | paired with `door_page` | inside takeoff_json run | no ledger row id | no, only aggregate interior-door ledger rows today | width only | confidence/note | high if used across reruns | high if counted as active markers | LEGACY_EVIDENCE_ONLY |
| `door_page` | pageNumber/view/width/height/scaleText | page transform metadata | PDF page view plus adapter page contract | good when present | inside takeoff_json run | no | helper only | no | no | medium if run not scoped | low as transform metadata | SAFE_EVIDENCE |
| `VerificationPlanOverlay` props | jobId, active ledger overlay model, door page | draws only ledger rows with bbox | expects bbox center convertible through adapterToUser + pdf.js viewport | depends on `door_page` for drawing | model has active runId | uses `extractedQuantityId` | yes for ledger rows | displays row dimensions | displays status/warnings | low when active model supplied | low after Slice 2E | SAFE_EVIDENCE |
| rendered PDF text locations | `RawTextItem` / stitched labels with user-space coordinates | point/label locations | PDF user space before viewport conversion | live page render only | job file current page, not persisted | text string only | no | text may contain dimensions | none | low as runtime evidence, not persisted | medium if used to assert rows | USE_WITH_MATCHING |
| `pdf-adapter.extractPageGeometry` | labels, segments, polylines | vector segments, text point labels | adapter page space, y-down | exact page being parsed | runtime only unless persisted | no row ids | no | text labels may carry dimensions | none | low if run-scoped | medium if promoted blindly | USE_WITH_MATCHING |
| floor plan symbols / vector geometry | derived walls/gaps/opening evidence | wall/gap geometry, not currently row bbox | adapter/vector page space | depends on extraction page | current run in takeoff_json | wall face ids / gap ids | indirect through witnessIds | widths sometimes | routing/confidence in evidence | medium if old takeoff_json reused | medium | USE_WITH_MATCHING |
| `opening_evidence` | candidates with evidence items | no explicit bbox today | not specified | no page field today | inside active enriched run | candidate ids | ledger row id becomes `opening-${candidate.id}` | yes/null | status/review_flags/conflicts | medium if fallback used outside selector | medium due pricing-shaped fields | USE_WITH_MATCHING |
| `opening_schedule` | relational Windows & Doors compatibility rows | no bbox | none | source_evidence/page fields only | jobId only, no active runId | row ids | no | yes | review status | high stale rerun risk | high | DO_NOT_USE_FOR_ACTIVE_LEDGER |
| legacy `extracted_quantities` table | old scalar quantity rows | no bbox | none | plan_page_number optional | jobId only | row ids | no | scalar extracted_value | review_status/confidence | high stale rerun risk | high | DO_NOT_USE_FOR_ACTIVE_LEDGER |
| schedule rows / windows_schedule | schedule entries | no visual bbox | table/schedule context | schedule page not row-anchored | inside takeoff_json | weak labels | no direct map | yes | source/confidence indirectly | medium | medium | USE_WITH_MATCHING |
| visual correction rows | job_id/takeoff_run_id/opening_id/marker_label/marker_snapshot | marker snapshot has normalized x/y only | normalized visual audit coordinates | inherited from visual marker | jobId plus nullable runId | marker_label/opening_id | no | snapshot dimensions | correction_type/reason | high if globalized | high | AUTHORITY_RISK |
| visual correction hints / memory | prior correction examples by marker/type | marker snapshot x/y | normalized | historical | cross-run/job risk if overused | marker label | no | yes | correction type/reason | very high | very high | DO_NOT_USE_FOR_ACTIVE_LEDGER |
| AI check outputs | review status/flags | no bbox | none | none | takeoff_json run | no | no | no | status/flags | medium | high if promoted | DO_NOT_USE_FOR_ACTIVE_LEDGER |

## 4. Proposed Visual Anchor Model

Use a row-attached visual anchor model with explicit coordinate contract and provenance.

```ts
type ExtractedQuantityVisualAnchor = {
  id: string;
  extractedQuantityId: string;
  jobId: string;
  runId: string;

  source:
    | "ledger_evidence"
    | "vector_geometry"
    | "visual_detection"
    | "pdf_text"
    | "schedule"
    | "human_correction"
    | "derived"
    | "legacy_visual_evidence";

  page: number;
  bbox: [number, number, number, number];

  coordinateSpace:
    | "pdf_points_user"
    | "adapter_page"
    | "render_pixels"
    | "normalized"
    | "unknown";

  confidence: number;
  warnings: Array<
    | "coordinate_space_unknown"
    | "legacy_evidence_only"
    | "stale_run"
    | "match_weak"
    | "dimension_conflict"
    | "anchor_conflict"
    | "bbox_approximate"
  >;

  evidenceText?: string;
  evidenceSourceId?: string;
  legacySourceId?: string;
  createdAt: string;
};
```

Notes:

- `id` should be anchor-specific, not the same as `extractedQuantityId`.
- `extractedQuantityId`, `jobId`, and `runId` are mandatory.
- `coordinateSpace` is mandatory. Unknown coordinate space makes the anchor non-drawable.
- `legacy_visual_evidence` may exist as evidence, but is not drawable as an active ledger marker unless
  it is matched into a current-run ledger row under strict rules.
- A future correction workflow can reference `visualAnchorId` without editing the original row.

## 5. Storage Options

### Option A - Store anchors inside `extracted_quantity_rows.evidence_json`

Pros:

- Already persisted and exported with rows.
- Active-run safety comes for free when row selection is correct.
- Low migration complexity.
- Good short-term fit for evidence that is naturally part of row extraction.

Cons:

- No independent anchor id unless added inside each evidence entry.
- Harder to version or supersede individual anchors.
- Harder for corrections to reference one anchor cleanly.
- Querying "rows with drawable anchors" requires JSON scanning or read-model derivation.

### Option B - Add separate `extracted_quantity_visual_anchors` table

Pros:

- Strong row/run scoping.
- Clear anchor ids for overlay and future corrections.
- Can preserve original row snapshot and anchor history separately.
- Better debug and query surface.

Cons:

- Requires schema migration and persistence code.
- More moving parts before anchor quality is proven.
- Risk of another stale table if active run filtering is not enforced everywhere.

### Option C - Derive at runtime only

Pros:

- No schema changes.
- Lowest persistence risk.
- Useful for proving matching rules before committing storage.

Cons:

- Anchors are not auditable after the run.
- Future correction workflow cannot reliably reference them.
- Overlay may drift if runtime extraction changes.

### Option D - Hybrid: derive anchors from current-run evidence into read model first, persist later

Pros:

- Preserves Slice 2E safety: overlay reads active ledger/read model only.
- Uses existing `evidence_json` when it already has page/bbox.
- Allows a focused implementation without schema migration.
- Lets tests prove matching/staleness/status rules before creating a table.
- Leaves a clean path to Option B once anchor quality and UI needs are known.

Cons:

- Does not solve JM-0060 immediately because current rows have no bbox.
- Future correction workflow still needs a persisted anchor id or event reference.
- Requires discipline: no legacy visual markers may be drawn as active anchors during the interim.

## 6. Matching Rules

Anchor attachment must require:

- same `jobId`
- same `runId`
- current active run selected by the authority selector
- same or compatible category/type
- page compatibility, when page is known
- source confidence above source-specific threshold
- coordinate space known and convertible for overlay drawing
- dimensions compatible when both row and source carry dimensions
- stable evidence source id recorded when available

Allowed source paths:

- existing current-run ledger evidence with `page` + `bbox`
- current-run vector/PDF extraction results that can be traced to the ledger row source candidate
- current-run PDF text bbox/label locations as supporting evidence only
- current-run visual detections only after they match an existing current-run ledger row by type,
  dimensions, page, and evidence text

Forbidden:

- matching across different runIds
- using old `marker_label` as an active row id
- creating a clean extracted row from a visual marker alone
- using `opening_schedule` as active anchor authority
- using legacy `extracted_quantities` scalar rows
- using global correction memory as bbox evidence
- treating `door_hits` count or `visual_opening_audit.summary` as active overlay totals

## 7. Status and Promotion Rules

Bbox enrichment affects evidence and overlay coverage first.

It may add or remove warnings such as:

- `visual_marker_missing`
- `coordinate_space_unknown`
- `anchor_conflict`
- `bbox_approximate`

It must not automatically promote:

- `needs_review` -> `extracted`
- `missing_evidence` -> `extracted`
- `conflict` -> `extracted`
- null `heightMm` -> non-null height
- null `areaM2` -> non-null area

Promotion to `extracted` remains governed by extraction doctrine: dimensions, source compatibility,
conflict handling, and assumption quarantine must already be satisfied. A bbox only proves there is a
drawable location; it does not prove the quantity is clean.

## 8. Overlay Behaviour

Overlay should display these states:

- `drawable ledger marker`: active row has current-run anchor with known coordinate space and bbox.
- `no marker`: active row has no drawable anchor.
- `legacy evidence only`: legacy door/visual evidence exists but is not tied to active row authority.
- `anchor conflict`: multiple possible anchors or dimension/type mismatch.
- `anchor stale`: anchor runId does not match active runId.
- `bbox missing`: evidence exists, but no bbox.
- `coordinate transform unknown`: bbox exists but coordinate space is not drawable.

Current JM-0060 expected display remains:

- 67 ledger rows
- 0 drawable markers
- 67 no-marker rows
- legacy evidence only: 20 door_hits + 20 visual openings

After enrichment, rows may move from no-marker to drawable only when matched to current-run evidence.

## 9. Rerun and Staleness Rules

- Every anchor must carry `jobId` and `runId`.
- Active overlay must filter anchors to the same active run as the read model.
- If multiple runIds are present without an activeRunId, fail loudly.
- Anchors from superseded runs are history only.
- Legacy visual correction rows with nullable `takeoff_run_id` are never active anchors.
- If the plan page changes, anchor page and coordinate transform must be revalidated.
- If coordinate space is unknown, show the row as no-marker with a warning rather than guessing.

## 10. Future Tests Required

Implementation should include tests like:

```ts
it("attaches visual anchors only to rows from the same jobId and runId");
it("does not match legacy visual markers across runs");
it("does not promote needs_review rows to extracted solely because bbox exists");
it("keeps rows without anchors visible");
it("marks stale anchors as unavailable when runId changes");
it("does not use visual_opening_audit as active quantity authority");
it("does not use door_hits as active quantity authority");
it("preserves unknown dimensions as null");
it("preserves assumed-height quarantine");
it("overlay marker uses extractedQuantityId and visualAnchorId");
it("legacy visual evidence remains labelled evidence-only unless matched to current-run ledger row");
```

Additional tests:

- same-row evidence with page+bbox becomes a drawable anchor
- evidence with bbox but unknown coordinate space remains no-marker
- `opening_schedule` rows cannot produce active anchors
- visual correction memory cannot produce active anchors
- anchor conflicts do not change clean totals
- activeRunId filtering excludes anchors from older runs

## 11. Phased Implementation Plan

### Phase 2F-A

Complete this design only.

### Phase 2F-B

Implement a pure anchor read model derived from active `ExtractedQuantityReadModel` evidence only:

- no schema change
- no legacy matching
- `visualAnchorId` generated from `extractedQuantityId + evidence index`
- overlay consumes anchors through active ledger rows
- rows without anchors remain visible

This will not make JM-0060 visually rich yet, but it will harden the model contract.

### Phase 2F-C

Rerun representative jobs through the current ledger system and inspect evidence quality:

- JM-0060
- one pre-ledger job after rerun
- one raster/schedule-heavy job if available
- one job with `visual_opening_audit` markers
- one job with vector geometry evidence

O'Neil and 15a / 15 A should be included if/when the jobs are available.

### Phase 2F-D

Design or implement current-run matching from vector/PDF/visual evidence to existing ledger rows.
This remains evidence enrichment only, not status promotion.

### Phase 2F-E

If anchors prove useful and stable, add a separate `extracted_quantity_visual_anchors` table with:

- `id`
- `extracted_quantity_id`
- `job_id`
- `run_id`
- `source`
- `page`
- `bbox`
- `coordinate_space`
- `confidence`
- `warnings_json`
- `evidence_text`
- `legacy_source_id`
- `created_at`
- `superseded_at`

### Later Correction Design

A future ledger-backed correction workflow should reference:

- `extractedQuantityId`
- `visualAnchorId` when available
- original row snapshot
- correction event
- human reason
- active `runId`

It should be append-only. It should not destructively edit ledger rows.

## 12. Risks and Open Questions

Risks:

- Legacy visual markers could be accidentally redrawn as active markers.
- Normalized visual coordinates could be mistaken for PDF-space bbox.
- Door hits are point evidence for internal doors, not row-level bbox for each aggregate door row.
- A separate anchor table could become another stale store if active run filtering is missed.
- Bbox presence could be mistaken for quantity correctness.
- Rerun plan page changes can invalidate anchors.

Open questions:

- Should aggregate rows like `interior-door-standard` receive multiple anchors or remain count-only?
- Should anchors represent row centers, rectangular bboxes, or both?
- Should `ExtractedQuantityEvidence` gain `coordinateSpace` and `anchorId` before a table exists?
- Which source should own page identity for non-floor-plan evidence such as schedules and elevations?
- What is the minimum confidence threshold for current-run visual detections to become matched anchors?

## 13. Recommendation

RECOMMENDATION D:
Implement a hybrid: derive anchors from current-run evidence into the read model first, persist later.

Reason:

- It preserves the active ledger as authority.
- It uses the existing row-scoped evidence field where safe.
- It avoids creating a new stale table before anchor quality is proven.
- It gives overlay a strict `extractedQuantityId + visualAnchorId` contract.
- It keeps visual evidence from creating clean quantities.

The immediate implementation slice should be a pure read-model/overlay model hardening pass that
turns existing current-run row evidence with explicit page+bbox into visual anchors. It should not
match legacy `visual_opening_audit`, `door_hits`, `opening_schedule`, or correction memory yet.

Before richer bbox recovery or matching is implemented, rerun at least one additional representative
job through the current ledger system so the design is not validated only against JM-0060.
