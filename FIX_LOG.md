# Jennian IQ — Fix Log

## Phase 1: Reproducibility (F-001) — PAUSED at prerequisite gate

**Date:** 2026-05-30
**Status:** Not started. No code changed. Paused by user decision after the
prerequisite check failed.

### Why paused

The brief's Section 0 prerequisite requires running a plan through the full
pipeline (Railway geometry → AI passes → reconcile → export) locally. That is not
possible in this environment. Per the brief ("If the pipeline cannot be run
locally end to end, STOP and report"), work was halted before any code change and
the user chose to **pause Phase 1 entirely** until a runnable environment exists.

### Blockers (evidence)

1. **`ANTHROPIC_API_KEY` absent** — not in `.env`, `.env.local`, or shell (only
   `.env.example` references it). Both AI passes call `getAnthropicApiKey()`
   (`recognise-plan.ts:81`, `extract-annotations.ts:104`), which throws when unset.
   On throw, each pass silently catches and returns a fallback / `EMPTY_ANNOTATIONS`
   (`recognise-plan.ts:88-91`, `extract-annotations.ts:111-114`) — i.e. a keyless
   run yields fake-but-plausible output, which would poison any golden fixture.
2. **Geometry API unreachable locally** — app fetches hardcoded same-origin
   `/api/geometry/measure` (`geometry-api.ts:9,67`), served only by the Cloudflare
   Worker (`dist/client/_worker.js:39`) which injects `env.GEOMETRY_API_KEY` and
   proxies to `https://jennian-iq-geometry-api-production.up.railway.app`. No env
   override for the base URL; no key locally. Geometry repo exists at
   `~/jennian-iq-geometry-api` but the app is not wired to a local instance.
3. **No JM-0003 source PDF** — the three `~/Downloads/JM-0003-*.xlsx` are outputs,
   not inputs. Only geometry fixtures are on disk (mcalevey/tgl11/dixon_bean/russell_st).

### Decisions captured for resume

- **Canonical fixture plan when work resumes:** `mcalevey.pdf` (on-disk geometry
  validation fixture with known-good values in `tests/validation/`).
- **Unblock path:** to be arranged — provide `ANTHROPIC_API_KEY` and a reachable
  geometry endpoint (deployed key, or run the geometry repo via uvicorn and point
  the app at it), OR hand over a pre-captured golden fixture from a deployed run.

### Pre-work confirmed (to speed resume — no changes made)

- Both in-scope AI passes route through **one** function: `callVisionModel` in
  `anthropic-client.ts:14-65`; request body (lines 27-47) has **no `temperature`**.
- A **duplicate** `callVisionModel` exists in `concept.functions.ts:22-74` (also no
  `temperature`), powering `extractScaleFactor` + `checkPlanIssues`; its scale
  output feeds geometry reconciliation. Task 1 must decide whether to set
  `temperature: 0` on one or both copies.
- `classifyAnnotations` (Pass 2) is deterministic — no API call.

### Next action on resume

Re-run the Section 0 prerequisite (confirm key + geometry reachable + canonical
PDF), then begin Task 1 (temperature) → Task 2 (retry/validation wrapper) →
Task 3 (golden fixture + cached-replay harness) → Task 4 (three live runs).

---

## Changelog

### 2026-05-30 — Prerequisite unblocking (env/harness plumbing only)

Scope: resolve the Section 0 prerequisite blockers. No Task 1–4 pipeline code
touched yet.

- **Geometry base URL is now dev-overridable.** `geometry-api.ts` previously
  hardcoded `GEOMETRY_API_BASE = "/api/geometry"` (same-origin Cloudflare proxy
  only), so a local `uvicorn` instance was unreachable. Added a dev-only
  `VITE_GEOMETRY_API_BASE` override that, when set, points the app at a local
  geometry instance (e.g. `http://localhost:8000`). **Defaults to the same-origin
  `/api/geometry` proxy when unset**, so production behaviour is unchanged. The
  override never targets the Railway prod endpoint or its `GEOMETRY_API_KEY`
  secret — it is purely local-dev harness plumbing.
- **`.env.local` scaffolded.** Added an empty `ANTHROPIC_API_KEY=` line (value
  must be pasted by the operator — it is a secret, not derivable) and
  `VITE_GEOMETRY_API_BASE=http://localhost:8000`. `.env.local` is gitignored.

### Native dependencies installed (geometry service)

The geometry service runs but `pipeline/render.py` shells out to **poppler**
(`pdfinfo`/`pdftoppm` via `pdf2image`) and the OCR path needs **Tesseract**
(`pytesseract`). Both were missing from PATH. Installed via winget:
- `oschwartz10612.Poppler` → `…\WinGet\Packages\oschwartz10612.Poppler_…\poppler-25.07.0\Library\bin`
- `UB-Mannheim.TesseractOCR` → `C:\Program Files\Tesseract-OCR`

The local service is launched with both dirs prepended to PATH:
`uvicorn main:app --host 127.0.0.1 --port 8000` from `~/jennian-iq-geometry-api`.
No `GEOMETRY_API_KEY` needed locally — `require_api_key` fails open when unset.
CORS already allows `localhost:3000`/`localhost:5173`.

### Prerequisite re-check — GATE PASSES ✅

| Blocker | Status |
|---|---|
| `ANTHROPIC_API_KEY` present + valid | ✅ in `.env.local`; authenticates (`/v1/models` → 200) |
| Geometry reachable + measures plan | ✅ `/health` → 200; **`/measure` on `mcalevey.pdf` → 200** |
| Canonical PDF on disk | ✅ `tests/e2e/fixtures/mcalevey.pdf` |

End-to-end `/measure` evidence (mcalevey.pdf): scale `1:100 @ A3`, floor area
`136.3 m²`, perimeter `54.8 lm`, external wall `55.98 lm`, internal wall
`7.57 lm` (medium). Note: `room_count=1`, `rooms[0].label=""` — confirms the
F-008 dead-label finding is live on this path (not a blocker for the gate).

**Section 0 prerequisite is satisfied. Ready to begin Task 1.**

---

## Phase 1 outcome — Tasks 1–4 (2026-05-30)

### Task 1 — determinism (temperature)
`temperature: 0` set on **both** `callVisionModel` copies (`anthropic-client.ts`,
`concept.functions.ts`) — copied, not merged (F-019). 402 split from 529.

### Task 2 — fail-loud + bounded retry
`recognise-plan.ts` and `extract-annotations.ts` now throw (no synthetic
`fallback` / `EMPTY_ANNOTATIONS`) on both the AI-call catch and the JSON-parse
branch. Bounded retry (3 attempts, 500→1000ms backoff, transient 429/529 only)
added to **both** `callVisionModel` copies. Unit tests assert both passes throw on
AI failure and on parse failure (`recognise-plan.test.ts`, `extract-annotations.test.ts`).

### Task 3 — golden fixture + cached-replay harness
`tests/phase1/`: `pipeline.ts` (helpers), `replay.test.ts` (offline, deterministic),
`live-runs.test.ts` (gated `PHASE1_LIVE=1`). Canonical plan = `mcalevey.pdf`
(JM-0003 source unavailable; substitution recorded in fixture + here). Replay test
re-runs the cached run-1 AI responses through the real parse+classify and asserts
the golden pipeline — **passes deterministically, no key/network**.

### Task 4 — three live runs → KEY FINDING (F-022)
Ran the full pipeline live, 6 runs total across two executions of `mcalevey.pdf`:

| Field | Run-to-run | Verdict |
|---|---|---|
| floor_area_m2 (136.3), perimeter (54.8), ext wall (55.98), internal wall (7.57) | identical (geometry) | ✅ stable |
| roof_area_m2 (156.75), garage_door_size ("6044"), scale, stud height | identical | ✅ stable |
| **window_count / internal_door_count** | **7 in one execution, 8 in another** | ❌ **±1 jitter** |

**`temperature: 0` is necessary but NOT sufficient.** It eliminated the gross
non-determinism the audit found (§4: windows 13 vs 7, internal wall 3.01 vs 15.56)
but the vision model still jitters ±1 on opening counts even at temp 0 (F-022).
Reproducibility is therefore delivered by the **cached-replay/golden fixture**, not
by re-calling the model.

**Decision — (a) replay/golden as source-of-truth.** The approved/golden run is the
QS source of truth; live re-runs are advisory. The cached-replay harness already
implements this, so no further wiring. Majority-vote (b) was explicitly declined.
The live `live-runs.test.ts` determinism guard will intermittently flag the ±1 — it
is gated behind `PHASE1_LIVE` so normal CI is unaffected.

**Backstop confirmed (why (a) is safe).** The concept review step
(`upload.tsx` `step === "takeoff"`, `TAKEOFF_ROWS` at :1466, rendered :1107)
surfaces **Windows / Internal doors / External doors** as explicit, inline-editable
rows (`TakeoffCell`); nulls show "Not found — enter manually". `exportToExcel` uses
`editedTakeoff ?? takeoffData` (:516), so a reviewer's correction to a ±1 count
flows into the QS export. Human approval is the real backstop for the residual jitter.

**F-022 accuracy implication → Phase 5 (not Phase 1).** The ±1 jitter means the AI
window/door counts are unreliable as a *sole* source. The proper fix is to
cross-check AI counts against the deterministic geometry/CV layer (reconciliation),
**logged as Phase 5 reconciliation work, tied to F-009** (concept results not
persisted / pipelines diverge — the same convergence work). Out of scope for
Phase 1.

### Phase 1 — CLOSED
Tasks 1–4 done; suite 222 passed / 1 skipped (gated live). Reproducibility delivered
via the golden/cached-replay fixture. New findings F-019/F-020/F-021/F-022 logged;
F-021→Phase 5, F-022→Phase 5 (reconciliation, tied to F-009). `run.ts` untouched.
Phase 2 is a separate run.

---

## F-023 — door/window classification leak + zero-width opening rows (DIAGNOSIS ONLY)

**Date:** 2026-06-08
**Status:** Read-only audit. **No code changed.** Generalised root cause + fix
direction below; no patch to any one job's values.

### Trigger
A job exported with the entrance door bleeding into the master's IQ Input window
grid (rows 41–72): one row counted with an asserted height and a **zero width**
(a counted-but-arealess phantom), plus an asserted-height opening sitting in a
window slot. The master throws a window mismatch on the export.

### Pipeline trace — where the door enters and why it isn't separated
On the no-schedule / vector-usable path the entrance enters the opening set at the
**compose stage**, via `foldSymbolOpenings` → `entranceFallbackOpening`
(`derive-fields.ts:242-263`, called from `compose-takeoff.ts:231-236`). It is
correctly typed `"entrance"` there. The separation failure is distributed, and the
type signal degrades at every earlier stage:

- **`extractAnnotations`** — the vision prompt asks for a window-vs-door boolean
  (`extract-annotations.ts:53`) but it is collapsed into the overloaded
  `nearOpening` field (`extract-annotations.ts:9-10,118`). "Is a window" and "is
  near an opening" become one bit; the door/window distinction is lost at read time.
- **`classifyAnnotations`** — gates only on `nearOpening` (`classify-annotations.ts:48-49`)
  and types every surviving opening `"window"` (`derive-fields.ts:122,144`). No
  door/window discriminator exists here.
- **compose/fold** — the only place the entrance is correctly typed `"entrance"`…
  which the exporter then writes straight back into the shared window grid.

### Zero-width row — origin and why it survives to export
`entranceFallbackOpening` sets `width_m = 0` (not null) when the entry width is
unresolved, with height asserted to the standard (`derive-fields.ts:246-247`).
Nothing downstream treats "unresolved/flagged" as a drop condition:
- `deriveOpenings` emits it with `area_m2: 0` (`derive-fields.ts:129`).
- `deriveOpeningTotals` sums the zero in (`derive-fields.ts:328`) — no zero-area filter.
- `buildDropInSheet` writes `qty` and height unconditionally and only guards the
  **width cell** (`if (s.width_m > 0) put(F…)`, `iq-qs-export.ts:1042-1043`) — it
  guards the value, not the row. Result: `D=qty, E=height, F=0` lands as a counted row.

A counted opening with zero width/area is a legal, un-dropped state through every layer.

### Reconciliation point (which mismatch)
**Count-vs-area**, not schedule-vs-callout (single-path job — no two sums to diverge)
and not a raw total-count check. The phantom row is **counted but contributes zero
area**, so `Σ qty` and `Σ qty×h×w` over rows 41–72 stop moving together. Aggravated by
an existing in-IQ type asymmetry: `deriveOpeningTotals.window_count` **excludes**
`entrance` (`derive-fields.ts:326-327`) while the exported grid **includes** the
entrance row — so IQ's reported `window_count` (N) and the grid's populated-row count
(N+1) already disagree before the master opens the file.

### Root cause — as a class
1. **No type segregation at the export boundary.** Door-class openings
   (`entrance`, `pa_door`, sectional) are correctly typed upstream but written into
   the same contiguous block the master reads as the window schedule. Opening type
   is computed, then ignored where it matters most.
2. **Zero-width / zero-area rows are a legal, un-dropped state.** The pipeline keeps
   unresolved-width openings as `width=0, area=0` "to avoid loss" but never enforces
   the reciprocal invariant that a *counted* row must have positive area. The
   exporter's width guard protects the cell, not the row.

### Generalised fix direction (no job-specific values)
- Carry opening **type** to the export boundary and route by type, not by row-range
  proximity: door-class types → door slots only; window grid accepts glazed
  window-class types only, so an entrance can never occupy a window row regardless
  of room-keyword match.
- Make IQ's reported `window_count` and the populated window-grid row count derive
  from the **same** type filter (today `derive-fields.ts:326` and the exporter loop differ).
- Define one invariant — *a row may be counted with positive area, or omitted; never
  counted with zero area* — and enforce it at the export gate: an opening whose
  resolved area is 0 is **dropped from the counted grid and surfaced as a review
  flag** (the flag already exists, `derive-fields.ts:249`), not written as a phantom row.

**Disposition:** ties into the F-009 / Phase-5 convergence work (single opening
source, reconciliation). No code touched in this entry.
