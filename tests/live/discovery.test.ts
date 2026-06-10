// @vitest-environment node
/**
 * LIVE DISCOVERY — report-only (never fails the run). Two hunts:
 *
 *  1. Phase 3 gate input: where do the GEOMETRY ROOM LABELS live for the golden jobs
 *     (Beddis / Harrison / Young / O'Neil / Russell St)? Prints the takeoff_json key
 *     structure and any rooms-like arrays so the gate sidecars (rooms.json) can be
 *     generated automatically next run.
 *  2. QS master hunt: lists Supabase Storage buckets and any .xlsm/.xlsx objects —
 *     looking for the master workbook so the lounge-row question can be answered from
 *     the file itself.
 *
 * PRIVACY: results publish to a branch on a PUBLIC repo — client names are truncated
 * to 3 chars, never printed in full.
 */
import { describe, it } from "vitest";
import { supabase } from "../../src/integrations/supabase/client";

const LIVE = process.env.LIVE_VALIDATE === "1" && !!process.env.SUPABASE_URL;
const mask = (s: string | null | undefined) => (s ? s.slice(0, 3) + "…" : "∅");

describe.skipIf(!LIVE)("LIVE DISCOVERY (report-only)", () => {
  it("golden jobs + takeoff_json room structure", async () => {
    for (const needle of ["beddis", "harrison", "young", "neil", "russell"]) {
      const jobs = await supabase
        .from("jobs")
        .select("id, job_number, client_name")
        .ilike("client_name", `%${needle}%`)
        .limit(3);
      const rows = jobs.data ?? [];
      console.log(`[disc] '${needle}': ${rows.length} job(s)`, rows.map((r) => `${r.job_number}/${mask(r.client_name)}`));
      const id = rows[0]?.id;
      if (!id) continue;
      const runs = await supabase
        .from("takeoff_runs")
        .select("*")
        .eq("job_id", id)
        .order("started_at", { ascending: false })
        .limit(3);
      for (const run of runs.data ?? []) {
        const tj = (run as Record<string, unknown>)["takeoff_json"] as Record<string, unknown> | null;
        if (!tj) continue;
        console.log(`[disc] ${needle} takeoff_json keys:`, Object.keys(tj).sort().join(","));
        // Hunt anything rooms-like at depth ≤ 2.
        for (const [k, v] of Object.entries(tj)) {
          if (/room/i.test(k) && Array.isArray(v)) {
            console.log(`[disc] ${needle} ${k}[${v.length}] sample:`, JSON.stringify(v.slice(0, 4)));
          }
          if (v && typeof v === "object" && !Array.isArray(v)) {
            for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
              if (/room/i.test(k2) && Array.isArray(v2)) {
                console.log(`[disc] ${needle} ${k}.${k2}[${(v2 as unknown[]).length}] sample:`, JSON.stringify((v2 as unknown[]).slice(0, 4)));
              }
            }
          }
        }
        break; // first run with a payload is enough
      }
    }
  });

  it("jobs.specifications column provisioned?", async () => {
    // Report-only: the spec-picker migration (20260611000000) is applied via the
    // Supabase SQL editor. This probe tells the session whether it has landed.
    const res = await supabase.from("jobs").select("specifications").limit(1);
    if (res.error) {
      console.log("[disc] jobs.specifications: MISSING —", res.error.message,
        "→ run: alter table jobs add column if not exists specifications jsonb;");
    } else {
      console.log("[disc] jobs.specifications: PRESENT — sample:",
        JSON.stringify(res.data?.[0]?.specifications ?? null)?.slice(0, 60));
    }
  });

  it("storage buckets + workbook objects", async () => {
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const h = { apikey: key, Authorization: `Bearer ${key}` };
    const bRes = await fetch(`${url}/storage/v1/bucket`, { headers: h });
    if (!bRes.ok) {
      console.log("[disc] bucket list HTTP", bRes.status);
      return;
    }
    const buckets = (await bRes.json()) as Array<{ id: string; name: string; public: boolean }>;
    console.log("[disc] buckets:", buckets.map((b) => `${b.name}(${b.public ? "public" : "private"})`));
    for (const b of buckets) {
      const lRes = await fetch(`${url}/storage/v1/object/list/${b.name}`, {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: "", limit: 100, sortBy: { column: "name", order: "asc" } }),
      });
      if (!lRes.ok) { console.log(`[disc] list ${b.name} HTTP`, lRes.status); continue; }
      const objs = (await lRes.json()) as Array<{ name: string; id: string | null }>;
      const folders = objs.filter((o) => !o.id).map((o) => o.name);
      const books = objs.filter((o) => /\.(xlsm|xlsx)$/i.test(o.name)).map((o) => o.name);
      console.log(`[disc] ${b.name}: ${objs.length} root entries, folders:[${folders.slice(0, 8)}], workbooks:[${books}]`);
      // One level into folders, workbooks only.
      for (const f of folders.slice(0, 10)) {
        const fRes = await fetch(`${url}/storage/v1/object/list/${b.name}`, {
          method: "POST",
          headers: { ...h, "Content-Type": "application/json" },
          body: JSON.stringify({ prefix: `${f}/`, limit: 100 }),
        });
        if (!fRes.ok) continue;
        const fo = (await fRes.json()) as Array<{ name: string; id: string | null }>;
        const fb = fo.filter((o) => /\.(xlsm|xlsx)$/i.test(o.name)).map((o) => `${f}/${o.name}`);
        if (fb.length) console.log(`[disc] ${b.name} workbooks:`, fb);
      }
    }
  });
});
