/**
 * Phase A — Specification schedule extractor.
 *
 * Pulls schedule-style rows from readable QS / specification PDFs and maps
 * them to module draft rows. Values may be numeric (e.g. "Cat 6 data points 2")
 * or textual (e.g. "Exterior Cladding Type 1 Brick - 70 series").
 *
 * Every row carries source_evidence and is marked review_required. "As per
 * plan" entries are kept as low-confidence text rows so the user knows the
 * spec is deferring to the floorplan.
 */
import type { IQModuleId } from "@/lib/iq-modules";
import type { ExtractedFile } from "./pdf-text";

export type SpecRow = {
  moduleId: IQModuleId;
  label: string;
  unit: string;
  value: string;          // text — numbers are rendered as decimal strings
  evidence: string;
  page: number;
  fileId: string;
  fileName: string;
  confidence: "high" | "mid" | "low";
  dataSource: "Uploaded Specification Text";
  note: string | null;
};

type SpecDef = {
  moduleId: IQModuleId;
  label: string;
  unit: string;
  patterns: RegExp[];
  /** Approximate captured-segment length to keep on the row. */
  maxValueLen?: number;
};

/* ----------------------------- definitions ------------------------------ */

const NUM = "\\d{1,4}(?:,\\d{3})*(?:\\.\\d{1,3})?";

/**
 * Schedule-style "Label  Value" patterns. The label part anchors at a
 * boundary; the value part is captured up to the end of the line or a
 * delimiter and trimmed by the caller.
 *
 * Each entry maps directly to a draft module row.
 */
const SPEC_DEFS: SpecDef[] = [
  // Geometry
  { moduleId: "iq-core",     label: "Area Over Frame",        unit: "m²", patterns: [new RegExp(`area\\s+over\\s+frame[:\\s]+(${NUM})\\s*(?:m²|m2|sqm|sq\\s*m)?`, "i")] },
  { moduleId: "iq-core",     label: "Total Area",             unit: "m²", patterns: [new RegExp(`total\\s+area[:\\s]+(${NUM})\\s*(?:m²|m2|sqm|sq\\s*m)?`, "i")] },
  { moduleId: "iq-core",     label: "Additional Coverage",    unit: "m²", patterns: [new RegExp(`additional\\s+coverage[:\\s]+(${NUM})\\s*(?:m²|m2)?`, "i")] },
  { moduleId: "iq-core",     label: "Coverage Area",          unit: "m²", patterns: [new RegExp(`coverage\\s+area[:\\s]+(${NUM})\\s*(?:m²|m2)?`, "i")] },
  { moduleId: "iq-core",     label: "Perimeter",              unit: "lm", patterns: [new RegExp(`perimeter[:\\s]+(${NUM})\\s*(?:lm|m|metres?)?`, "i")] },
  { moduleId: "iq-core",     label: "Plan Version",           unit: "",   patterns: [/plan\s+version[:\s]+([A-Za-z0-9 .\-_/]{1,40})/i], maxValueLen: 40 },

  // Roof / structure
  { moduleId: "iq-roofing",  label: "Roof Pitch",             unit: "°",  patterns: [/main\s+roof\s+pitch[:\s]+(\d{1,2}(?:\.\d)?)\s*(?:°|deg|degrees?)?/i, /\broof\s+pitch[:\s]+(\d{1,2}(?:\.\d)?)\s*(?:°|deg|degrees?)?/i] },
  { moduleId: "iq-framing",  label: "Stud Height",            unit: "m",  patterns: [/stud\s+height(?:\s+ground\s+floor)?[:\s]+(\d(?:\.\d{1,2})?)\s*m\b/i, /stud\s+height(?:\s+ground\s+floor)?[:\s]+(\d{4})\s*mm\b/i] },
  { moduleId: "iq-framing",  label: "Foundation Type",        unit: "",   patterns: [/foundation(?:\s+type)?[:\s]+([A-Za-z0-9 ,.\-/]{2,60})/i], maxValueLen: 60 },
  { moduleId: "iq-framing",  label: "Concrete MPa",           unit: "MPa",patterns: [/concrete[:\s]+(\d{2})\s*mpa/i, /(\d{2})\s*mpa\b/i] },
  { moduleId: "iq-framing",  label: "Wind Zone",              unit: "",   patterns: [/wind\s+zone[:\s]+([A-Za-z0-9 \-]{1,30})/i], maxValueLen: 30 },
  { moduleId: "iq-roofing",  label: "Roof Type",              unit: "",   patterns: [/roof\s+type[:\s]+([A-Za-z0-9 ,.\-/]{2,60})/i], maxValueLen: 60 },
  { moduleId: "iq-roofing",  label: "Roof Profile",           unit: "",   patterns: [/roof\s+profile[:\s]+([A-Za-z0-9 ,.\-/]{2,60})/i], maxValueLen: 60 },

  // Exterior / cladding
  { moduleId: "iq-cladding", label: "Exterior Cladding Type", unit: "",   patterns: [/exterior\s+cladding\s+type(?:\s*\d)?[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i], maxValueLen: 80 },
  { moduleId: "iq-cladding", label: "Cladding Area",          unit: "m²", patterns: [new RegExp(`cladding\\s+area[:\\s]+(${NUM})\\s*(?:m²|m2)?`, "i")] },
  { moduleId: "iq-cladding", label: "Garage Door",            unit: "",   patterns: [/garage\s+door[:\s]+(\d(?:\.\d)?\s*m\s*[x×]\s*\d(?:\.\d)?\s*m)/i, /garage\s+door[:\s]+(\d{3,5}\s*[x×]\s*\d{3,5})/i], maxValueLen: 30 },
  { moduleId: "iq-cladding", label: "Front Door",             unit: "",   patterns: [/front\s+door[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i], maxValueLen: 80 },
  { moduleId: "iq-cladding", label: "Window Head Rule",       unit: "",   patterns: [/window\s+heads?[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i], maxValueLen: 80 },
  { moduleId: "iq-cladding", label: "Sills",                  unit: "",   patterns: [/\bsills?[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i], maxValueLen: 80 },
  { moduleId: "iq-cladding", label: "Soffit",                 unit: "",   patterns: [/soffit(?:\s+lining)?[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i], maxValueLen: 80 },
  { moduleId: "iq-cladding", label: "Fascia",                 unit: "",   patterns: [/\bfascia[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i], maxValueLen: 80 },
  { moduleId: "iq-cladding", label: "Spouting",               unit: "",   patterns: [/\bspouting[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i], maxValueLen: 80 },
  { moduleId: "iq-cladding", label: "Downpipes",              unit: "",   patterns: [/\bdownpipes?[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i], maxValueLen: 80 },

  // Interior linings
  { moduleId: "iq-linings",  label: "General Ceiling Linings",          unit: "", patterns: [/general\s+ceiling\s+linings?[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i], maxValueLen: 100 },
  { moduleId: "iq-linings",  label: "Bathroom / Ensuite Ceiling Linings", unit: "", patterns: [/bathroom(?:\s*\/?\s*ensuite)?\s+ceiling\s+linings?[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i], maxValueLen: 100 },
  { moduleId: "iq-linings",  label: "General Wall Linings",             unit: "", patterns: [/general\s+wall\s+linings?[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i], maxValueLen: 100 },
  { moduleId: "iq-linings",  label: "Bathroom / Ensuite Wall Linings",  unit: "", patterns: [/bathroom(?:\s*\/?\s*ensuite)?\s+wall\s+linings?[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i], maxValueLen: 100 },
  { moduleId: "iq-linings",  label: "Garage Walls",                     unit: "", patterns: [/garage\s+walls?[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i], maxValueLen: 100 },
  { moduleId: "iq-linings",  label: "Skirting",                         unit: "", patterns: [/\bskirting[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i], maxValueLen: 100 },
  { moduleId: "iq-linings",  label: "Scotia",                           unit: "", patterns: [/\bscotia[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i], maxValueLen: 120 },
  { moduleId: "iq-linings",  label: "Door Architraves",                 unit: "", patterns: [/door\s+architraves?[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i], maxValueLen: 100 },
  { moduleId: "iq-linings",  label: "Window Architraves",               unit: "", patterns: [/window\s+architraves?[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i], maxValueLen: 100 },
  { moduleId: "iq-linings",  label: "Interior Door Height",             unit: "", patterns: [/interior\s+door\s+height[:\s]+([A-Za-z0-9 ,.\-/]{2,40})/i], maxValueLen: 40 },
  { moduleId: "iq-linings",  label: "Cavity Sliders",                   unit: "qty", patterns: [/cavity\s+sliders?[:\s]+(\d{1,3}|[A-Za-z0-9 ,.\-/]{2,40})/i], maxValueLen: 40 },

  // Electrical
  { moduleId: "iq-electrical", label: "Double Power Points",   unit: "qty", patterns: [/double\s+power\s+points?[:\s]+(?:x\s*)?(\d{1,3})/i] },
  { moduleId: "iq-electrical", label: "Single Power Points",   unit: "qty", patterns: [/single\s+power\s+points?[:\s]+(?:x\s*)?(\d{1,3})/i] },
  { moduleId: "iq-electrical", label: "Cat 6 Data Points",     unit: "qty", patterns: [/cat\s*6\s+data\s+points?[:\s]+(?:x\s*)?(\d{1,3})/i] },
  { moduleId: "iq-electrical", label: "Floor TV",              unit: "qty", patterns: [/floor\s+tv[:\s]+(?:x\s*)?(\d{1,3}|[A-Za-z0-9 ,.\-/]{2,30})/i], maxValueLen: 30 },
  { moduleId: "iq-electrical", label: "Wall Mounted TV",       unit: "qty", patterns: [/wall\s*[- ]?mounted\s+tv[:\s]+(?:x\s*)?(\d{1,3}|[A-Za-z0-9 ,.\-/]{2,30})/i], maxValueLen: 30 },
  { moduleId: "iq-electrical", label: "HDMI Cable",            unit: "qty", patterns: [/hdmi\s+cable[:\s]+(?:x\s*)?(\d{1,3}|[A-Za-z0-9 ,.\-/]{2,40})/i], maxValueLen: 40 },
  { moduleId: "iq-electrical", label: "Recessed TV Box",       unit: "qty", patterns: [/recessed\s+tv\s+box[:\s]+(?:x\s*)?(\d{1,3}|[A-Za-z0-9 ,.\-/]{2,40})/i], maxValueLen: 40 },
  { moduleId: "iq-electrical", label: "Smoke Detectors",       unit: "qty", patterns: [/smoke\s+detectors?[:\s]+(?:x\s*)?(\d{1,3})/i] },
  { moduleId: "iq-electrical", label: "Exterior Plugs",        unit: "qty", patterns: [/exterior\s+plugs?[:\s]+(?:x\s*)?(\d{1,3}|[A-Za-z0-9 ,.\-/]{2,40})/i], maxValueLen: 40 },
  { moduleId: "iq-electrical", label: "Downlights",            unit: "",    patterns: [/\bdownlights?[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i], maxValueLen: 100 },
  { moduleId: "iq-electrical", label: "Garage Lighting",       unit: "",    patterns: [/garage\s+lighting[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i], maxValueLen: 100 },
  { moduleId: "iq-electrical", label: "Kitchen Island Lighting", unit: "",  patterns: [/kitchen\s+island\s+lighting[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i], maxValueLen: 100 },
  { moduleId: "iq-electrical", label: "Security Lighting",     unit: "",    patterns: [/security\s+lighting[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i], maxValueLen: 100 },
  { moduleId: "iq-electrical", label: "Outdoor Lighting",      unit: "",    patterns: [/outdoor\s+lighting[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i], maxValueLen: 100 },

  // Plumbing
  { moduleId: "iq-plumbing", label: "Toilets",                 unit: "qty", patterns: [/\btoilets?[:\s]+(?:x\s*)?(\d{1,2})/i] },
  { moduleId: "iq-plumbing", label: "Vanities",                unit: "qty", patterns: [/\bvanities?[:\s]+(?:x\s*)?(\d{1,2}|[A-Za-z0-9 ,.\-/]{2,60})/i], maxValueLen: 60 },
  { moduleId: "iq-plumbing", label: "Showers",                 unit: "qty", patterns: [/\bshowers?[:\s]+(?:x\s*)?(\d{1,2}|[A-Za-z0-9 ,.\-/]{2,60})/i], maxValueLen: 60 },
  { moduleId: "iq-plumbing", label: "Baths",                   unit: "qty", patterns: [/\bbaths?[:\s]+(?:x\s*)?(\d{1,2}|[A-Za-z0-9 ,.\-/]{2,60})/i], maxValueLen: 60 },
  { moduleId: "iq-plumbing", label: "Extractor Fans",          unit: "qty", patterns: [/extractor\s+fans?[:\s]+(?:x\s*)?(\d{1,2})/i] },
  { moduleId: "iq-plumbing", label: "Towel Rails",             unit: "qty", patterns: [/towel\s+rails?[:\s]+(?:x\s*)?(\d{1,2}|[A-Za-z0-9 ,.\-/]{2,60})/i], maxValueLen: 60 },
  { moduleId: "iq-plumbing", label: "Exterior Taps",           unit: "qty", patterns: [/exterior\s+taps?[:\s]+(?:x\s*)?(\d{1,2})/i] },
  { moduleId: "iq-plumbing", label: "Hot Water Cylinder",      unit: "",    patterns: [/hot\s+water\s+cylinder[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i], maxValueLen: 80 },
  { moduleId: "iq-plumbing", label: "Kitchen Sink",            unit: "",    patterns: [/kitchen\s+sink[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i], maxValueLen: 80 },
  { moduleId: "iq-plumbing", label: "Dishwasher",              unit: "",    patterns: [/\bdishwasher[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i], maxValueLen: 80 },
  { moduleId: "iq-plumbing", label: "Waste Disposal",          unit: "",    patterns: [/waste\s+disposal[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i], maxValueLen: 80 },
  { moduleId: "iq-plumbing", label: "Rangehood",               unit: "",    patterns: [/\brangehood[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i], maxValueLen: 80 },
  { moduleId: "iq-plumbing", label: "Oven",                    unit: "",    patterns: [/\boven[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i], maxValueLen: 80 },
  { moduleId: "iq-plumbing", label: "Cooktop",                 unit: "",    patterns: [/\bcooktop[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i], maxValueLen: 80 },
  { moduleId: "iq-plumbing", label: "Laundry Tub",             unit: "",    patterns: [/laundry\s+tub[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i], maxValueLen: 80 },
];

/* ----------------------------- helpers ---------------------------------- */

function snippet(text: string, idx: number, len: number, pad = 24): string {
  const a = Math.max(0, idx - pad);
  const b = Math.min(text.length, idx + len + pad);
  return text.slice(a, b).replace(/\s+/g, " ").trim();
}

function trimValue(raw: string, maxLen: number): string {
  let v = raw.replace(/\s+/g, " ").trim();
  // Stop at the next obvious label-like break.
  const cut = v.search(/\s{2,}|\s+(?:Roof|Stud|Area|Perimeter|Wall|Ceiling|Skirting|Scotia|Architraves?|Cladding|Garage|Window|Door|Soffit|Fascia|Spouting|Downpipes?|Toilets?|Vanities|Showers|Baths|Cat\s*6)\b/i);
  if (cut > 6) v = v.slice(0, cut);
  if (v.length > maxLen) v = v.slice(0, maxLen);
  return v.replace(/[\s,.;:]+$/g, "").trim();
}

const AS_PER_PLAN_RE = /as\s+per\s+plan/i;

/* ----------------------------- public API ------------------------------- */

export function extractSpecRowsFromFile(file: ExtractedFile): SpecRow[] {
  if (file.fileType !== "specification") return [];
  const rows: SpecRow[] = [];
  const seen = new Set<string>(); // moduleId|label — first occurrence wins

  for (const page of file.pages) {
    const text = page.text;
    if (!text) continue;

    for (const def of SPEC_DEFS) {
      const key = `${def.moduleId}|${def.label}`;
      if (seen.has(key)) continue;
      for (const pat of def.patterns) {
        const m = text.match(pat);
        if (!m || m.index == null || !m[1]) continue;
        const rawValue = m[1];
        const value = trimValue(rawValue, def.maxValueLen ?? 80);
        if (!value) continue;

        // Detect "as per plan" deferral immediately around the match.
        const around = snippet(text, m.index, m[0].length, 80);
        const isAsPerPlan = AS_PER_PLAN_RE.test(around);
        const finalValue = isAsPerPlan ? "As per plan" : value;

        // Confidence rule: clean numeric integer/decimal => mid;
        // text value => mid; "as per plan" => low.
        const confidence: SpecRow["confidence"] = isAsPerPlan ? "low" : "mid";

        rows.push({
          moduleId: def.moduleId,
          label: def.label,
          unit: def.unit,
          value: finalValue,
          evidence: `${def.label} — ${snippet(text, m.index, m[0].length)}`,
          page: page.pageNumber,
          fileId: file.fileId,
          fileName: file.fileName,
          confidence,
          dataSource: "Uploaded Specification Text",
          note: isAsPerPlan ? "Requires plan review." : null,
        });
        seen.add(key);
        break;
      }
    }
  }
  return rows;
}
