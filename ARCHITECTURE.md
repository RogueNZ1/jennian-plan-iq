# Jennian IQ — Architecture

_Last verified against the codebase 18 Jun 2026 (measurement doctrine re-check). Every claim here was
read from code, not memory. STATE.md is the session log; this is the map._

## What this system is

Jennian IQ turns a residential floor-plan PDF into a priced-ready QS workbook input with
**per-field provenance**: every number knows where it came from, how confident the system
is, and what flags hang off it. The estimator verifies on paper (the verification
printout), then pastes one block into the master QS spreadsheet ("IQ Import" tab). The
governing doctrine, enforced in code and tests: **an unfilled cell beats a wrong cell** —
the system never asserts what it cannot back.

## Measurement doctrine

Jennian IQ must model the way a human QS works. A drawing set is not one perfect
source; it is a set of imperfect witnesses: floor-plan geometry, floor-plan text,
elevations, schedules, specs, vision output, and workbook truth. One bad witness does
not make the job bad. The engine must isolate the bad evidence, keep measuring from
the good evidence, and show the local uncertainty.

The floor plan is the backbone. It carries the layout, wall runs, rooms, openings,
doors, garage/alfresco footprints, and internal partitions. Text is an accelerator
when clean, not the authority when it is jammed, malformed, duplicated, or impossible.
Elevations are powerful cross-checks and height/face-measure sources, but a wrong or
missing elevation must not poison the whole job. Schedules and specs are explicit
evidence, but still get sanity-checked against the drawing.

Local failure is the product rule. Bad text must not delete a drawn opening. A wrong
elevation must not stop the floor-plan takeoff. A missing schedule must not erase
measurable geometry. Unsupported dimensions stay flagged or blank; supported local
measurements continue.

Architecture follows that QS method. If the current pipeline cannot measure what a
human QS would measure, the correct fix is to extend or rebuild the measurement seam,
not to accept the current seam as a product limit. Existing code is useful only where
it serves the QS method.

## Topology

| Piece | Tech | Where |
|---|---|---|
| App | React 19 / TypeScript / Vite, TanStack Start (file routes in `src/routes/`) | Cloudflare Pages `jennian-iq-prod` → jennianiq.nz |
| Data/auth/storage | Supabase (Postgres + RLS, Auth, Storage bucket `job-files`) | project `ukegudqobnmiesudtjen` |
| Geometry engine | Python service (deterministic measurement + vector reads) | Railway, reached ONLY via same-origin proxy; `GEOMETRY_API_KEY` injected server-side (Pages secret), never in the browser |
| Vision | Gemini (plan reads) / Anthropic (scale-extraction fallback) | keys are Pages secrets, re-put every deploy |
| CI/CD | GitHub Actions | gates below |
| Market intel (007) | Python scrapers, twice-weekly brief via Resend | `jennian-007-scraper/`, `007-brief.yml` |

## The takeoff pipeline (the crown jewels)

Upload (PDF-only, MIME + extension validated) → page classification (working/floor-plan
page picked, `pdf-page-classify`) → then per run (`src/lib/takeoff/run.ts`):

1. **Vision pass** (`extract-*`): rooms, openings, spec items, elevations, site plan.
2. **Geometry pass** (`geometry-api.ts` → proxy → Railway): floor/garage/alfresco areas,
   wall lengths, bounding box, room footprints, plus `vector_annotations` (garage,
   schedule, openings, W-codes, entrance) when the page has a usable text layer.
   Failure contract (tested, 9 contract tests): every failure → `null`, every failure
   **logs its reason** (401/403 name the key fix — the demo-week lesson), pinned-page
   failure retries auto-detect exactly once, observably (`page_used` echo +
   reconciliation flag if it lands elsewhere).
3. **Door engine** (`src/lib/doors/`): deterministic interior-door detection from the PDF
   vector layer — NO AI in the detection path. Pinned to pdf.js **4.x**
   (`pdfjs-dist-door` npm alias) because the adapter's `constructPath` handling is
   4.x-specific ("touch this and every label corrupts"). Flags are NEVER counted
   (fail-safe). Emits page-space hits (pdf points, y-down) + `pageMeta` for the overlay.
   Bench: Alexandra, hand-counted ground truth, gates every push. **n=1 — grow it.**
4. **Compose seam** (`compose-takeoff.ts`): merges all sources into the
   **EnrichedTakeoff** — every field a `FieldValue<T>` carrying `value`, `source`
   (geometry | vector | vision | schedule | derived | asserted | flagged-unknown |
   manual), `confidence`, and `discrepancy_flags`. Vector↔vision cross-checks raise
   flags here. A geometry-less run gets `geometry_status: "unavailable"` — LOUD, never
   silent (the catch→null fallback once hid a dead service for two days).
5. **Persist** (`persist-takeoff.ts`): canonical payload →
   `takeoff_runs.takeoff_json`. Never throws; a failed persist is tracked with a
   reason, the job save proceeds.

### Consumers (all read the SAME composer — `buildQSExportData`)

- **QS export** (`iq-qs-export.ts`, ~1.8k lines): builds the IQ Import paste block and
  the .xlsx. Enriched payload is PRIMARY source (5-run scan picks the most recent run
  that actually carries a payload); relational rows are the permanent fallback. Fixed
  positional contract: SPEC block rows **B101–B116 frozen forever** (append-only;
  `tests/specs/spec-contract.golden.json` fails CI on drift). No-silent-drop: every
  window placed or ⚑ UNPLACED; zero windows → DO-NOT-PRICE gate. All date stamps NZT.
- **Verification printout** (`/jobs/$jobId/verification`): the human twin — same
  composer, same run scan, so paper and sheet cannot diverge (an integrity guard prints
  DO-NOT-USE if they ever do; a live test asserts they don't on JM-0020). Section 4
  renders the floor plan with door hits drawn on (coordinate path: persisted
  adapter-space → `adapterToUser` → `viewport.convertToViewportPoint`, validated
  visually against hand-labelled ground truth — `scripts/overlay-validate.mts`
  regenerates the proof).
- Electrical schedule, SMW export, Carters loads (`iq-electrical-layout`,
  `iq-smw-export`, `iq-carters-loads`).

## Security model

- **RLS is the boundary; the client redirect is UX.** 21/21 tables RLS-enabled.
  Layered job-child pattern (`module_runs` is the canonical template): read = creator OR
  `is_admin_or_owner()` OR (viewer AND job approved/exported); write = `can_write()` AND
  (creator OR admin/owner); delete = admin/owner.
- **Server functions** (invites, delete-user) verify the caller's token server-side,
  require owner + allowlist (`invite-gate.ts`, default allowlist =
  haydon.christian@jennian.co.nz, env-overridable), and use the service role
  deliberately so RLS zero-row "successes" can't lie. DB trigger `protect_sole_owner`
  backstops.
- **Roles fail closed**: every capability flag is `!isLoading && has(role)`.
- **No DDL credential exists in CI** — by design. Policy/schema changes are migration
  files (the record) + a human paste in the Supabase SQL editor (the act).
- **Secrets**: never in tracked source or history (gitleaks-verified; the one historical
  hit is the anon key of a defunct project, commit-scoped allowlist in
  `.gitleaks.toml`). Runtime secrets are GitHub repo secrets, re-put to Pages on every
  deploy.

## CI/CD

- `convergence` = working branch; `main` = production. Promotion is a push of
  convergence→main **after green**.
- Manual production deploys must target Cloudflare account `haydon.christian@jennian.co.nz`
  and Pages project `jennian-iq-prod`; see `docs/deployment-runbook.md`.
- **Gates on every push/PR**: `tsc --noEmit` → `eslint` (errors fail; 7 grandfathered
  warnings don't) → `vitest run` (598 offline tests: export faithfulness, goldens,
  regression locks, benches) → `secret-scan` (gitleaks, FULL history).
- **On main**: `deploy-pages` — preflight fails if any required secret is absent
  ("we do not ship builds whose runtime config is known-broken"), builds, deploys,
  re-puts runtime secrets, gates on the geometry proxy + secret bindings, publishes
  outcome to `ops-results`. `live-validate` runs the real export pipeline against the
  real project (JM-0020 contract, Beddis ground truth, doors §5.5, verification-model
  same-composer lock).
- Actions SHA-pinned; Dependabot watches npm + actions weekly.
- Repo-wide format is eslint/prettier-enforced; the normalization commit lives in
  `.git-blame-ignore-revs`.

## Known debts & deliberate decisions

| Item | Status | Why it's like this |
|---|---|---|
| Dual pdf.js (v5 app + v4 door) | MEDIUM, scheduled spike | v4 pin is load-bearing for the adapter. NOT in initial page load — v5 per-route on demand, v4 only during a takeoff (~776 KB on-demand where ~406 KB would do). Exit: door engine server-side. |
| SheetJS CVEs (no fix upstream) | LOW, watched | xlsx is write-only; uploads are PDF-only. Escalates to CRITICAL if .xlsx uploads ever land. |
| `internal_wall_lm` suppressed in export | Deliberate | Live audit: 7 lm vs ~50+ real. Returns at P2 ribbon-trace. Printed "info — not exported". |
| Door bench n=1 | Open | Add hand-counted plans; each becomes a permanent gate file in `tests/doors/`. |
| Door-engine counts as live export source | Open | `doorsSource` precedence exists; engine wiring is a product call with HC. |

## Conventions

- New enriched fields are **additive + optional** (conditional spread) so goldens and
  pre-existing payloads round-trip byte-identical. `unwrapTakeoff` is the
  values-preserved proof.
- Deliberate lint exceptions get a **reasoned** per-line disable, never a rule change.
- Commit messages are narrative: what, why, and what almost went wrong.
- STATE.md gets a dated section per session: shipped / verdicts / carried opens.
