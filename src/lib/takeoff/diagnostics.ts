/**
 * Phase A — Automatic Takeoff diagnostics.
 *
 * Pure helpers used by `run.ts` to capture transparent reasoning about why
 * the takeoff did or did not produce results. Nothing here writes to the
 * database. Nothing here invents quantities. Every value is derived from
 * the actual extracted PDF text and the same regexes the production
 * extractors use.
 *
 * The output is attached to `takeoff_runs.summary.diagnostics` so the
 * Owner/Admin diagnostics panel can render it without re-running.
 */
import type { ExtractedFile, ExtractedPage } from "./pdf-text";
import type { ClassifiedPage } from "./classify";
import { extractSpecRowsFromFile } from "./extract-spec";
import type { IQModuleId } from "@/lib/iq-modules";

/* --------------------------------- types --------------------------------- */

export type ClassificationSignals = {
  roomNames: string[];
  dimensions: string[];
  scaleText: string | null;
  areaWords: string[];
  titleWords: string[];
  specWords: string[];
};

export type PageDiagnostic = {
  pageNumber: number;
  charCount: number;
  textPreview: string; // first 1000 chars
  textStatus: "ok" | "empty" | "extraction_error";
  textError: string | null;
  pageSize: string;
  pageType: string;
  confidence: "high" | "mid" | "low";
  reason: string;
  signals: ClassificationSignals;
};

export type FileDiagnostic = {
  fileId: string;
  fileName: string;
  fileType: string;
  storagePath: string;
  storageStatus: "ok" | "download_error";
  storageError: string | null;
  included: boolean;
  inclusionReason: string;
  pageCount: number;
  pages: PageDiagnostic[];
};

export type QuantityCheck = {
  kind: string;
  label: string;
  unit: string;
  found: boolean;
  matchedText: string | null;
  parsedValue: number | null;
  parsedSecondary: number | null;
  fileName: string | null;
  pageNumber: number | null;
};

export type OpeningCandidate = {
  rawText: string;
  parsedWidth: number | null;
  parsedHeight: number | null;
  kindGuess: string;
  confidence: "high" | "mid" | "low" | null;
  reason: string;
  fileName: string;
  pageNumber: number;
  included: boolean;
};

export type OpeningDiagnostics = {
  pairsFound: number;
  bareDoorsFound: number;
  ignored: number;
  duplicatesRemoved: number;
  rowsCreated: number;
  candidates: OpeningCandidate[];
};

export type SpecCheck = {
  moduleId:
    | IQModuleId
    | "iq-core"
    | "iq-framing"
    | "iq-roofing"
    | "iq-cladding"
    | "iq-linings"
    | "iq-electrical"
    | "iq-plumbing";
  label: string;
  found: boolean;
  matchedText: string | null;
  parsedValue: string | null;
  fileName: string | null;
  pageNumber: number | null;
  rowCreated: boolean;
  confidence: "high" | "mid" | "low" | null;
};

export type TakeoffDiagnostics = {
  jobId: string;
  uploadedFileCount: number;
  includedFileCount: number;
  files: FileDiagnostic[];
  quantityChecks: QuantityCheck[];
  specChecks: SpecCheck[];
  openings: OpeningDiagnostics;
  totalCharsExtracted: number;
  pagesWithText: number;
  pagesWithoutText: number;
  outcome:
    | "no_files"
    | "no_readable_text"
    | "partial_readable_text_no_matches"
    | "readable_text_no_matches"
    | "matches_no_module_rows"
    | "ok"
    | "limited_specification"
    | "specification_only"
    | "flattened_plan"
    | "errors";
  outcomeMessage: string;
};

/* ---------------------------- signal extractors -------------------------- */

const ROOM_RE =
  /\b(bed(?:room)?\s*\d?|lounge|kitchen|bathroom|ensuite|wc|laundry|dining|living|family|hall|entry|garage|study|office|pantry|master)\b/gi;
const DIM_RE = /\b\d{3,5}\b/g;
const SCALE_RE = /(?:scale[:\s]*)?1\s*[:/]\s*(\d{2,4})(?:\s*@\s*(a\d))?/i;
const AREA_RE = /\b(area|perimeter|coverage|floor\s+area|total\s+area)\b/gi;
const TITLE_RE =
  /\b(floor\s*plan|site\s*plan|elevation|section|cover\s*sheet|title\s*sheet|drawing\s*index|roof\s*plan|electrical|plumbing|schedule|legend)\b/gi;
const SPEC_RE =
  /\b(specification|specifications|m3\s+schedule|master\s+spec|standard\s+inclusions)\b/gi;

function uniqueLower(matches: RegExpMatchArray | null): string[] {
  if (!matches) return [];
  const set = new Set<string>();
  for (const m of matches) set.add(m.replace(/\s+/g, " ").trim().toLowerCase());
  return Array.from(set).slice(0, 20);
}

export function getClassificationSignals(text: string): ClassificationSignals {
  const rooms = uniqueLower(text.match(ROOM_RE));
  const dims = (() => {
    const m = text.match(DIM_RE);
    if (!m) return [];
    const set = new Set<string>();
    for (const x of m) set.add(x);
    return Array.from(set).slice(0, 30);
  })();
  const scaleM = text.match(SCALE_RE);
  const scaleText = scaleM
    ? scaleM[2]
      ? `1:${scaleM[1]} @${scaleM[2].toUpperCase()}`
      : `1:${scaleM[1]}`
    : null;
  const areaWords = uniqueLower(text.match(AREA_RE));
  const titleWords = uniqueLower(text.match(TITLE_RE));
  const specWords = uniqueLower(text.match(SPEC_RE));
  return { roomNames: rooms, dimensions: dims, scaleText, areaWords, titleWords, specWords };
}

/* --------------------------- per-page builder ---------------------------- */

export function buildPageDiagnostic(
  raw: ExtractedPage,
  classified: ClassifiedPage,
  textError: string | null,
): PageDiagnostic {
  const charCount = raw.text?.length ?? 0;
  const status: PageDiagnostic["textStatus"] = textError
    ? "extraction_error"
    : charCount === 0
      ? "empty"
      : "ok";
  return {
    pageNumber: raw.pageNumber,
    charCount,
    textPreview: (raw.text ?? "").slice(0, 1000),
    textStatus: status,
    textError,
    pageSize: raw.pageSize,
    pageType: classified.pageType,
    confidence: classified.confidence,
    reason: classified.reason,
    signals: getClassificationSignals(raw.text ?? ""),
  };
}

/* --------------------------- quantity checks ----------------------------- */

const NUM = "(\\d{1,4}(?:[,\\d]{0,5})?(?:\\.\\d{1,3})?)";
function parseNum(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
function snippet(text: string, idx: number, len: number, pad = 24): string {
  const start = Math.max(0, idx - pad);
  const end = Math.min(text.length, idx + len + pad);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

type QtyDef = {
  kind: string;
  label: string;
  unit: string;
  patterns: RegExp[];
  category: "area" | "length" | "pitch" | "stud" | "garage_door";
};

const QTY_DEFS: QtyDef[] = [
  {
    kind: "area_over_frame",
    label: "Area Over Frame",
    unit: "m²",
    category: "area",
    patterns: [/area\s+over\s+frame/i],
  },
  {
    kind: "total_floor_area",
    label: "Total Floor Area",
    unit: "m²",
    category: "area",
    patterns: [/total\s+floor\s+area/i, /total\s+area/i, /floor\s+area\b/i],
  },
  {
    kind: "coverage_area",
    label: "Coverage Area",
    unit: "m²",
    category: "area",
    patterns: [/coverage\s+area/i, /\bcoverage\b/i],
  },
  {
    kind: "porch_area",
    label: "Porch Area",
    unit: "m²",
    category: "area",
    patterns: [/porch\s+area/i, /entry\s+porch/i],
  },
  {
    kind: "garage_area",
    label: "Garage Area",
    unit: "m²",
    category: "area",
    patterns: [/garage\s+area/i],
  },
  {
    kind: "living_area",
    label: "Living Area",
    unit: "m²",
    category: "area",
    patterns: [/living\s+area/i, /\bhabitable\s+area/i],
  },
  {
    kind: "cladding_area",
    label: "Cladding Area",
    unit: "m²",
    category: "area",
    patterns: [/cladding\s+area/i],
  },
  {
    kind: "external_perimeter",
    label: "External Perimeter",
    unit: "lm",
    category: "length",
    patterns: [/external\s+perimeter/i, /perimeter/i],
  },
  {
    kind: "internal_wall_length",
    label: "Internal Wall Length",
    unit: "lm",
    category: "length",
    patterns: [/internal\s+wall\s+length/i, /internal\s+walls?\b/i],
  },
  {
    kind: "roof_pitch",
    label: "Roof Pitch",
    unit: "°",
    category: "pitch",
    patterns: [/(?:roof\s+)?pitch/i],
  },
  {
    kind: "stud_height",
    label: "Stud Height",
    unit: "m",
    category: "stud",
    patterns: [/stud\s+height/i],
  },
  {
    kind: "garage_door_size",
    label: "Garage Door Size",
    unit: "mm",
    category: "garage_door",
    patterns: [/garage\s+door/i],
  },
];

function runQtyOnPage(
  def: QtyDef,
  text: string,
): { matched: string; value: number | null; secondary: number | null } | null {
  for (const labelRe of def.patterns) {
    const labelM = text.match(labelRe);
    if (!labelM || labelM.index == null) continue;
    const searchFrom = labelM.index + labelM[0].length;
    const tail = text.slice(searchFrom, searchFrom + 80);

    if (def.category === "area") {
      const re = new RegExp(`${NUM}\\s*(?:m²|m2|sqm|sq\\s*m)`, "i");
      const vm = tail.match(re);
      if (!vm) continue;
      const v = parseNum(vm[1]);
      if (v == null || v <= 0 || v > 10000) continue;
      return {
        matched: snippet(text, labelM.index, labelM[0].length + (vm.index ?? 0) + vm[0].length),
        value: v,
        secondary: null,
      };
    }
    if (def.category === "length") {
      const re = new RegExp(`${NUM}\\s*(m|lm|metres?|lin\\.?\\s*m|mm)\\b`, "i");
      const vm = tail.match(re);
      if (!vm) continue;
      let v = parseNum(vm[1]);
      if (v == null || v <= 0) continue;
      if (vm[2].toLowerCase() === "mm") v = v / 1000;
      if (v > 5000) continue;
      return {
        matched: snippet(text, labelM.index, labelM[0].length + (vm.index ?? 0) + vm[0].length),
        value: v,
        secondary: null,
      };
    }
    if (def.category === "pitch") {
      const re = /(?:roof\s+)?pitch[:\s]*?(\d{1,2}(?:\.\d)?)\s*(?:°|deg|degrees|degree)/i;
      const m = text.match(re);
      if (!m || m.index == null) continue;
      const v = parseNum(m[1]);
      if (v == null || v < 5 || v > 60) continue;
      return { matched: snippet(text, m.index, m[0].length), value: v, secondary: null };
    }
    if (def.category === "stud") {
      const re = /stud\s+height[:\s]*?(\d(?:\.\d{1,2})?|\d{4})\s*(m|mm)\b/i;
      const m = text.match(re);
      if (!m || m.index == null) continue;
      let v = parseNum(m[1]);
      if (v == null) continue;
      if (m[2].toLowerCase() === "mm") v = v / 1000;
      if (v < 2 || v > 5) continue;
      return { matched: snippet(text, m.index, m[0].length), value: v, secondary: null };
    }
    if (def.category === "garage_door") {
      const re = /garage\s+door[:\s]*?(\d{3,5})\s*[x×]\s*(\d{3,5})/i;
      const m = text.match(re);
      if (!m || m.index == null) continue;
      const w = parseNum(m[1]);
      const h = parseNum(m[2]);
      if (w == null || h == null || w < 2000 || w > 7500 || h < 1500 || h > 3500) continue;
      return { matched: snippet(text, m.index, m[0].length), value: w, secondary: h };
    }
  }
  return null;
}

export function runQuantityChecks(files: ExtractedFile[]): QuantityCheck[] {
  return QTY_DEFS.map((def) => {
    for (const file of files) {
      for (const page of file.pages) {
        if (!page.text) continue;
        const r = runQtyOnPage(def, page.text);
        if (r) {
          return {
            kind: def.kind,
            label: def.label,
            unit: def.unit,
            found: true,
            matchedText: r.matched,
            parsedValue: r.value,
            parsedSecondary: r.secondary,
            fileName: file.fileName,
            pageNumber: page.pageNumber,
          };
        }
      }
    }
    return {
      kind: def.kind,
      label: def.label,
      unit: def.unit,
      found: false,
      matchedText: null,
      parsedValue: null,
      parsedSecondary: null,
      fileName: null,
      pageNumber: null,
    };
  });
}

/* ---------------------------- opening checks ----------------------------- */

const WIN_CTX =
  /(window|awning|casement|fixed|joinery|sliding\s+door|stacker|ranchslider|french\s+door|bifold)/i;
const DOOR_CTX = /(door|entry|hinged|cavity\s+slider|internal\s+door)/i;
const GARAGE_CTX = /(garage\s+door|sectional\s+door|tilt\s+door|roller\s+door)/i;
const PAIR_RE_G = /(\d{3,5})\s*[x×]\s*(\d{3,5})/g;
const BARE_DOOR_RE_G = /\b(710|760|810|860|910)\b/g;

function nearby(text: string, idx: number, len: number, pad = 60): string {
  const a = Math.max(0, idx - pad);
  const b = Math.min(text.length, idx + len + pad);
  return text.slice(a, b);
}

export function runOpeningChecks(files: ExtractedFile[], rowsCreated: number): OpeningDiagnostics {
  const candidates: OpeningCandidate[] = [];
  const seen = new Set<string>();
  let pairsFound = 0;
  let bareDoorsFound = 0;
  let ignored = 0;
  let duplicates = 0;

  for (const file of files) {
    for (const page of file.pages) {
      if (!page.text) continue;
      const text = page.text;

      PAIR_RE_G.lastIndex = 0;
      let pm: RegExpExecArray | null;
      while ((pm = PAIR_RE_G.exec(text)) != null) {
        pairsFound++;
        const w = Number(pm[1]);
        const h = Number(pm[2]);
        const ctx = nearby(text, pm.index, pm[0].length);
        const sizeOk = w >= 400 && w <= 7500 && h >= 400 && h <= 3500;
        const ctxOk = WIN_CTX.test(ctx) || DOOR_CTX.test(ctx) || GARAGE_CTX.test(ctx);

        let kindGuess = "unknown_opening";
        let confidence: "high" | "mid" | "low" = "low";
        let reason = "";
        let included = false;

        if (!sizeOk) {
          reason = "Out of plausible opening size range";
          ignored++;
        } else if (!ctxOk) {
          reason = "No window/door/garage keyword nearby — likely a dimension callout";
          ignored++;
        } else {
          if (GARAGE_CTX.test(ctx) || (w >= 2000 && h >= 1800 && h <= 2400)) {
            kindGuess = "garage_door";
            confidence = "high";
          } else if (
            /sliding|stacker|ranchslider|bifold|french/i.test(ctx) &&
            w >= 1600 &&
            h >= 1900
          ) {
            kindGuess = "sliding_door";
            confidence = "mid";
          } else if (WIN_CTX.test(ctx)) {
            kindGuess = "window";
            confidence = "low";
          } else if (DOOR_CTX.test(ctx) && h >= 1900) {
            kindGuess = "external_door";
            confidence = "low";
          }
          const key = `${kindGuess}:${w}:${h}:${page.pageNumber}`;
          if (seen.has(key)) {
            duplicates++;
            reason = "Duplicate of earlier match on same page";
          } else {
            seen.add(key);
            included = true;
            reason = "Included as draft opening";
          }
        }

        if (candidates.length < 50) {
          candidates.push({
            rawText: ctx.replace(/\s+/g, " ").trim().slice(0, 200),
            parsedWidth: w,
            parsedHeight: h,
            kindGuess,
            confidence: included ? confidence : null,
            reason,
            fileName: file.fileName,
            pageNumber: page.pageNumber,
            included,
          });
        }
      }

      BARE_DOOR_RE_G.lastIndex = 0;
      let dm: RegExpExecArray | null;
      while ((dm = BARE_DOOR_RE_G.exec(text)) != null) {
        bareDoorsFound++;
        const w = Number(dm[1]);
        const ctx = nearby(text, dm.index, dm[0].length, 40);
        let included = false;
        let reason = "";
        if (!DOOR_CTX.test(ctx)) {
          reason = "Bare width but no door keyword nearby";
          ignored++;
        } else if (/[x×]\s*\d/.test(ctx.slice(Math.max(0, ctx.length / 2 - 6)))) {
          reason = "Already part of a width × height pair";
          ignored++;
        } else {
          const key = `internal_door:${w}:0:${page.pageNumber}`;
          if (seen.has(key)) {
            duplicates++;
            reason = "Duplicate of earlier internal-door match";
          } else {
            seen.add(key);
            included = true;
            reason = "Included as internal door (low confidence)";
          }
        }
        if (candidates.length < 50) {
          candidates.push({
            rawText: ctx.replace(/\s+/g, " ").trim().slice(0, 200),
            parsedWidth: w,
            parsedHeight: null,
            kindGuess: included ? "internal_door" : "unknown_opening",
            confidence: included ? "low" : null,
            reason,
            fileName: file.fileName,
            pageNumber: page.pageNumber,
            included,
          });
        }
      }
    }
  }

  return {
    pairsFound,
    bareDoorsFound,
    ignored,
    duplicatesRemoved: duplicates,
    rowsCreated,
    candidates,
  };
}

/* ----------------------------- outcome rule ------------------------------ */

export function deriveOutcome(args: {
  fileCount: number;
  pagesWithText: number;
  pagesWithoutText: number;
  quantityMatchCount: number;
  openingMatchCount: number;
  moduleRowsInserted: number;
  errorsCount: number;
}): { outcome: TakeoffDiagnostics["outcome"]; outcomeMessage: string } {
  if (args.fileCount === 0) {
    return { outcome: "no_files", outcomeMessage: "No uploaded files found for this job." };
  }
  if (args.pagesWithText === 0) {
    return {
      outcome: "no_readable_text",
      outcomeMessage:
        "No PDF text layer was detected. Automatic text takeoff cannot run on these files. Use manual measurement tools or upload a text-based PDF.",
    };
  }
  if (args.errorsCount > 0 && args.moduleRowsInserted === 0) {
    return {
      outcome: "errors",
      outcomeMessage:
        "Errors occurred while processing files. See the diagnostics panel for details.",
    };
  }
  const partial = args.pagesWithoutText > 0;
  if (args.quantityMatchCount === 0 && args.openingMatchCount === 0) {
    return {
      outcome: partial ? "partial_readable_text_no_matches" : "readable_text_no_matches",
      outcomeMessage: partial
        ? "Some pages have no readable text. The pages that do have text did not match any known quantity or opening labels."
        : "Readable text was found, but no labelled quantities or openings matched the takeoff patterns.",
    };
  }
  if (args.moduleRowsInserted === 0) {
    return {
      outcome: "matches_no_module_rows",
      outcomeMessage:
        "Quantities or openings were detected but no module review rows were created. Check errors for insert/database failures.",
    };
  }
  return { outcome: "ok", outcomeMessage: "Module review rows created successfully." };
}

/* --------------------------- spec checks ---------------------------- */

/**
 * Runs specification extraction across every file (not only files marked
 * file_type=specification — schedules can appear in plan PDFs too) and
 * reports each detected schedule row as a diagnostic check. `created`
 * indicates whether a corresponding module_items row was inserted/refreshed
 * by the populator (set by the caller after persistence).
 */
export function runSpecChecks(files: ExtractedFile[]): SpecCheck[] {
  // Force-run extractor on every file regardless of fileType so we surface
  // findings in the diagnostics panel.
  const all: SpecCheck[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const fakeAsSpec: ExtractedFile = { ...f, fileType: "specification" };
    const rows = extractSpecRowsFromFile(fakeAsSpec);
    for (const r of rows) {
      const key = `${r.moduleId}|${r.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({
        moduleId: r.moduleId,
        label: r.label,
        found: true,
        matchedText: r.evidence,
        parsedValue: r.value,
        fileName: r.fileName,
        pageNumber: r.page,
        rowCreated: false,
        confidence: r.confidence,
      });
    }
  }
  return all;
}
