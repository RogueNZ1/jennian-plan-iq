# Ledger-Backed Correction Workflow Design

## 1. Context

The Extracted Quantity Ledger is now the active quantity authority for migrated
surfaces. Export, Verification, Review, and Overlay can read the same active
run-scoped ledger authority. Slice 2F-D.2 proved that a fresh deployed run can
persist page and bbox evidence into `extracted_quantity_rows`, derive runtime
overlay anchors from that persisted evidence, and keep legacy visual sources
quarantined.

Corrections are the next risky boundary. A human must be able to correct or
approve extracted quantity rows without creating a second authority beside the
ledger. The existing system already has several write paths named "override",
"confirm", "correction", "approval", and "export", but most of them predate the
ledger. This design keeps those compatibility paths separated from active
ledger corrections.

Doctrine:

- `extracted_quantity_rows` remains the source extraction record for a run.
- Human correction is appended as a separate event.
- Effective corrected state is derived by one shared read model.
- Export, Verification, Review, and Overlay must read the same effective model.
- Corrections are run-scoped, row-scoped, auditable, reversible, and
  non-destructive.

## 2. Existing Write-Path Audit

Classification labels:

- `SAFE_TO_REUSE`: can be reused directly in the new workflow.
- `COMPAT_ONLY`: keep for compatibility/reference, not active corrections.
- `LEGACY_AUTHORITY_RISK`: can produce old authority or stale quantities.
- `PROMPT_CONTAMINATION_RISK`: can influence AI/prompt memory and must stay
  isolated from active quantity corrections.
- `EXPORT_WORKFLOW_ONLY`: export/status telemetry only.
- `DO_NOT_USE`: do not reuse for active ledger corrections.

| Path / function / table | What it writes | Scope and audit shape | Export / prompt / rerun risk | Classification | Design decision |
|---|---|---|---|---|---|
| Review legacy Base Geometry override, `src/routes/review.tsx`, old `quantity_overrides` intent | Currently blocked in Review with a toast. Historical target is `quantity_overrides` against legacy `extracted_quantities`. | Job-scoped through legacy quantity. Not run-scoped. Row-scoped to legacy quantity id, not `extracted_quantity_rows.id`. Stores original value, new value, reason, editor, timestamp. | Could affect old review/export assumptions if re-enabled. Stale after rerun because no active ledger run id. | `LEGACY_AUTHORITY_RISK` | Keep quarantined. Do not reuse for active ledger corrections. |
| `quantity_overrides`, `src/lib/jennian-data.ts`, migration `20260509232820...` | Inserts legacy override rows with `quantity_id`, `original_value`, `new_value`, `edited_by`, `reason`, `timestamp`. | Not job/run scoped directly. It depends on legacy `extracted_quantities.quantity_id`. Stores original, corrected, reason, editor. No evidence refs. | Rerun stale risk. Old authority shape. No link to active ledger row or visual anchor. | `DO_NOT_USE` | Do not reuse. It is useful only as migration history/reference. |
| Legacy `extracted_quantities`, `persistQuantity`, `upsertPrintedQuantity`, `loadPrintedQuantities` | Inserts/updates legacy quantities and printed reference values. May preserve or compare `approved_value`. | Job-scoped. Not run-scoped. Row-scoped to legacy id. Some rows store evidence/page/source/confidence, but not ledger evidence refs. | Can affect legacy exports and validation views. Stale after rerun. | `LEGACY_AUTHORITY_RISK` | Keep as compatibility/reference only. Do not write ledger corrections here. |
| Review `OpeningScheduleTab` add/update/delete/confirm/push | In Review it is blocked by `legacyContainment`. If enabled, it writes `opening_schedule`, deletes rows, confirms rows, and can push values into `module_items`. | Job-scoped. Not active-run scoped. Row-scoped to opening id. Stores dimensions/source/status/notes, but no original/corrected event pair. | Can affect modules/export if pushed. Confirmed rows can survive reruns. | `LEGACY_AUTHORITY_RISK` | Keep Review containment. Do not reuse as active ledger corrections. |
| `persistOpeningScheduleProjectionForRun`, `vision.functions`, `extract-openings` | Writes projected or vision-derived openings to `opening_schedule`; projection deletes non-confirmed IQ rows and preserves confirmed rows. | Job-scoped and sometimes file/page scoped. The table has no active ledger run authority. Row-scoped to opening id, not ledger id. | Preserved confirmed rows are a stale-rerun risk. Legacy evidence only. | `COMPAT_ONLY` | Keep as compatibility evidence, not active correction storage. |
| `pushMeasurementToModule`, `manualOverrideApprovedValue`, `module_items` | Inserts/updates `module_items`, including approved values, manual override source, evidence reason, high confidence, and confirmed status. | Job-scoped and module-run scoped. Row-scoped to module item id, not ledger row id. Stores previous/new values in `module_audit_logs`. | Can affect module/QS exports and pricing workflows. Different authority domain. | `LEGACY_AUTHORITY_RISK` | Do not reuse for ledger corrections. It can consume future effective ledger values, but must not author them. |
| Review `ConceptAssumptionsTab` / module assumed confirmations | Review route passes legacy containment and blocks save/edit. Historical path would update `module_items` assumptions. | Module-run scoped, not ledger-row scoped. Can store approved values and audit logs. | Can affect module exports if re-enabled. Stale after rerun. | `COMPAT_ONLY` | Keep disabled in Review. Future ledger corrections must not become module assumption confirmations. |
| `visual_opening_corrections`, `saveVisualOpeningCorrection` | Inserts visual correction rows with job id, optional takeoff run id, opening id, marker label, correction type, reason, marker snapshot, and created_by. | Job-scoped; optionally run-scoped; marker-scoped, not ledger-row scoped. Stores reason and marker snapshot, but no ledger before/after state. | Feeds human correction prompt memory. Marker labels can drift after rerun. | `PROMPT_CONTAMINATION_RISK` | Do not reuse for active ledger corrections. Keep as visual prompt-memory lineage only. |
| `visual-opening-correction-hints.ts` | Reads `visual_opening_corrections` and formats job/global prompt memory. | Job hints and global pattern summaries. Not ledger-row scoped. | Direct AI prompt influence. Risk of cross-job priming if mixed with quantity corrections. | `PROMPT_CONTAMINATION_RISK` | Ledger corrections must not feed this path in V1. |
| Verification overlay correction buttons | Buttons are disabled and labelled legacy/quarantined in ledger overlay mode. | No active write when disabled. Historical shape would save marker corrections. | If re-enabled, would write prompt-memory corrections, not ledger corrections. | `DO_NOT_USE` | Keep disabled. Overlay can select/show correction state, not author active corrections in V1. |
| Review actions/buttons for Extracted Quantities | Current Extracted Quantities tab is read-only and built from active authority/read model. | Job and active-run scoped through `loadExtractedQuantityAuthorityForJob`. Row-scoped display by ledger id. | No write risk today. | `SAFE_TO_REUSE` | Reuse as the primary future correction surface, but add only append-only ledger correction actions. |
| Review job approval, `approve()` | Updates `jobs.status = approved` after module rollup checks. | Job-scoped workflow status. Not row/run scoped. No original/corrected ledger values. | Can change workflow state, but not ledger values. | `EXPORT_WORKFLOW_ONLY` | Keep separate from ledger correction/acceptance. "Job approved" is not "row corrected". |
| Review export, `logExport()`, `export_logs`, `jobs.status = exported` | Inserts export log and may update job status to exported. | Job-scoped; optional module id/name in later migrations. Not row/run scoped. | Export telemetry/status only. No prompt impact. | `EXPORT_WORKFLOW_ONLY` | Keep. Future exports can record that effective corrected model was used, but this is not correction storage. |
| Printed reference values, `ValidationTab` and `upsertPrintedQuantity` | In Review containment it is blocked. If enabled, it upserts legacy `extracted_quantities` rows for plan/spec text values. | Job-scoped. Not run-scoped. Row-scoped to legacy quantity type/source. Stores value/source/evidence/page/confidence, but not correction event before/after. | Validation/reference only; stale after rerun. | `COMPAT_ONLY` | Keep as reference comparison. Do not treat printed reference upserts as active ledger corrections. |
| `extracted_quantity_rows` direct update policy | Table has active ledger rows keyed by `job_id`, `run_id`, `id`, with dimensions, status, warnings, source, evidence. RLS currently permits writers to update rows. | Correct authority key exists. Direct update would overwrite source extraction values and blur original/effective state. | Destructive audit risk. Could create hidden status/totals changes. | `DO_NOT_USE` | Do not implement correction workflow by direct mutation. Any future update should remain limited to persistence/supersede mechanics, not human corrections. |

Audit conclusion: there is no existing correction/write path safe to reuse as the
active ledger correction store. The existing active authority loader and Review
read surface are safe to reuse as consumers of a new effective corrected read
model.

## 3. Design Goals

- Append every human correction as an event.
- Scope each event to `jobId + runId + extractedQuantityId`.
- Keep original `extracted_quantity_rows` values auditable.
- Preserve evidence and visual anchor context when available.
- Require a human reason for every value/status-changing action.
- Make corrections reversible without deleting history.
- Derive one effective corrected model for all migrated surfaces.
- Keep clean totals based only on effective rows whose status is `extracted`.
- Keep unknown dimensions null unless an explicit correction supplies them.
- Distinguish row correction/acceptance from job approval/export status.

## 4. Non-Goals

- No direct mutation of `extracted_quantity_rows` for human corrections.
- No reuse of `quantity_overrides`, `opening_schedule`, `module_items`, or
  `visual_opening_corrections` as active ledger correction storage.
- No detector tuning, pricing gate changes, AI prompt updates, correction-memory
  integration, tolerance changes, or proof-gate changes.
- No automatic carry-forward of corrections to future runs.
- No split/merge/add-missing-row UI in the first implementation.
- No overlay-first editing in V1.

## 5. Proposed Correction Event Model

The event shape should be narrower than the broad sketch. V1 should avoid
actions that create new rows, split rows, merge rows, or globally relearn
extraction behavior.

Recommended TypeScript shape:

```ts
export type ExtractedQuantityCorrectionAction =
  | "set_dimension"
  | "set_count"
  | "set_status"
  | "ignore_row"
  | "keep_needs_review";

export type ExtractedQuantityCorrectionField =
  | "count"
  | "widthMm"
  | "heightMm"
  | "lengthMm"
  | "areaM2"
  | "status"
  | "reviewNote"
  | "ignoreReason";

export type ExtractedQuantityCorrection = {
  id: string;
  jobId: string;
  runId: string;
  extractedQuantityId: string;
  visualAnchorId?: string | null;

  action: ExtractedQuantityCorrectionAction;
  field?: ExtractedQuantityCorrectionField | null;

  before: unknown;
  after: unknown;
  originalRowSnapshot: unknown;
  evidenceRefs: ExtractedQuantityCorrectionEvidenceRef[];

  reason: string;
  createdBy: string;
  createdAt: string;

  supersedesCorrectionId?: string | null;
  revertedAt?: string | null;
  revertedBy?: string | null;
  revertReason?: string | null;
};

export type ExtractedQuantityCorrectionEvidenceRef = {
  kind:
    | "ledger_evidence"
    | "visual_anchor"
    | "manual_reference"
    | "review_note";
  page?: number | null;
  bbox?: number[] | null;
  text?: string | null;
  extractedQuantityId?: string | null;
  visualAnchorId?: string | null;
  note?: string | null;
};
```

Action rules:

- `set_dimension`: changes one dimension field. It does not automatically change
  status.
- `set_count`: changes `count`. It does not automatically change status.
- `set_status`: allows explicit status change, including `needs_review` to
  `extracted`, only with reason and before/after state.
- `ignore_row`: sets effective status to `ignored` and records why.
- `keep_needs_review`: records a reason/note without pretending the row is
  clean.

## 6. Storage Options Comparison

| Option | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| A | Add `extracted_quantity_corrections` event table. | Append-only; auditable; run-scoped; row-scoped; keeps extraction rows immutable; easy to replay; supports shared effective read model. | Requires migration, RLS, event application logic, and UI history. | Recommended. |
| B | Add mutable correction columns to `extracted_quantity_rows`. | Simple query for corrected values. | Destructive; hides original/effective difference; easy to silently change totals; stale/rerun confusion; harder audit/revert. | Reject. |
| C | Reuse `quantity_overrides`. | Existing table shape has original/new/reason fields. | Legacy quantity id, not ledger id; not run-scoped; no evidence refs; stale after rerun; old authority risk. | Reject for active corrections. Keep as compatibility only. |
| D | Reuse `visual_opening_corrections`. | Existing visual correction lineage and marker snapshot. | Marker-scoped, not ledger-row scoped; optional run id; feeds prompt memory; not a quantity before/after model. | Reject for active corrections. Keep quarantined. |
| E | Reuse `module_items` manual overrides. | Has reason/audit and module-run scope. | Different authority domain; can affect module/QS exports and pricing; not ledger-row scoped; mutates approved values. | Reject for active ledger corrections. |
| F | Store corrections only in export logs or job status. | No new table. | Export/job workflow status is not row correction state. No effective read model. | Reject. |

## 7. Recommended Storage Model

Create a new append-only table in a future implementation slice:

```sql
create table public.extracted_quantity_corrections (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  run_id uuid not null references public.takeoff_runs(id) on delete cascade,
  extracted_quantity_id text not null,
  visual_anchor_id text,

  action text not null,
  field text,
  before_json jsonb not null default '{}'::jsonb,
  after_json jsonb not null default '{}'::jsonb,
  original_row_snapshot jsonb not null,
  evidence_refs jsonb not null default '[]'::jsonb,

  reason text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),

  supersedes_correction_id uuid references public.extracted_quantity_corrections(id),
  reverted_at timestamptz,
  reverted_by uuid references auth.users(id),
  revert_reason text,

  constraint extracted_quantity_corrections_reason_not_blank
    check (length(trim(reason)) > 0),
  constraint extracted_quantity_corrections_row_fk
    foreign key (job_id, run_id, extracted_quantity_id)
    references public.extracted_quantity_rows(job_id, run_id, id)
);
```

Indexes:

- `(job_id, run_id, extracted_quantity_id, created_at)`.
- `(job_id, run_id, created_at)`.
- `(created_by, created_at)` for audit views.

RLS:

- Participants/viewers can read corrections for visible jobs.
- Writers can insert corrections for jobs they can write.
- Normal users cannot hard-delete corrections.
- Revert should be an update to `reverted_at`, `reverted_by`, and
  `revert_reason`, or a second append-only reversal event. The first
  implementation can use `reverted_at` if audit logs capture the revert update.

Why use the composite FK: it prevents events from targeting a row from a
different job or run. It also forces the correction event to remain attached to
the extracted authority row, not an old compatibility store.

## 8. Effective Corrected Read Model

All migrated surfaces should use one shared derivation:

```text
active extracted_quantity_rows
  + active non-reverted extracted_quantity_corrections
  -> effective extracted quantity rows
  -> ExtractedQuantityReadModel
  -> Export / Verification / Review / Overlay
```

Recommended functions:

```ts
loadExtractedQuantityAuthorityForJob(jobId)
loadActiveExtractedQuantityCorrections(jobId, activeRunId)
buildEffectiveExtractedQuantityRows(rows, corrections)
buildEffectiveExtractedQuantityReadModel(rows, corrections, { activeRunId })
```

No surface should independently apply corrections. The exported workbook,
Review tab, Verification model, and Overlay model must all receive the same
effective read model object or the same pre-derived effective rows.

Effective row additions:

```ts
type ExtractedQuantityCorrectionState =
  | "uncorrected"
  | "corrected"
  | "ignored_by_correction";

type EffectiveExtractedQuantityExportRow = ExtractedQuantityExportRow & {
  correctionState: ExtractedQuantityCorrectionState;
  correctedFields: string[];
  corrections: Array<{
    id: string;
    action: string;
    field?: string | null;
    reason: string;
    createdBy: string;
    createdAt: string;
    revertedAt?: string | null;
  }>;
  original: {
    count: number | null;
    widthMm: number | null;
    heightMm: number | null;
    lengthMm: number | null;
    areaM2: number | null;
    status: string;
  };
};
```

Status and totals rules:

- Clean totals use effective `status === "extracted"` only.
- `needs_review`, `missing_evidence`, and `conflict` remain visible and excluded
  from clean totals.
- `ignored` remains visible in the Ignored section and excluded from clean
  totals.
- A dimension correction does not promote a row to `extracted`.
- A status correction does not invent missing dimensions.
- A row can move from `needs_review` to `extracted` only through explicit
  `set_status` with reason.
- Unknown dimensions remain null unless an explicit correction event supplies
  the exact field.
- `assumed_height_rejected` rows remain `needs_review` with null height/area
  unless a human event explicitly supplies/accepts values.

Example:

```text
Original:
  status = needs_review
  heightMm = null
  areaM2 = null
  warnings = ["assumed_height_rejected"]

Correction 1:
  action = set_dimension
  field = heightMm
  before = null
  after = 2100
  reason = "Confirmed from door schedule"

Effective after correction 1:
  status = needs_review
  heightMm = 2100
  areaM2 = null
  correctionState = corrected

Correction 2:
  action = set_status
  field = status
  before = needs_review
  after = extracted
  reason = "Height and count confirmed from schedule and plan evidence"

Effective after correction 2:
  status = extracted
  heightMm = 2100
  areaM2 = null unless separately supplied or explicitly derived
```

## 9. V1 Correction Scope

V1 should be deliberately small:

1. Set a missing or wrong dimension:
   - `widthMm`
   - `heightMm`
   - `lengthMm`
   - `areaM2`
2. Set count.
3. Change status:
   - `needs_review` to `extracted`
   - `missing_evidence` to `extracted`
   - `conflict` to `extracted`
   - any active status to `needs_review` where a human rejects clean status
4. Ignore row:
   - false positive
   - duplicate
   - not required
5. Keep needs review with a reason/note.
6. Revert a correction.

Validation:

- Reason is required for every event.
- Numeric values must be finite and non-negative, with dimensions/count greater
  than zero unless the action is explicitly clearing a value back to null.
- Status changes to `extracted` must show the source evidence/correction reason.
- Corrections must target the active run id.
- A correction cannot target a row from another job or run.

## 10. Out-of-Scope Correction Actions

Not V1:

- `split_row`
- `merge_rows`
- `add_missing_row`
- broad category remapping
- label rewriting beyond a review note
- cross-job correction learning
- AI prompt-memory integration
- detector tuning
- pricing approval
- job approval
- opening schedule confirmation
- module item approval
- creating overlay markers without ledger evidence

Those actions may be designed later, but only after the V1 event model and
effective read model are proven stable.

## 11. UI Behaviour By Surface

Review:

- Primary correction surface.
- Shows active authority source, run id, status groups, known/unknown dimensions,
  warnings, evidence, page/bbox/text, visual anchor link when available, and
  correction history.
- Offers only V1 actions.
- Requires a reason before saving.
- Shows before/effective values side by side for corrected fields.
- Shows correction badges and revert controls where permitted.
- Keeps legacy tabs labelled and quarantined.

Overlay:

- Selection and context surface, not the primary editor in V1.
- Selecting a marker or no-marker ledger row shows row id, run id, evidence,
  warnings, correction state, and a link back to Review.
- Does not use `visual_opening_corrections` for active ledger corrections.
- Does not create active markers from legacy visual sources.

Verification:

- Read-only or mostly read-only in V1.
- Shows effective corrected values and badges.
- Shows original/effective differences where quantities are corrected.
- Uses the same effective read model as Review and Export.

Export:

- Exports effective corrected values in the Extracted Quantities worksheet.
- Adds audit columns in a future implementation:
  - `correctionState`
  - `correctedFields`
  - `correctedBy`
  - `correctedAt`
  - `correctionReason`
  - `originalCount`
  - `originalWidthMm`
  - `originalHeightMm`
  - `originalLengthMm`
  - `originalAreaM2`
  - `originalStatus`
- Existing QS/pricing sheets remain unchanged unless a later slice explicitly
  migrates them to consume the effective ledger authority.

## 12. Run/Rerun Rules

- A correction applies only to `jobId + runId + extractedQuantityId`.
- If a new takeoff run creates a new `runId`, old corrections do not apply.
- Surfaces may show "previous-run corrections exist" as context, but must not
  apply them automatically.
- Future carry-forward may be designed as suggestions only:
  - never effective by default
  - explicit user review required
  - no cross-job dimensions/positions
  - no prompt-memory side effect
- If multiple run ids are present without an active run id, effective model
  building must fail loudly, matching the current ledger read-model doctrine.

## 13. Prompt/Correction-Memory Rules

- `extracted_quantity_corrections` must not feed
  `visual-opening-correction-hints.ts`.
- Ledger corrections must not become AI prompt memory in V1.
- Human corrections are job/run/row facts, not global detector lessons.
- Any future learning layer must be separate from correction events and require
  explicit promotion to pattern-level guidance.
- Future pattern learning must never include specific cross-job dimensions,
  positions, page coordinates, or customer/job evidence.

## 14. Export/Reporting Rules

- Export rows show effective values and correction metadata.
- Original values remain visible/auditable.
- Clean totals use effective extracted rows only.
- Ignored rows are visible and excluded from clean totals.
- Needs-review rows remain visible and excluded from clean totals.
- Corrections do not silently change job approval/export status.
- Export logs may record that an effective corrected read model was exported,
  but `export_logs` is not correction storage.
- Existing QS/pricing workbook behaviour should remain unchanged unless a future
  slice explicitly changes the consumer to the effective model.

## 15. Test Plan

Future implementation should include tests that prove:

- appends a correction event without mutating `extracted_quantity_rows`;
- applies corrections only for matching `jobId`, `runId`, and
  `extractedQuantityId`;
- does not apply old-run corrections to a new run;
- fails loudly when multiple run ids are mixed without active run id;
- ignores reverted correction events;
- keeps original row values auditable;
- derives effective rows consistently for Export, Verification, Review, and
  Overlay;
- shows corrected values with correction metadata;
- keeps corrected rows visible as corrected;
- does not feed correction events into AI prompt memory;
- does not use `visual_opening_corrections` as active ledger corrections;
- does not allow correction to silently change job approval status;
- does not include ignored rows in clean totals;
- does not promote `needs_review` to `extracted` unless explicit status action
  allows it;
- preserves unknown dimensions unless corrected by event;
- keeps `assumed_height_rejected` rows `needs_review` with null height/area until
  explicit human correction;
- keeps Review legacy write buttons quarantined;
- keeps Overlay legacy correction buttons quarantined.

## 16. Migration/Implementation Phases

Recommended implementation order:

1. Slice 2G.1: add type definitions, schema/migration proposal, RLS, and pure
   event application tests. No UI write buttons.
2. Slice 2G.2: implement `buildEffectiveExtractedQuantityRows` and
   `buildEffectiveExtractedQuantityReadModel` with fixture tests.
3. Slice 2G.3: wire Export, Verification, Review, and Overlay to the effective
   read model in read-only mode, including correction badges from seeded events.
4. Slice 2G.4: add Review V1 append-only correction UI for dimension/count/status
   correction, ignore, keep-review note, and revert.
5. Slice 2G.5: add Overlay row selection/deep-link context to Review correction
   panel. Keep Overlay non-authoring unless a later decision changes that.
6. Later: design carry-forward suggestions, split/merge/add-missing-row actions,
   and any pattern learning as separate slices.

## 17. Risks/Open Questions

- `extracted_quantity_rows` currently has an update policy. Future correction UI
  must not use it for human corrections.
- If correction events reference a row that is later superseded inside the same
  run, the effective model needs a clear rule. Recommendation: corrections apply
  only to non-superseded active rows; superseded rows keep historical events for
  audit only.
- Area derivation needs product choice. Recommendation for V1: do not auto-derive
  area from a corrected dimension unless the UI records an explicit area event or
  a separately tested derivation rule.
- Revert mechanics can use `reverted_at` updates or append-only reversal events.
  Recommendation: start with `reverted_at` plus audit logging if simpler, but do
  not hard-delete correction rows.
- Carry-forward from old runs will be tempting. It should stay out of V1.
- Review permissions must align with existing job write permissions and avoid
  letting viewers create corrections.
- Export audit columns will make corrected rows visible, but old QS/pricing
  sheets may still show legacy values until separately migrated. That is
  acceptable only if labelled.

## 18. Recommendation

RECOMMENDATION A:

Implement an append-only `extracted_quantity_corrections` table and an effective
corrected read model.

Do not implement correction workflow by mutating `extracted_quantity_rows`. Do
not reuse `quantity_overrides`, `opening_schedule`, `module_items`, or
`visual_opening_corrections` as active correction storage. The first
implementation slice should be small and boring: schema/types plus a pure
effective read model with tests, no editable Review or Overlay controls yet.
