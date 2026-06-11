// @vitest-environment node
/** ONE-SHOT SURGICAL RESTORE (12 Jun, pre-demo): delete today's two vision-only
 * takeoff runs on JM-0020 so the job reverts to the 10 Jun validated extraction.
 * Hard-scoped: job_number JM-0020 AND started_at >= 2026-06-11T22:00Z only.
 * THIS FILE IS REMOVED IMMEDIATELY AFTER EXECUTION. */
import { describe, it, expect } from "vitest";
import { supabase } from "../../src/integrations/supabase/client";

const LIVE = process.env.LIVE_VALIDATE === "1" && !!process.env.SUPABASE_URL;

describe.skipIf(!LIVE)("OPS RESTORE JM-0020 (one-shot)", () => {
  it("deletes today's corrupted runs, validated 10 Jun run becomes latest", async () => {
    const jobs = await supabase.from("jobs").select("id").eq("job_number", "JM-0020").limit(1);
    const jobId = jobs.data?.[0]?.id;
    expect(jobId, "JM-0020 must exist").toBeTruthy();
    const del = await supabase.from("takeoff_runs").delete()
      .eq("job_id", jobId!).gte("started_at", "2026-06-11T22:00:00Z").select("id, started_at");
    console.log(`[restore] deleted ${del.data?.length ?? 0} run(s):`, del.data, "err:", del.error);
    const newest = await supabase.from("takeoff_runs").select("id, started_at")
      .eq("job_id", jobId!).order("started_at", { ascending: false }).limit(1);
    console.log("[restore] newest remaining run:", newest.data);
    expect(newest.data?.[0]?.started_at?.startsWith("2026-06-10")).toBe(true);
  }, 30000);
});
