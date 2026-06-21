# Jennian IQ access and golden jobs operating checklist

Last reviewed: 21 Jun 2026

## Purpose

Jennian IQ should be verified against real QS truth, not screenshots, chat memory, or one-off exports. This checklist records the access, source files, and golden-job evidence needed for Codex, Haydon, Claude, and the Haydon Council to audit the product repeatably.

## Ground rules

- Do not store secrets, auth links, service keys, or customer-private raw documents in Git or Linear comments.
- Raw plans, QS workbooks, and client documents should live in the controlled Jennian SharePoint/OneDrive structure or another approved private storage location.
- The repo may store fixtures, metadata, reduced truth JSON, and test-safe artifacts when they are intentionally allowed.
- Missing evidence stays explicit. A missing login, DB role, workbook, or job pack is not "probably fine".
- Every golden job must have a human-signed truth source before it is used to claim accuracy.

## Current access state

| Item | Current state | Action |
| --- | --- | --- |
| Linear | Available. JEN issues can be read and updated from Codex. | Keep product doctrine, access work, and trial gates in Linear rather than chat only. |
| GitHub/repo | Available. Codex can commit, push, and verify local gates. | Keep using strict slices with STATE.md entries. |
| Production deploy path | Available. `main` deploys to Cloudflare Pages project `jennian-iq-prod`; live `/version.json` and geometry health can be probed. | Continue verifying live version and geometry after every deploy. |
| Jennian IQ test login | Confirmed via the existing internal operator account `test@jennian-iq.internal`. Codex authenticated to production and verified Jobs, Upload New Plan, user menu, and recent JM-0052 through JM-0056 runs were visible. | Keep credentials outside Git/Linear/chat. Do not reset this account casually because reset scripts can change role/permission state. |
| Supabase read access | No stable read-only analyst credential recorded here. Some admin/service paths exist in workflows/functions, but should not be used as normal audit access. | Provision read-only SQL/API access for schema/live-job audits, separate from service-role credentials. |
| Canonical QS master workbook | Candidate local files exist. Newest observed: `Jennian IQ MASTER.xlsm` in `QUANTITY SURVEYING/JENNIAN MASTER SPREADSHEET`. | Haydon must confirm the single canonical master and where frozen copies should live. |
| Golden job source folder | Partial repo fixtures exist under `tests/fixtures` for `15a`, `beddis`, `christian`, `fenner`, `harrison`, `oneil`, and `young`. SharePoint golden-source folder is locally synced at `C:\Users\Haydon\Jennian Homes Manawatu\Company - Documents\QUANTITY SURVEYING\Jennian IQ`. | Build signed truth metadata for the controlled SharePoint packs before treating them as accuracy gates. |
| SharePoint/OneDrive job access | Confirmed via local sync. The shared SharePoint URL resolves to `Shared Documents/QUANTITY SURVEYING/Jennian IQ`, but direct unauthenticated/tool web access returns Microsoft forms-auth `403`; use the local synced path instead. | Keep using the local synced path for read-only audits; avoid broad browser/account access unless a file is not synced. |
| Haydon Council outputs | Secondary backup folder created at `C:\Users\Haydon\Jennian Homes Manawatu\Company - Documents\QUANTITY SURVEYING\Jennian IQ\_Project Notes`. | Save Council reports to Linear documents and/or the SharePoint `_Project Notes` folder so they can be read as evidence. |

## Access requests

### 1. Dedicated Jennian IQ test login

Status: provisioned via the existing internal operator account `test@jennian-iq.internal`.

Needed to let Codex run the whole product path without using Haydon's live session.

Minimum setup:

- Email: a dedicated test account, not a staff personal account.
- Role: estimator or admin depending on the slice being tested.
- Status: active with password set.
- Permissions: can upload a plan, run takeoff, open verification, download/export workbook, and view review tables.
- Safety: clearly named as a test account, safe to delete/reinvite, no owner role unless a specific owner-only test needs it.

Record:

- The account email in Linear or this doc. Current account: `test@jennian-iq.internal`.
- Never record the password in Git, STATE.md, or Linear.
- Do not ask Haydon to re-invite Codex unless this account is disabled, deleted, or login actually fails.

### 2. Read-only Supabase access

Needed to answer live questions such as "what did IQ persist for this job?" and "does production schema match types?" without relying on service-role paths.

Minimum setup:

- A read-only Postgres role or Supabase dashboard/API access scoped to read schema and selected rows.
- No DDL permission.
- No service-role JWT as normal operator access.
- Access to inspect RLS policies, functions, migration table state, and job/takeoff/export rows.

Use cases:

- Verify live schema/type drift.
- Inspect a failed job payload and persisted `takeoff_json`.
- Confirm review table rows versus export data.
- Confirm RLS policy effects without changing data.

### 3. Canonical QS master workbook

Needed because the IQ export is only correct if it aligns with the real workbook.

Current candidate files observed locally:

- `C:\Users\Haydon\Jennian Homes Manawatu\Company - Documents\QUANTITY SURVEYING\JENNIAN MASTER SPREADSHEET\Jennian IQ MASTER.xlsm`
- `C:\Users\Haydon\Jennian Homes Manawatu\Company - Documents\QUANTITY SURVEYING\JENNIAN MASTER SPREADSHEET\Jennian_QS_Master_MASTER_BASE_PLUS_STAGE_LOADS_2026-06-17.xlsm`
- `C:\Users\Haydon\Jennian Homes Manawatu\Company - Documents\QUANTITY SURVEYING\JENNIAN MASTER SPREADSHEET\Jennian_QS_Master_IQ_WIRED.xlsm`

Decision needed:

- Which file is the current canonical master?
- Which tab/cell contract is sacred for IQ import?
- Where are frozen historic masters stored when the master changes?
- Who signs off changes to tab 5 openings, cladding deduction, garage doors, internal doors, and stage loads?

### 4. Golden jobs pack

Needed to stop chasing one plan at a time. A golden job proves whether the engine is broadly improving.

Recommended private storage structure:

```text
Jennian IQ/
  25040 Christian, Blair - Lot 33 Awa Park, Feilding/
  26001 Beddis, Tony and Sandra, Lot 50 Tamakuku - 20 Tukere Cres/
  29A West St/
  Fenner, Natalie & Marcus - Section TBC/
  Jennian IQ MASTER.xlsm
```

Target structure inside each job pack:

```text
Job Name/
  source/
    floorplan.pdf
    elevations.pdf
    specifications.xlsm
    signed_qs_workbook.xlsm
  iq-runs/
    latest-verification.pdf
    latest-export.xlsx
    latest-version.json
  truth/
    ground-truth.json
    signoff.md
```

The current synced SharePoint folder already contains the first controlled job folders; it does not need to mirror the target structure exactly before use, but each job still needs signed truth metadata.

Example target contents for a normalized pack:

```text
Christian/
    source/
      floorplan.pdf
      elevations.pdf
      specifications.xlsm
      signed_qs_workbook.xlsm
    iq-runs/
      latest-verification.pdf
      latest-export.xlsx
      latest-version.json
    truth/
      ground-truth.json
      signoff.md
  Fenner/
    ...
```

Minimum truth per job:

- Floor area.
- Perimeter / external wall length where used.
- Total opening area including garage door.
- QS/glazed opening area excluding garage door.
- Garage door size/count.
- Internal door counts by QS bucket.
- Garage area, alfresco area, first-floor area, and N/A semantics.
- Notes for drafting errors, missing elevations, or deliberate manual overrides.

Repo fixture rule:

- Commit reduced `ground-truth.json` and deterministic fixture metadata only when approved.
- Keep raw private plans/workbooks in controlled storage unless explicitly cleared for repo fixture use.

### 5. Cloudflare and GitHub visibility

Needed for deploy confidence.

Already useful:

- Live `/version.json` probes.
- Live `/api/geometry/health` probes.
- GitHub connector for status where available.

Still useful:

- Dashboard links for the exact production Pages project.
- Known owner account for DNS/domain changes.
- A short "where to look first" note when deploy fails: GitHub Actions run, Cloudflare Pages deploy, or live domain probe.

### 6. Linear as the product spine

Needed so doctrine and decisions survive long sessions.

Use Linear for:

- Product doctrine and trial gates.
- Access blockers.
- Golden job readiness.
- Security/future-hardening tasks.
- Slice status and acceptance criteria.

Do not use Linear for:

- Passwords.
- Secret values.
- Raw client-private attachments unless the workspace policy explicitly allows it.

### 7. SharePoint/OneDrive source access

Needed so IQ can be audited against what a human QS actually had.

For each live/golden job, record:

- Job folder path.
- Which plan revision IQ used.
- Which elevations/specs were available.
- Which QS workbook is the signed human truth.
- Any known drafting errors.

### 8. Haydon Council output location

Needed so Council review becomes evidence, not another pasted chat artifact.

Preferred options:

- Linear document per Council review.
- SharePoint `_Project Notes/council-reviews/` for secondary backup beside the golden job source files.
- Repo `docs/council-reviews/` only for sanitized summaries that should travel with code.
- Private SharePoint folder for raw Council reports where client data appears.

Each Council report should say:

- Scope.
- Evidence inspected.
- Findings by severity.
- Red Team result.
- What is verified, broken, or unproven.
- Whether Codex may act or must report only.

## Immediate next actions

1. Haydon confirms the canonical QS master workbook.
2. Haydon creates or approves a dedicated Jennian IQ test login.
3. Haydon/IT provisions read-only Supabase access or confirms an acceptable read-only alternative.
4. Create the first Golden Jobs pack from Christian and Fenner because they are already central to the current accuracy work.
5. Attach this checklist to Linear, then link it to JEN-27, JEN-29, and JEN-38.

## Secondary notes backup

Haydon approved using the synced SharePoint folder as a secondary project-notes backup. Created:

```text
C:\Users\Haydon\Jennian Homes Manawatu\Company - Documents\QUANTITY SURVEYING\Jennian IQ\_Project Notes\
  README.md
  council-reviews\
  golden-job-index\
  trial-readiness\
  decisions\
```

Use this for sanitized Codex/Claude/Haydon Council notes, Golden Job indexes, trial-readiness summaries, and decisions. Do not store passwords, API keys, service-role keys, tokens, invite links, or unreviewed outputs that could be mistaken for signed truth.
