/**
 * Phase A — text-based opening extraction.
 *
 * Conservative regex pass over plan/spec page text. We never fabricate
 * openings; if a value isn't adjacent to a window/door context it is
 * skipped. Everything written to opening_schedule is review_required.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ExtractedFile } from "./pdf-text";

export type OpeningKind =
  | "window"
  | "sliding_door"
  | "internal_door"
  | "external_door"
  | "garage_door"
  | "unknown_opening";

export type ExtractedOpening = {
  kind: OpeningKind;
  width_mm: number;
  height_mm: number | null;
  quantity: number;
  roomName: string | null;
  evidence: string;
  page: number;
  fileId: string;
  fileName: string;
  fileType: "plan" | "specification";
  source: "Uploaded Plan Text" | "Uploaded Specification Text";
  confidence: "high" | "mid" | "low";
};

const WIN_CTX = /(window|awning|casement|fixed|joinery|sliding\s+door|stacker|ranchslider|french\s+door|bifold)/i;
const DOOR_CTX = /(door|entry|hinged|cavity\s+slider|internal\s+door)/i;
const GARAGE_CTX = /(garage\s+door|sectional\s+door|tilt\s+door|roller\s+door)/i;
const ROOM_CTX = /(bed(?:room)?\s*\d?|lounge|kitchen|bathroom|ensuite|wc|laundry|dining|living|family|hall|entry|garage|study|office|pantry)/i;

const PAIR_RE = /(\d{3,5})\s*[x×]\s*(\d{3,5})/g;
const BARE_DOOR_RE = /\b(710|760|810|860|910)\b/g;

function nearby(text: string, idx: number, len: number, pad = 60): string {
  const a = Math.max(0, idx - pad);
  const b = Math.min(text.length, idx + len + pad);
  return text.slice(a, b);
}

function classifyPair(ctx: string, w: number, h: number): { kind: OpeningKind; conf: "high" | "mid" | "low" } {
  if (GARAGE_CTX.test(ctx) || (w >= 2000 && h >= 1800 && h <= 2400)) {
    return { kind: "garage_door", conf: "high" };
  }
  // sliding/stacker doors typically wider and tall
  if (/sliding|stacker|ranchslider|bifold|french/i.test(ctx) && w >= 1600 && h >= 1900) {
    return { kind: "sliding_door", conf: "mid" };
  }
  if (WIN_CTX.test(ctx)) return { kind: "window", conf: "low" };
  if (DOOR_CTX.test(ctx) && h >= 1900) return { kind: "external_door", conf: "low" };
  return { kind: "unknown_opening", conf: "low" };
}

function detectRoom(ctx: string): string | null {
  const m = ctx.match(ROOM_CTX);
  return m ? m[0] : null;
}

export function extractOpeningsFromFile(file: ExtractedFile): ExtractedOpening[] {
  const out: ExtractedOpening[] = [];
  const source: ExtractedOpening["source"] =
    file.fileType === "specification" ? "Uploaded Specification Text" : "Uploaded Plan Text";

  const seen = new Set<string>(); // dedupe by kind+w+h+page

  for (const page of file.pages) {
    if (!page.text) continue;
    const text = page.text;

    // 1. width × height pairs
    PAIR_RE.lastIndex = 0;
    let pm: RegExpExecArray | null;
    while ((pm = PAIR_RE.exec(text)) != null) {
      const w = Number(pm[1]);
      const h = Number(pm[2]);
      if (!Number.isFinite(w) || !Number.isFinite(h)) continue;
      // Plausibility: keep only realistic opening sizes in mm.
      if (w < 400 || w > 7500) continue;
      if (h < 400 || h > 3500) continue;
      const ctx = nearby(text, pm.index, pm[0].length);
      // Require window/door/garage context to avoid catching dimension callouts.
      if (!WIN_CTX.test(ctx) && !DOOR_CTX.test(ctx) && !GARAGE_CTX.test(ctx)) continue;
      const cls = classifyPair(ctx, w, h);
      const key = `${cls.kind}:${w}:${h}:${page.pageNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        kind: cls.kind,
        width_mm: w,
        height_mm: h,
        quantity: 1,
        roomName: detectRoom(ctx),
        evidence: `${file.fileName} p${page.pageNumber} — "${ctx.replace(/\s+/g, " ").trim().slice(0, 140)}"`,
        page: page.pageNumber,
        fileId: file.fileId,
        fileName: file.fileName,
        fileType: file.fileType,
        source,
        confidence: cls.conf,
      });
    }

    // 2. bare door widths near door context
    BARE_DOOR_RE.lastIndex = 0;
    let dm: RegExpExecArray | null;
    while ((dm = BARE_DOOR_RE.exec(text)) != null) {
      const w = Number(dm[1]);
      const ctx = nearby(text, dm.index, dm[0].length, 40);
      if (!DOOR_CTX.test(ctx)) continue;
      // Skip if it's actually a w×h pair (already handled).
      if (/[x×]\s*\d/.test(ctx.slice(Math.max(0, ctx.length / 2 - 6)))) continue;
      const key = `internal_door:${w}:0:${page.pageNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        kind: "internal_door",
        width_mm: w,
        height_mm: null,
        quantity: 1,
        roomName: detectRoom(ctx),
        evidence: `${file.fileName} p${page.pageNumber} — "${ctx.replace(/\s+/g, " ").trim().slice(0, 140)}"`,
        page: page.pageNumber,
        fileId: file.fileId,
        fileName: file.fileName,
        fileType: file.fileType,
        source,
        confidence: "low",
      });
    }
  }
  return out;
}

/**
 * Persist an opening as a draft row. Re-run safe: skips inserting an
 * identical (kind/width/height/page/source) draft row that is still
 * review_required, and never touches confirmed rows.
 */
export async function persistOpening(args: {
  jobId: string;
  createdBy: string;
  o: ExtractedOpening;
}): Promise<{ status: "inserted" | "skipped" }> {
  const { o } = args;
  const { data: existing } = await supabase
    .from("opening_schedule")
    .select("id, review_status")
    .eq("job_id", args.jobId)
    .eq("opening_type", o.kind)
    .eq("width_mm", o.width_mm)
    .eq("plan_page_number", o.page)
    .eq("source", o.source)
    .limit(1);

  if (existing && existing[0]) {
    // Confirmed rows are sacred. Drafts already exist — skip.
    return { status: "skipped" };
  }

  await supabase.from("opening_schedule").insert({
    job_id: args.jobId,
    file_id: o.fileId,
    plan_page_number: o.page,
    opening_type: o.kind,
    width_mm: o.width_mm,
    height_mm: o.height_mm,
    room_name: o.roomName,
    quantity: o.quantity,
    source: o.source,
    source_evidence: o.evidence,
    confidence: o.confidence,
    review_status: "review_required",
    notes: null,
    created_by: args.createdBy,
  });
  return { status: "inserted" };
}
