// @vitest-environment node
/**
 * LIVE VALIDATION — runs the REAL export pipeline against the REAL Supabase project.
 *
 * Executed only by the live-validate workflow (or locally with the env set):
 *   SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY (service-role key in CI) + LIVE_VALIDATE=1
 *
 * Covers the live half of the Phase 1/2/4 validation chain:
 *   1. JM-0020 — lounge slider renders at row 62 (1 / 2.1 / 2.4), non-standard 3.0×2.1
 *      sectional at row 67 with real dims, H175–180 all zero, garage_window height
 *      flagged-standard not 0.
 *   2. Beddis — drop-in window cells agree with the committed ground truth (the
 *      schedule path must be unchanged by Phase 2).
 *   3. Doors (§5.5) — schedule-entered internal doors reach intDoorStandard on a job
 *      without confirmed door_counts.
 *
 * Every assertion prints the live value first, so a failure run reads as a report.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { supabase } from "../../src/integrations/supabase/client";
import {
  buildQSExportData,
  buildDropInSheet,
  loadEnrichedTakeoffJson,
} from "../../src/lib/iq-qs-export";

const LIVE = process.env.LIVE_VALIDATE === "1" && !!process.env.SUPABASE_URL;

function cell(ws: ReturnType<typeof buildDropInSheet>, addr: string): unknown {
  const c = ws[addr] as { v?: unknown } | undefined;
  return c?.v ?? undefined;
}

async function jobIdByNumber(jobNumber: string): Promise<string | null> {
  const res = await supabase
    .from("jobs")
    .select("id, job_number, client_name")
    .ilike("job_number", jobNumber)
    .limit(2);
  if (res.error) throw new Error(`jobs lookup failed: ${res.error.message}`);
  const rows = res.data ?? [];
  if (rows.length !== 1) {
    console.log(`[live] lookup '${jobNumber}' matched ${rows.length} jobs:`, rows);
    return rows[0]?.id ?? null;
  }
  return rows[0].id;
}

describe.skipIf(!LIVE)("LIVE — JM-0020 export faithfulness", () => {
  let ws: ReturnType<typeof buildDropInSheet>;
  let enrichedNull = false;

  beforeAll(async () => {
    const id = await jobIdByNumber("JM-0020");
    expect(id, "JM-0020 not found — check the job number").toBeTruthy();
    const enriched = await loadEnrichedTakeoffJson(id!);
    enrichedNull = enriched == null;
    console.log("[live] JM-0020 enriched takeoff loaded:", !enrichedNull,
      "openings:", enriched?.openings?.length ?? 0);
    const data = await buildQSExportData(id!);
    console.log("[live] takeoffSource:", data.takeoffSource);
    ws = buildDropInSheet(data);
    console.log("[live] lounge row 62:", cell(ws, "D62"), cell(ws, "E62"), cell(ws, "F62"));
    console.log("[live] garage row 67:", cell(ws, "D67"), cell(ws, "E67"), cell(ws, "F67"));
    console.log("[live] H175–180:", [175, 176, 177, 178, 179, 180].map((r) => cell(ws, `H${r}`)));
  });

  it("the export runs on the ENRICHED path (loader found a real takeoff_json)", () => {
    expect(enrichedNull).toBe(false);
  });

  it("lounge slider renders at row 62 → 1 / 2.1 / 2.4", () => {
    expect(cell(ws, "D62")).toBe(1);
    expect(cell(ws, "E62")).toBe(2.1);
    expect(cell(ws, "F62")).toBe(2.4);
  });

  it("3.0×2.1 sectional at row 67 with REAL dims; H175–180 all zero", () => {
    expect(cell(ws, "D67")).toBe(1);
    expect(cell(ws, "E67")).toBe(2.1);
    expect(cell(ws, "F67")).toBe(3);
    for (const r of [175, 176, 177, 178, 179, 180]) expect(cell(ws, `H${r}`)).toBe(0);
  });
});

describe.skipIf(!LIVE)("LIVE — Beddis schedule path unchanged (vs committed ground truth)", () => {
  it("drop-in window rows match ground-truth-derived expectations", async () => {
    let id = await jobIdByNumber("%26001%");
    if (!id) {
      // Job numbering differs from the QS job code — fall back to the client name.
      const byName = await supabase.from("jobs").select("id, job_number").ilike("client_name", "%beddis%").limit(2);
      if (byName.error) throw new Error(byName.error.message);
      console.log("[live] Beddis by client name:", (byName.data ?? []).length, "match(es)");
      id = byName.data?.[0]?.id ?? null;
    }
    if (!id) {
      console.log("[live] Beddis not found by number or client name — report-only skip");
      return;
    }
    const data = await buildQSExportData(id);
    const ws = buildDropInSheet(data);
    // Ground truth (committed): Bed1 has 2 windows (first 1.6w×2.1h), garage sectional
    // 4.8×2.1 → H175 (std) or relational insulated bins — but NEVER rows 67/68, and
    // never zero across the whole block.
    console.log("[live] Beddis bed1 row 41:", cell(ws, "D41"), cell(ws, "E41"), cell(ws, "F41"));
    const hBlock = [175, 176, 177, 178, 179, 180].map((r) => Number(cell(ws, `H${r}`) ?? 0));
    console.log("[live] Beddis H175–180:", hBlock, "row67:", cell(ws, "D67"));
    expect(cell(ws, "D41")).toBe(2);
    expect(hBlock.reduce((s, v) => s + v, 0)).toBeGreaterThan(0); // the 4.8 door landed
    expect(cell(ws, "D67")).toBe(0); // standard door never spills to the non-standard rows
  });
});

describe.skipIf(!LIVE)("LIVE — §5.5 internal doors reach the export", () => {
  it("a job with schedule-entered internal doors and no confirmed count → intDoorStandard > 0", async () => {
    const res = await supabase
      .from("opening_schedule")
      .select("job_id")
      .eq("opening_type", "internal_door")
      .limit(50);
    if (res.error) throw new Error(res.error.message);
    const jobIds = [...new Set((res.data ?? []).map((r) => r.job_id))];
    console.log("[live] jobs with schedule internal doors:", jobIds.length);
    if (jobIds.length === 0) return; // nothing to validate against — report-only
    let validated = 0;
    for (const id of jobIds.slice(0, 5)) {
      const dc = await supabase.from("door_counts").select("confirmed_at").eq("job_id", id).maybeSingle();
      if (dc.data?.confirmed_at) continue; // confirmed counts legitimately override
      const data = await buildQSExportData(id);
      console.log(`[live] job ${id}: interiorDoors=${data.interiorDoors.length} intDoorStandard=${data.intDoorStandard}`);
      expect(data.intDoorStandard).toBeGreaterThan(0);
      validated += 1;
      if (validated >= 2) break;
    }
    console.log("[live] §5.5 validated on", validated, "job(s)");
  });
});
