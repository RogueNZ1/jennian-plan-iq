// @vitest-environment node
/**
 * LIVE DIAGNOSTIC — report-only (never fails). Root-cause hunt for the 12 Jun
 * new-plan window failures: JM-0027 (partial/garbage) and JM-0029 (total zero),
 * with JM-0020 as healthy control. Prints, per job: latest takeoff_runs status +
 * error-ish fields, takeoff_json top-level keys, windows_by_room content,
 * windows_schedule presence, window_count + source.
 * PRIVACY: public-repo publishing — client names masked to 3 chars.
 */
import { describe, it } from "vitest";
import { supabase } from "../../src/integrations/supabase/client";

const LIVE = process.env.LIVE_VALIDATE === "1" && !!process.env.SUPABASE_URL;
const mask = (s: string | null | undefined) => (s ? s.slice(0, 3) + "…" : "∅");
const trunc = (v: unknown, n = 300) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s && s.length > n ? s.slice(0, n) + `…(+${s.length - n})` : s;
};

describe.skipIf(!LIVE)("LATEST RUN AUDIT (global)", () => {
  it("newest takeoff run anywhere — geometry participation + key values", async () => {
    const runs = await supabase
      .from("takeoff_runs")
      .select("id, job_id, started_at, completed_at, status, error_message, takeoff_json")
      .order("started_at", { ascending: false })
      .limit(2);
    for (const r of runs.data ?? []) {
      const job = await supabase.from("jobs").select("job_number").eq("id", r.job_id).limit(1);
      console.log(
        `[audit] ===== ${job.data?.[0]?.job_number} run ${String(r.id).slice(0, 8)} =====`,
      );
      console.log(
        "[audit] started:",
        r.started_at,
        "| status:",
        r.status,
        "| err:",
        r.error_message,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf.js/Supabase boundary types are deliberately loose here
      const tj: any = r.takeoff_json ?? {};
      for (const k of [
        "floor_area_m2",
        "external_wall_lm",
        "internal_wall_lm",
        "window_count",
        "garage_door_size",
        "roof_area_m2",
        "internal_door_count",
      ]) {
        const v = tj[k];
        console.log(`[audit] ${k} =`, JSON.stringify(v));
      }
      const flags = JSON.stringify(tj).match(/discrepancy_flags":\[[^\]]+\]/g)?.length ?? 0;
      console.log("[audit] fields carrying discrepancy flags:", flags);
    }
    expect(true).toBe(true);
  }, 30000);
});

describe.skipIf(!LIVE)("LIVE DIAG openings (report-only)", () => {
  it("JM-0027 / JM-0029 vs control JM-0020 — window pipeline state", async () => {
    for (const jn of ["JM-0027", "JM-0029", "JM-0020"]) {
      const jobs = await supabase.from("jobs").select("*").eq("job_number", jn).limit(1);
      const job = jobs.data?.[0];
      if (!job) {
        console.log(`[diag] ${jn}: NOT FOUND (err=${trunc(jobs.error)})`);
        continue;
      }
      console.log(`[diag] ===== ${jn} (${mask(job.client_name)}) =====`);
      console.log(`[diag] ${jn} job cols:`, Object.keys(job).join(","));
      const tj = (job as Record<string, unknown>)["takeoff_json"] as Record<string, unknown> | null;
      if (tj) {
        console.log(`[diag] ${jn} takeoff_json keys:`, Object.keys(tj).join(","));
        for (const k of [
          "window_count",
          "windows_source",
          "source",
          "windows_by_room",
          "windows_schedule",
          "openings",
          "extraction_errors",
          "errors",
          "vision_meta",
        ]) {
          if (k in tj) console.log(`[diag] ${jn} tj.${k}=`, trunc(tj[k], 500));
        }
      } else console.log(`[diag] ${jn} takeoff_json: NULL`);
      const runs = await supabase
        .from("takeoff_runs")
        .select("*")
        .eq("job_id", job.id)
        .order("started_at", { ascending: false })
        .limit(3);
      if (runs.error) {
        console.log(`[diag] ${jn} runs err:`, trunc(runs.error));
        continue;
      }
      for (const r of runs.data ?? []) {
        const rec = r as Record<string, unknown>;
        console.log(`[diag] ${jn} run cols:`, Object.keys(rec).join(","));
        for (const k of ["started_at", "completed_at", "started_by", "status", "error_message"]) {
          console.log(`[diag] ${jn} run.${k}=`, trunc(rec[k], 300));
        }
        const rtj = rec["takeoff_json"] as Record<string, unknown> | null;
        if (!rtj) {
          console.log(`[diag] ${jn} run.takeoff_json: NULL`);
          continue;
        }
        console.log(`[diag] ${jn} RUN tj keys:`, Object.keys(rtj).join(","));
        for (const k of [
          "window_count",
          "garage_door_size",
          "floor_area_m2",
          "external_wall_lm",
          "internal_door_count",
          "door_counts_auto",
        ]) {
          if (k in rtj) console.log(`[diag] ${jn} RUNtj.${k}=`, trunc(rtj[k], 700));
        }
      }
    }
  }, 60000);
});
