// @vitest-environment node
/**
 * LIVE DIAGNOSTIC — tonight's run, full provenance audit (13 Jun 2026, report-only).
 *
 * Haydon ran a job through and "it got some shit wrong". This dumps EVERYTHING the
 * run produced so the wrong bits can be pointed at by name: every enriched field with
 * value/source/confidence/flags, door engine output (counts/hits/page), windows
 * (by-room, schedule, openings totals), the QS export headline values, and anomaly
 * heuristics (the checks a reviewer would run by eye).
 *
 * Report-only — never fails. PRIVACY: public-repo publishing — client names masked.
 */
import { describe, it } from "vitest";
import { supabase } from "../../src/integrations/supabase/client";
import { buildQSExportData } from "../../src/lib/iq-qs-export";
import type { EnrichedTakeoff, FieldValue } from "../../src/lib/takeoff/enriched-takeoff";

const LIVE = process.env.LIVE_VALIDATE === "1" && !!process.env.SUPABASE_URL;
const mask = (s: string | null | undefined) => (s ? s.slice(0, 3) + "…" : "∅");

function fvLine(label: string, f: FieldValue<unknown> | undefined | null): string {
  if (!f) return `${label}: <absent>`;
  const flags = f.discrepancy_flags.length ? ` ⚑[${f.discrepancy_flags.join(" | ")}]` : "";
  return `${label}: ${JSON.stringify(f.value)} ·${f.source}·${f.confidence ?? "-"}${flags}`;
}

describe.skipIf(!LIVE)("DIAG — tonight's run, full provenance", () => {
  it("dump the newest run end to end", async () => {
    const runs = await supabase
      .from("takeoff_runs")
      .select("id, job_id, started_at, status, takeoff_json")
      .order("started_at", { ascending: false })
      .limit(3);
    console.log("[diag] last 3 runs:");
    for (const r of runs.data ?? []) {
      console.log(
        `  ${String(r.started_at)} · ${String(r.id).slice(0, 8)} · ${r.status} · payload:${r.takeoff_json ? "yes" : "NULL"}`,
      );
    }
    const newest = (runs.data ?? []).find((r) => r.takeoff_json);
    if (!newest) {
      console.log("[diag] no recent run carries a payload — nothing to audit");
      return;
    }
    const job = await supabase
      .from("jobs")
      .select("job_number, client_name, status")
      .eq("id", newest.job_id)
      .limit(1);
    console.log(
      `[diag] ===== ${job.data?.[0]?.job_number} (${mask(job.data?.[0]?.client_name)}) run ${String(newest.id).slice(0, 8)} =====`,
    );

    const e = newest.takeoff_json as unknown as EnrichedTakeoff;

    console.log("--- MEASURES (value · source · confidence · flags) ---");
    for (const [k, label] of [
      ["floor_area_m2", "floor"],
      ["garage_area_m2", "garage"],
      ["alfresco_area_m2", "alfresco"],
      ["total_area_m2", "total"],
      ["external_wall_lm", "ext-wall-lm"],
      ["external_wall_area_m2", "ext-wall-m2"],
      ["internal_wall_lm", "INT-WALL-LM"],
      ["roof_area_m2", "roof"],
      ["gable_span_m", "gable-span"],
      ["ceiling_height_m", "ceiling"],
      ["foundation_type", "foundation"],
      ["window_count", "window-count"],
      ["external_door_count", "ext-doors"],
      ["internal_door_count", "int-doors"],
      ["garage_door_size", "garage-door"],
      ["geometry_status", "geometry-status"],
    ] as const) {
      console.log("  " + fvLine(label, (e as Record<string, never>)[k]));
    }

    console.log("--- DOOR ENGINE ---");
    console.log("  counts_auto:", JSON.stringify(e.door_counts_auto ?? null));
    console.log(
      "  hits:",
      e.door_hits?.length ?? "<absent>",
      "· flags:",
      e.door_flags?.length ?? 0,
    );
    console.log("  page:", JSON.stringify(e.door_page ?? null));
    for (const h of (e.door_hits ?? []).slice(0, 25)) {
      console.log(
        `    ${h.type} ${h.widthMm}mm @(${Math.round(h.x)},${Math.round(h.y)}) ${h.confidence}${h.note ? " · " + h.note : ""}`,
      );
    }

    console.log("--- WINDOWS ---");
    console.log("  by_room:", JSON.stringify(e.windows_by_room?.value ?? null));
    console.log(
      "  schedule:",
      (e.windows_schedule?.value ?? []).map((s) => `${s.id}:${s.height_m}x${s.width_m}`).join(" "),
    );
    console.log(
      "  openings:",
      e.openings?.length ?? "<absent>",
      "· glazed_sqm:",
      e.glazed_sqm ?? null,
      "· total_opening_sqm:",
      e.total_opening_sqm ?? null,
    );
    for (const o of (e.openings ?? []).slice(0, 30)) {
      console.log(
        `    ${o.type} ${o.room ?? "<no-room>"} ${o.width_m}x${o.height_m} glazed:${o.glazed} clad:${o.cladding ?? "∅"} src:${o.source} conf:${o.confidence}${o.flags?.length ? " ⚑" + JSON.stringify(o.flags) : ""}`,
      );
    }

    console.log("--- ROOMS (geometry footprints) ---");
    for (const r of e.rooms ?? []) console.log(`    ${r.label}: ${r.width_m} x ${r.depth_m}`);

    console.log("--- QS EXPORT HEADLINES ---");
    const q = await buildQSExportData(newest.job_id as string);
    console.log(
      `  source:${q.takeoffSource} · floor:${q.floorAreaM2} · perim:${q.perimeterLm} · intWall:${q.internalWallLm} · geomStatus:${q.geometryStatus ?? "ok"}`,
    );
    console.log(
      `  doors → src:${q.doorsSource} std:${q.intDoorStandard} dbl:${q.intDoorDouble} cav:${q.intDoorCavitySlider} barn:${q.intDoorBarnSlider} hint:${q.intDoorVisionHint}`,
    );
    console.log("  window rows:", JSON.stringify(q.windows));
    console.log("  windowsByRoom slots:", JSON.stringify(q.windowsByRoom));
    console.log(
      `  garage doors → 48std:${q.garageDoor48x21Std} 48ins:${q.garageDoor48x21Insulated} 27std:${q.garageDoor27x21Std} 27ins:${q.garageDoor27x21Insulated} 24std:${q.garageDoor24x21Std} 24ins:${q.garageDoor24x21Insulated}`,
    );
    console.log("  reviewFlags:", JSON.stringify(q.reviewFlags ?? []));

    console.log("--- ANOMALY HEURISTICS ---");
    const intW = e.internal_wall_lm?.value as number | null;
    const extW = e.external_wall_lm?.value as number | null;
    if (intW != null && extW != null && intW < extW * 0.5)
      console.log(`  ⚠ INT walls (${intW}lm) < half EXT (${extW}lm) — known ribbon-trace gap`);
    const sched = e.windows_schedule?.value?.length ?? 0;
    const wc = e.window_count?.value as number | null;
    if (sched > 0 && wc != null && sched !== wc)
      console.log(`  ⚠ schedule entries (${sched}) ≠ window_count (${wc})`);
    const unrouted = (e.openings ?? []).filter((o) => o.glazed && !o.room).length;
    if (unrouted > 0) console.log(`  ⚠ ${unrouted} glazed opening(s) with NO room link`);
    const engineTotal = e.door_counts_auto
      ? e.door_counts_auto.singles + e.door_counts_auto.doubles + e.door_counts_auto.cavitySliders
      : null;
    const visionDoors = e.internal_door_count?.value as number | null;
    if (engineTotal != null && visionDoors != null && Math.abs(engineTotal - visionDoors) > 2)
      console.log(`  ⚠ engine doors (${engineTotal}) vs vision (${visionDoors}) differ by >2`);
    const slotQty = Object.values(q.windowsByRoom ?? {}).reduce((s, v) => s + (v?.qty ?? 0), 0);
    if (wc != null && slotQty !== wc)
      console.log(`  ⚠ by-room slot qty total (${slotQty}) ≠ window_count (${wc}) — routing loss`);
    console.log("[diag] done");
  }, 60_000);
});
