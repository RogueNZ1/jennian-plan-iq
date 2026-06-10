# Jennian IQ — session state & operating brief
_Last updated 11 Jun 2026 — specifications contract session._

## How a new chat operates (no credential pasting)
All secrets live ENCRYPTED in this repo's GitHub Actions secrets. A new Claude:
1. Clones this public repo (github.com reachable from sandbox; npm too — nothing else is).
2. Drives Supabase / Cloudflare / SharePoint **through CI workflows** that read those secrets automatically.
3. Reads workflow output from orphan branches **`live-results`** and **`ops-results`** (the Actions logs API is NOT readable with the current token; workflows publish their own results files).
Claude cannot hold live access between chats by design — the secrets are the persistence, not the chat.

## Secrets present (names only — values are in GitHub, never here)
`SUPABASE_SECRET_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `CLOUDFLARE_API_TOKEN`,
`CF_ID_CANDIDATE_A` (=83ec23a9…, the business CF account), `CF_EXTRA_64` (= GEOMETRY_API_KEY — RESOLVED 11 Jun: root cause of every text-route fallback was `wrangler.jsonc`'s `pages_build_output_dir` putting the project in wrangler-config-managed mode, where REST-API project env_vars are IGNORED on deploy; the key must be bound as a Pages SECRET via `wrangler pages secret put`, which deploy-pages.yml now does on every run. Proxy health verified 200 on the prod alias. NEVER null env_vars via REST PATCH — secrets live in the same store and get deleted with them),
`VALIDATOR_EMAIL` / `VALIDATOR_PASSWORD` (claude-validator@jennian-iq.test, estimator role),
`SP_SHARE_LINKS` (Haydon's shared SharePoint folder links).
Supabase project ref: `ukegudqobnmiesudtjen`.

## Production
- **REAL prod = Cloudflare Pages `jennian-iq-prod`** → https://jennian-iq-prod.pages.dev (auto-deploys from `main` via `deploy-pages.yml`, geometry worker included, under the business CF account).
- Parallel **Vercel** project also auto-deploys from `main`.
- OLD `jennian-iq.pages.dev` is a dead orphan under an inaccessible login — ignore.
- `main` = production branch for both. Working branch = `convergence`. Promote convergence→main only on green.
- CI: `test.yml` runs 496 tests/skips on every push. `live-validate.yml` runs against the real DB (Node 22 required) → publishes to `live-results`.

## DONE 10 Jun — IQ Import retarget (SHIPPED, live-validated 5/5)
The LIVE QS master is **`Jennian_QS_IQ_Updated_v4_1.xlsm`** (SharePoint QUANTITY SURVEYING → SS).
Its `5. Data Input House` rows 41–72 are now **IFERROR formulas pulling from an `IQ Import` tab** — NOT paste targets.
Mapping discovered (Data Input House ← IQ Import):
- Bed1 D41←IQ `B33`/`C33`/`D33`; Ensuite←34; Bed2←35; Bed3←36; Bed4←37; Bathroom←38; Kitchen←39; Family←40; Dining←41; Lounge←42; Garage Windows←43; **Garage Door 1←44**; **Entrance←45**.
- Toilet (51) and Dining-qty (59) and Lounge-qty (62) are hard-typed/blank in the live file (manual).
- Doors: **H187←IQ `B27`** (singles), **H193←B28** (cavity), **H192←B29** (doubles), **H190←B30** (barn). Garage **H176←** `IF('IQ Import'!B24="4.8x2.1",1,0)` — **defaults to 1 insulated door on IFERROR (~$2,983 silent)**, fix candidate.
- Garage H-block order confirmed: 175/177/179 Standard, 176/178/180 Insulated, **H181 = Travel line (never write)**.
**SHIPPED 359c860:** the paste sheet now writes the IQ Import tab exactly (fixed positional slots 33-45, B=Qty C=HEIGHT D=WIDTH — fixing the live transposition bug — meta cells, doors B27-30, B24 size string, MANUAL ENTRIES block from A47). Live-validated 5/5 against JM-0020 + Beddis. NEXT: re-run Beddis/Young/JM-0020 takeoffs in-app (stored extractions stale; also first live proof of rooms + door-engine persistence), then Phase 3 gate.

## SPECIFICATIONS picker + contract — v2 SHIPPED 11 Jun (Haydon builds QS against it)
- Meeting-spec picker on the job page (`SpecificationsPanel`): **16 coded specs across
  10 areas**, finalised live with Haydon. Persists to `jobs.specifications` jsonb.
- **SCOPE DOCTRINE:** only what is DECIDED IN THE MEETING and cannot be read off a plan.
  Anything the IQ engine extracts (foundations, roof/gables, stud height, ceiling form,
  skylights) is deliberately NOT a spec — drawings encode it. Bathroom/ensuite vanity,
  taps, mirror, front door, posts, glazing, all rural sub-detail etc. were cut.
- **THE CONTRACT (v2, frozen):** header row 100, specs rows **101–116**. A=spec id,
  **B=numeric code** (QS reads `'IQ Import'!B{row}`), C=label, D=area. blank=unanswered
  (never invented), 0=N/A, 1+=selection. Coding: selectors 1=base ascending by value;
  **upgrade toggles 1=No(standard) 2=Yes** → uniform `=IF(B{row}=2,cost,0)`; heating
  fixed by brief **1=Fully Ducted 2=High Wall 3=Gas 4=Log**.
  Rows: services 101, kitchen_pc 102 (10/15/20/25/30K), laundry_pc 103 (2K/4K/Robinhood),
  cooktop 104, oven 105, dishwasher 106, hot_water 107, **heating 108**, shower 109
  (acrylic/tiled wet-floor), bath 110 (tiled-in cradle/freestanding), interior_door_type
  111, ceiling_hatch 112, insulation_acoustic 113, insulation_underslab 114,
  insulation_hot_edge 115, garage_carpet 116.
- Append-only forever: `tests/specs/spec-contract.golden.json` freezes id→row→codes;
  regen golden+doc in one motion (`UPDATE_SPEC_CONTRACT=1`). Handover: `docs/SPEC_CONTRACT.md`.
- v1 (78 specs) was shipped earlier same day then cut to v2 with Haydon before ANY QS
  wiring existed — so the one-time renumber was free. v2 is the contract to build from.
- MANUAL ENTRIES block capped at 25 lines so floating blocks can't reach the spec rows
  (collision-guarded, guard row 95).
- **MIGRATION STILL PENDING (Haydon, one line in Supabase SQL editor):**
  `alter table jobs add column if not exists specifications jsonb;`
  Until then panel shows a provisioning notice (graceful), export emits blank spec block,
  live discovery probe reports column status each run.
- **NOTE — H176 still live:** garage door was CUT from the picker, so the silent insulated
  default (~$2,983 on IFERROR) is now wholly the QS workbook's to fix. Shower acrylic-vs-tiled
  IS in v2 (row 109).

## Cladding engine — V1 SHIPPED (deterministic core + sheet surface)
- `src/lib/cladding/cladding-engine.ts`: pure computeCladding() — wall rect (measured
  perimeter × extracted stud) + gable triangles (count × ½·span·rise from pitch) −
  every opening area. Fail-safe doctrine: missing input ⇒ FLAG + excluded term, never
  a guess. Multiple cladding types ⇒ total provable, per-type split flagged manual
  (needs per-elevation banding = V2). Benched against HAND-CALCULATED synthetic truth.
- Surfaced as a CLADDING (ENGINE) block on the IQ Import paste sheet below MANUAL
  ENTRIES: four terms + per-type + ⚑ flags, visible exactly where the estimator works.
- V1.1 NEXT: gable SPAN from the geometry room-polygon bounding box (currently null ⇒
  gabled houses carry a span flag). V2: per-elevation facades ⇒ per-type areas. THEN
  bench against a real plan with QS-known cladding m² (Haydon to nominate the plan).

## Door engine — status
- Vendored at `src/lib/doors/` (engine + pdf-adapter verbatim; runs via pinned `pdfjs-dist-door`@4.x — app's own pdf.js is 5.x). Fail-safe: any failure → null → export falls back. Flags NEVER count.
- **Benched GREEN**: Alexandra 17/17 (12 singles, 4 doubles, 1 cavity; entry+garage excluded as glazing). Fixture committed at `tests/doors/plans/alexandra.pdf`; gate runs in the main suite.
- **Bench is n=1** — needs 2 more hand-counted plans (ideally one with a barn door) before catalogue-wide trust. Each becomes a permanent bench file.
- Manual DoorCountPanel REMOVED per Haydon ("floorless"). Export precedence: historical confirmed counts (legacy jobs) > engine > item labels > schedule.
- **Open decision:** wardrobe/linen 1620 doubles → H192 (current default) or wardrobe spec line. Haydon's call.

## Hard rules (do not relearn the hard way)
- **Exterior doors are GLAZING — never in door-engine output.** Not excluded, just not its job.
- Fixed price = fixed price. Silent margin erosion (the H181 travel bug, the 2.4 re-bin, the H176 default-door) is the cardinal sin.
- Verify deploys/results from API records or published result files — never trust a shell exit code (tee masks failures; use `set -o pipefail`; `UID` is a readonly bash builtin → use `USER_ID`).
- Validate → ship to convergence (auto-CI) → read live-results/ops-results → promote main only on green.

## Security debt Haydon owes himself
Rotate `SUPABASE_SECRET_KEY` and revoke the old GitHub PAT (both were pasted in chat). Cloudflare token + validator user optional. Repo is public — fixture is Jennian's own catalogue plan (fine); if ever uncomfortable, make repo private (one toggle).
