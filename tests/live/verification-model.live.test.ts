// @vitest-environment node
/**
 * LIVE — verification printout model against the REAL JM-0020 (13 Jun 2026).
 *
 * The printout's whole promise is the same-composer doctrine: paper and spreadsheet
 * can never tell two stories. The unit suite proves it on fixtures; THIS proves it on
 * the production reference job every time live-validate runs:
 *
 *   1. buildVerificationModel never throws on real data
 *   2. integrityAlerts is EMPTY — export values and enriched takeoff agree live
 *   3. header/measures carry real values (job number, floor area present)
 *   4. planOverlay degrades honestly on pre-overlay runs (no invented markers)
 *
 * Style matches live-validation.test.ts: every assertion prints the live value first,
 * so a failure run reads as a report.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { supabase } from "../../src/integrations/supabase/client";
import { buildQSExportData, loadEnrichedTakeoffJson } from "../../src/lib/iq-qs-export";
import { buildVerificationModel } from "../../src/lib/verification/verification-model";
import type { VerificationModel } from "../../src/lib/verification/verification-model";

const LIVE = process.env.LIVE_VALIDATE === "1" && !!process.env.SUPABASE_URL;

async function jobIdByNumber(jobNumber: string): Promise<string | null> {
  const res = await supabase
    .from("jobs")
    .select("id, job_number")
    .ilike("job_number", jobNumber)
    .limit(2);
  if (res.error) throw new Error(`jobs lookup failed: ${res.error.message}`);
  return res.data?.[0]?.id ?? null;
}

describe.skipIf(!LIVE)("LIVE — verification model on JM-0020 (same-composer doctrine)", () => {
  let model: VerificationModel | null = null;

  beforeAll(async () => {
    const jobId = await jobIdByNumber("JM-0020");
    if (!jobId) throw new Error("JM-0020 not found");
    const [data, enriched, runRes] = await Promise.all([
      buildQSExportData(jobId),
      loadEnrichedTakeoffJson(jobId),
      supabase
        .from("takeoff_runs")
        .select("id, started_at")
        .eq("job_id", jobId)
        .order("started_at", { ascending: false })
        .limit(1),
    ]);
    const run = runRes.data?.[0] ?? null;
    model = buildVerificationModel(
      data,
      enriched,
      run ? { id: run.id as string, started_at: run.started_at as string } : null,
    );
  });

  it("builds without throwing and carries the job identity", () => {
    console.log("[live] header:", model?.header.jobNumber, "·", model?.header.takeoffSource);
    expect(model).not.toBeNull();
    expect(model!.header.jobNumber).toContain("JM-0020");
  });

  it("integrityAlerts is EMPTY — export and takeoff agree on the real job", () => {
    console.log("[live] integrityAlerts:", model!.integrityAlerts);
    expect(model!.integrityAlerts).toEqual([]);
  });

  it("key measures carry real values (floor area present, not '—')", () => {
    const floor = model!.measures.find((r) => r.label.startsWith("Floor area"));
    console.log("[live] floor area:", floor?.value, floor?.unit, "·", floor?.source);
    expect(floor?.value).not.toBe("—");
  });

  it("planOverlay degrades honestly: marker count matches persisted hits exactly", () => {
    const n = model!.planOverlay.markers.length;
    const sum = model!.planOverlay.summary;
    console.log(
      "[live] overlay markers:",
      n,
      "· summary:",
      sum,
      "· page:",
      model!.planOverlay.page?.pageNumber ?? null,
    );
    // Pre-overlay runs MUST yield zero markers (never invented); post-overlay runs must tally.
    expect(sum.confirmed + sum.flagged).toBe(n);
  });

  it("specs render with labels, never raw codes", () => {
    const all = model!.specs.flatMap((g) => g.rows);
    console.log(
      "[live] specs answered:",
      all.filter((r) => r.answer !== "— not set").length,
      "of",
      all.length,
    );
    for (const r of all) expect(r.answer).not.toMatch(/^\d+$/);
  });
});
