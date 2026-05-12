/**
 * Phase A — Specification schedule extractor.
 *
 * Pulls ALL schedule-style rows from Jennian QS / specification PDFs and maps
 * them to module draft rows. Covers every item in the Jennian standard spec:
 * geometry, structure, roofing, exterior cladding, joinery, insulation,
 * interior linings, doors, plumbing, electrical, decoration, floor coverings,
 * heating, and exterior works.
 *
 * Every row carries source_evidence and is marked review_required. "As per
 * plan" entries are kept as low-confidence text rows so the user knows the
 * spec is deferring to the floorplan.
 *
 * IMPORTANT: This extractor must always run on the specification PDF — it is
 * the single source of truth for all non-geometric job data. Never skip it.
 */
import type { IQModuleId } from "@/lib/iq-modules";
import type { ExtractedFile } from "./pdf-text";

export type SpecRow = {
  moduleId: IQModuleId;
  label: string;
  unit: string;
  value: string;
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
  maxValueLen?: number;
};

const NUM = "\\d{1,4}(?:,\\d{3})*(?:\\.\\d{1,3})?";

const SPEC_DEFS: SpecDef[] = [
  // ── GEOMETRY ──────────────────────────────────────────────────────────────
  {
    moduleId: "iq-core",
    label: "Area Over Frame",
    unit: "m²",
    patterns: [new RegExp(`area\\s+over\\s+frame[:\\s]+(${NUM})\\s*(?:m²|m2|sqm|sq\\s*m)?`, "i")],
  },
  {
    moduleId: "iq-core",
    label: "Total Area",
    unit: "m²",
    patterns: [new RegExp(`total\\s+area[:\\s]+(${NUM})\\s*(?:m²|m2|sqm|sq\\s*m)?`, "i")],
  },
  {
    moduleId: "iq-core",
    label: "Additional Coverage",
    unit: "m²",
    patterns: [new RegExp(`additional\\s+coverage[:\\s]+(${NUM})\\s*(?:m²|m2)?`, "i")],
  },
  {
    moduleId: "iq-core",
    label: "Coverage Area",
    unit: "m²",
    patterns: [new RegExp(`coverage\\s+area[:\\s]+(${NUM})\\s*(?:m²|m2)?`, "i")],
  },
  {
    moduleId: "iq-core",
    label: "Perimeter",
    unit: "lm",
    patterns: [new RegExp(`perimeter[:\\s]+(${NUM})\\s*(?:lm|m|metres?)?`, "i")],
  },
  {
    moduleId: "iq-core",
    label: "Plan Version",
    unit: "",
    patterns: [/plan\s+version[:\s]+([A-Za-z0-9 .\-_/]{1,40})/i],
    maxValueLen: 40,
  },

  // ── STRUCTURE / FOUNDATION ────────────────────────────────────────────────
  {
    moduleId: "iq-framing",
    label: "Foundation Type",
    unit: "",
    patterns: [
      /foundation(?:\s+type)?[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i,
      /codemark\s+([A-Za-z0-9 ,.\-/]{2,60})/i,
    ],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-framing",
    label: "Concrete MPa",
    unit: "MPa",
    patterns: [/concrete[:\s]+(\d{2})\s*mpa/i, /(\d{2})\s*mpa\b/i],
  },
  {
    moduleId: "iq-framing",
    label: "Wind Zone",
    unit: "",
    patterns: [/wind\s+zone[:\s]+([A-Za-z0-9 -]{1,40})/i],
    maxValueLen: 40,
  },
  {
    moduleId: "iq-framing",
    label: "Exterior Framing",
    unit: "",
    patterns: [/exterior\s+framing[:\s]+([A-Za-z0-9 ,.\-/×x]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-framing",
    label: "Interior Framing",
    unit: "",
    patterns: [/interior\s+framing[:\s]+([A-Za-z0-9 ,.\-/×x]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-framing",
    label: "Stud Height",
    unit: "m",
    patterns: [
      /stud\s+height(?:\s+(?:ground|first|upper|lower)\s+floor)?[:\s]+(\d(?:\.\d{1,2})?)\s*m\b/i,
      /stud\s+height(?:\s+(?:ground|first|upper|lower)\s+floor)?[:\s]+(\d{4})\s*mm\b/i,
    ],
  },

  // ── ROOFING ───────────────────────────────────────────────────────────────
  {
    moduleId: "iq-roofing",
    label: "Roof Type",
    unit: "",
    patterns: [/\broof\b(?!\s+pitch|\s+profile|\s+plan|\s+space)[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-roofing",
    label: "Roof Profile",
    unit: "",
    patterns: [/roof\s+profile[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-roofing",
    label: "Roof Pitch",
    unit: "°",
    patterns: [
      /main\s+roof\s+pitch[:\s]+(\d{1,2}(?:\.\d)?)\s*(?:°|deg|degrees?)?/i,
      /roof\s+pitch[:\s]+(\d{1,2}(?:\.\d)?)\s*(?:°|deg|degrees?)?/i,
      /\bpitch[:\s]+(\d{1,2}(?:\.\d)?)\s*(?:°|deg|degrees?)/i,
    ],
  },
  {
    moduleId: "iq-roofing",
    label: "Ridge Type",
    unit: "",
    patterns: [/ridge\s+type[:\s]+([A-Za-z0-9 ,.\-/]{2,60})/i],
    maxValueLen: 60,
  },
  {
    moduleId: "iq-roofing",
    label: "Underlay",
    unit: "",
    patterns: [/\bunderlay[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },

  // ── EXTERIOR / CLADDING ───────────────────────────────────────────────────
  {
    moduleId: "iq-cladding",
    label: "Exterior Cladding Type 1",
    unit: "",
    patterns: [
      /exterior\s+cladding\s+type\s*1[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i,
      /exterior\s+cladding\s+type\s*one[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i,
    ],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-cladding",
    label: "Exterior Cladding Type 2",
    unit: "",
    patterns: [
      /exterior\s+cladding\s+type\s*2[:\s(]+([A-Za-z0-9 ,.\-/]{2,120})/i,
      /feature\s+cladding[:\s)]+([A-Za-z0-9 ,.\-/]{2,120})/i,
    ],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-cladding",
    label: "Cladding Area",
    unit: "m²",
    patterns: [new RegExp(`cladding\\s+area[:\\s]+(${NUM})\\s*(?:m²|m2)?`, "i")],
  },
  {
    moduleId: "iq-cladding",
    label: "Building Wrap",
    unit: "",
    patterns: [/building\s+wrap[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-cladding",
    label: "Fascia",
    unit: "",
    patterns: [/\bfascia[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-cladding",
    label: "Spouting",
    unit: "",
    patterns: [/\bspouting[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-cladding",
    label: "Spouting Profile",
    unit: "",
    patterns: [/spouting\s+profile[:\s]+([A-Za-z0-9 ,.\-/"]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-cladding",
    label: "Downpipes",
    unit: "",
    patterns: [/\bdownpipes?[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-cladding",
    label: "Soffit",
    unit: "",
    patterns: [/soffit(?:\s+lining)?[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-cladding",
    label: "Window Head Rule",
    unit: "",
    patterns: [/window\s+head[s]?[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-cladding",
    label: "Meter Box",
    unit: "",
    patterns: [/meter\s+box[:\s]+([A-Za-z0-9 ,.\-/]{2,60})/i],
    maxValueLen: 60,
  },

  // ── JOINERY / WINDOWS ─────────────────────────────────────────────────────
  {
    moduleId: "iq-cladding",
    label: "Garage Door",
    unit: "",
    patterns: [
      /garage\s+door[:\s]+(\d(?:\.\d)?\s*m\s*[x×]\s*\d(?:\.\d)?\s*m[A-Za-z0-9 ,.\-/]{0,80})/i,
      /garage\s+door[:\s]+([A-Za-z0-9 ,.\-/]{4,120})/i,
    ],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-cladding",
    label: "Garage Door Opener",
    unit: "",
    patterns: [/automatic\s+garage\s+door\s+opener[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-cladding",
    label: "Exterior Joinery",
    unit: "",
    patterns: [/exterior\s+aluminium\s+joinery[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-cladding",
    label: "Joinery Brand/Type",
    unit: "",
    patterns: [/\btype[:\s]+(miro|mana|guardian|smart|[A-Za-z]{3,20})\b/i],
    maxValueLen: 40,
  },
  {
    moduleId: "iq-cladding",
    label: "Flashing Colour",
    unit: "",
    patterns: [/flashing\s+colou?r[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-cladding",
    label: "Thermally Broken Joinery",
    unit: "",
    patterns: [/thermally\s+broken[:\s]+([A-Za-z0-9 ,.\-/]{2,60})/i],
    maxValueLen: 60,
  },
  {
    moduleId: "iq-cladding",
    label: "Low E Glazing",
    unit: "",
    patterns: [/low[\s-]?e(?:\s+max)?\s+glazing[:\s]+([A-Za-z0-9 ,.\-/]{2,60})/i],
    maxValueLen: 60,
  },
  {
    moduleId: "iq-cladding",
    label: "Bathroom Window Glazing",
    unit: "",
    patterns: [/bathroom\s*(?:&|and|\/)\s*ensuite\s+windows?[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-cladding",
    label: "Front Door",
    unit: "",
    patterns: [/front\s+door[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-cladding",
    label: "Front Door Hardware",
    unit: "",
    patterns: [/front\s+door\s+hardware[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-cladding",
    label: "Security Stays",
    unit: "",
    patterns: [/security\s+stays?[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-cladding",
    label: "Window Latches",
    unit: "",
    patterns: [/window\s+latches?[:\s]+([A-Za-z0-9 ,.\-/()]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-cladding",
    label: "Cat Door",
    unit: "",
    patterns: [/cat\s*(?:flap|door)[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },

  // ── INSULATION ────────────────────────────────────────────────────────────
  {
    moduleId: "iq-framing",
    label: "Ceiling Insulation",
    unit: "",
    patterns: [/ceiling\s+insulation[:\s]+([A-Za-z0-9 ,.\-/.]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-framing",
    label: "Ceiling Insulation R",
    unit: "R",
    patterns: [/ceiling\s+insulation[:\s]+.*?r\s*(\d(?:\.\d)?)/i],
  },
  {
    moduleId: "iq-framing",
    label: "Wall Insulation",
    unit: "",
    patterns: [/(?:exterior\s+)?wall\s+insulation[:\s]+([A-Za-z0-9 ,.\-/.]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-framing",
    label: "Wall Insulation R",
    unit: "R",
    patterns: [/wall\s+insulation[:\s]+.*?r\s*(\d(?:\.\d)?)/i],
  },

  // ── INTERIOR LININGS ──────────────────────────────────────────────────────
  {
    moduleId: "iq-linings",
    label: "General Ceiling Linings",
    unit: "",
    patterns: [/general\s+ceiling\s+linings?[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-linings",
    label: "Bathroom / Ensuite Ceiling Linings",
    unit: "",
    patterns: [
      /bathroom(?:\s*\/?\s*ensuite)?\s+ceiling\s+linings?[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i,
    ],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-linings",
    label: "Gib Stopping Level — Ceiling",
    unit: "",
    patterns: [/gib\s+stopping\s+to\s+ceiling[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-linings",
    label: "General Wall Linings",
    unit: "",
    patterns: [/general\s+wall\s+linings?[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-linings",
    label: "Bathroom / Ensuite Wall Linings",
    unit: "",
    patterns: [/bathroom(?:\s*\/?\s*ensuite)?\s+wall\s+linings?[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-linings",
    label: "Gib Stopping Level — Walls",
    unit: "",
    patterns: [/gibstopping\s+to\s+wall[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-linings",
    label: "External Gib Corner",
    unit: "",
    patterns: [/external\s+gib\s+corner[:\s]+([A-Za-z0-9 ,.\-/]{2,60})/i],
    maxValueLen: 60,
  },
  {
    moduleId: "iq-linings",
    label: "Garage Walls",
    unit: "",
    patterns: [/garage\s+walls?[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-linings",
    label: "Skirting",
    unit: "",
    patterns: [/\bskirting[:\s]+([A-Za-z0-9 ,.\-/×x]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-linings",
    label: "Scotia",
    unit: "",
    patterns: [/\bscotia[:\s]+([A-Za-z0-9 ,.\-/()]{2,160})/i],
    maxValueLen: 160,
  },

  // ── INTERIOR DOORS ────────────────────────────────────────────────────────
  {
    moduleId: "iq-linings",
    label: "Interior Doors",
    unit: "",
    patterns: [/interior\s+doors?[:\s]+([A-Za-z0-9 ,.\-/()]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-linings",
    label: "Interior Door Handles",
    unit: "",
    patterns: [/interior\s+door\s+handles?[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-linings",
    label: "Interior Door Stops",
    unit: "",
    patterns: [/interior\s+door\s+stops?[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-linings",
    label: "Privacy Sets",
    unit: "",
    patterns: [/privacy\s+sets?[:\s]+([A-Za-z0-9 ,.\-/&]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-linings",
    label: "Interior Door Height",
    unit: "",
    patterns: [/interior\s+door\s+height[:\s]+([A-Za-z0-9 ,.\-/]{2,40})/i],
    maxValueLen: 40,
  },
  {
    moduleId: "iq-linings",
    label: "Cavity Sliders",
    unit: "",
    patterns: [/cavity\s+sliders?[:\s]+(\d{1,3}|[A-Za-z0-9 ,.\-/]{2,60})/i],
    maxValueLen: 60,
  },
  {
    moduleId: "iq-linings",
    label: "Door Jambs",
    unit: "",
    patterns: [/door\s+jambs?[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-linings",
    label: "Door Architraves",
    unit: "",
    patterns: [/door\s+architraves?[:\s]+([A-Za-z0-9 ,.\-/×x]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-linings",
    label: "Window Jambs",
    unit: "",
    patterns: [/window\s+jambs?[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-linings",
    label: "Window Architraves",
    unit: "",
    patterns: [/window\s+architraves?[:\s]+([A-Za-z0-9 ,.\-/×x]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-linings",
    label: "Wardrobe Spec",
    unit: "",
    patterns: [
      /master\s+wardrobe[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i,
      /wardrobes?\s+to\s+bedrooms?[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i,
    ],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-linings",
    label: "Linen Cupboard",
    unit: "",
    patterns: [/linen\s+cupboard[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-linings",
    label: "Cupboards",
    unit: "",
    patterns: [/\bcupboards?[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },

  // ── PLUMBING ──────────────────────────────────────────────────────────────
  {
    moduleId: "iq-plumbing",
    label: "Water Supply Connection",
    unit: "",
    patterns: [/connection\s+to\s+town\s+water[:\s]+([A-Za-z0-9 ,.\-/]{2,40})/i],
    maxValueLen: 40,
  },
  {
    moduleId: "iq-plumbing",
    label: "Stormwater Connection",
    unit: "",
    patterns: [/connection\s+to\s+(?:town\s+)?stormwater[:\s]+([A-Za-z0-9 ,.\-/]{2,40})/i],
    maxValueLen: 40,
  },
  {
    moduleId: "iq-plumbing",
    label: "Sewer Connection",
    unit: "",
    patterns: [/connection\s+to\s+(?:town\s+)?sewer[:\s]+([A-Za-z0-9 ,.\-/]{2,40})/i],
    maxValueLen: 40,
  },
  {
    moduleId: "iq-plumbing",
    label: "Vanity Unit",
    unit: "",
    patterns: [/vanity\s+unit[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-plumbing",
    label: "Vanity Faucets",
    unit: "",
    patterns: [/vanity\s+faucets?[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-plumbing",
    label: "Mirror",
    unit: "",
    patterns: [/\bmirror[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-plumbing",
    label: "Shower",
    unit: "",
    patterns: [/\bshower[:\s]+([A-Za-z0-9 ,.\-/×x()]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-plumbing",
    label: "Shower Mixer",
    unit: "",
    patterns: [/shower\s+mixer[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-plumbing",
    label: "Shower Rose",
    unit: "",
    patterns: [/shower\s+rose[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-plumbing",
    label: "Extractor Fan",
    unit: "",
    patterns: [/extractor\s+fan[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-plumbing",
    label: "Towel Rail",
    unit: "",
    patterns: [/towel\s+(?:rail|warmer)[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-plumbing",
    label: "Toilet",
    unit: "",
    patterns: [/\btoilet[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-plumbing",
    label: "Toilet Roll Holder",
    unit: "",
    patterns: [/toilet\s+roll\s+holder[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-plumbing",
    label: "Exterior Taps",
    unit: "qty",
    patterns: [
      /exterior\s+taps?[:\s]+(\d{1,2})\s+exterior\s+taps?/i,
      /exterior\s+taps?[:\s]+(\d{1,2})/i,
    ],
  },
  {
    moduleId: "iq-plumbing",
    label: "Hot Water Cylinder",
    unit: "",
    patterns: [/hot\s+water\s+(?:cylinder|heating)[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-plumbing",
    label: "Kitchen Sink",
    unit: "",
    patterns: [/(?:kitchen\s+)?sink[:\s]+([A-Za-z0-9 ,.\-/½¼]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-plumbing",
    label: "Kitchen Tapware",
    unit: "",
    patterns: [/tapware[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-plumbing",
    label: "Dishwasher",
    unit: "",
    patterns: [/\bdishwasher[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-plumbing",
    label: "Rangehood",
    unit: "",
    patterns: [/\brangehood[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-plumbing",
    label: "Oven",
    unit: "",
    patterns: [/\boven[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-plumbing",
    label: "Cooktop",
    unit: "",
    patterns: [/\bcooktop[:\s]+([A-Za-z0-9 ,.\-/&]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-plumbing",
    label: "Laundry Tub",
    unit: "",
    patterns: [/laundry\s+tub[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-plumbing",
    label: "Waste Disposal",
    unit: "",
    patterns: [/waste\s+disposal[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-plumbing",
    label: "Fridge",
    unit: "",
    patterns: [/\bfridge[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-plumbing",
    label: "Kitchen Cabinetry Allowance",
    unit: "$",
    patterns: [
      new RegExp(`cabinetry\\s*(?:&|and)?\\s*benchtop\\s+allowance[:\\s]+\\$?(${NUM})`, "i"),
      new RegExp(`total\\s+kitchen\\s+pc\\s+sum[:\\s]+\\$?(${NUM})`, "i"),
    ],
  },
  {
    moduleId: "iq-plumbing",
    label: "Benchtop",
    unit: "",
    patterns: [/\bbenchtop[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },

  // ── ELECTRICAL ────────────────────────────────────────────────────────────
  {
    moduleId: "iq-electrical",
    label: "Double Power Points",
    unit: "qty",
    patterns: [/double\s+power\s+points?[:\s]+(?:x\s*)?(\d{1,3})/i],
  },
  {
    moduleId: "iq-electrical",
    label: "Single Power Points",
    unit: "qty",
    patterns: [/single\s+power\s+points?[:\s]+(?:x\s*)?(\d{1,3})/i],
  },
  {
    moduleId: "iq-electrical",
    label: "Cat 6 Data Points",
    unit: "qty",
    patterns: [/cat\s*6\s+data\s+points?[:\s]+(?:x\s*)?(\d{1,3})/i],
  },
  {
    moduleId: "iq-electrical",
    label: "Floor TV",
    unit: "qty",
    patterns: [/floor\s+tv[:\s]+(?:x\s*)?(\d{1,3})/i],
  },
  {
    moduleId: "iq-electrical",
    label: "Wall Mounted TV",
    unit: "qty",
    patterns: [/wall\s*[-]?\s*mounted\s+tv[:\s]+(?:x\s*)?(\d{1,3})/i],
  },
  {
    moduleId: "iq-electrical",
    label: "HDMI Cable",
    unit: "qty",
    patterns: [/hdmi\s+cable[:\s]+(?:x\s*)?(\d{1,3})/i],
  },
  {
    moduleId: "iq-electrical",
    label: "Recessed TV Box",
    unit: "qty",
    patterns: [/recessed\s+tv\s+box[:\s]+(?:x\s*)?(\d{1,3})/i],
  },
  {
    moduleId: "iq-electrical",
    label: "Smoke Detectors",
    unit: "",
    patterns: [/smoke\s+detectors?[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-electrical",
    label: "Exterior Plugs",
    unit: "",
    patterns: [/exterior\s+plugs?[:\s]+([A-Za-z0-9 ,.\-/×x]{2,60})/i],
    maxValueLen: 60,
  },
  {
    moduleId: "iq-electrical",
    label: "Mains Cable",
    unit: "",
    patterns: [/mains\s+cable[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-electrical",
    label: "Switch Plates",
    unit: "",
    patterns: [/switch\s+plates?[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-electrical",
    label: "Downlights",
    unit: "",
    patterns: [/\bdownlights?[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-electrical",
    label: "Vanity Lighting",
    unit: "",
    patterns: [/vanity\s+lighting[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-electrical",
    label: "Garage Lighting",
    unit: "",
    patterns: [/garage\s+lighting[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-electrical",
    label: "Kitchen Island Lighting",
    unit: "",
    patterns: [/kitchen\s+island\s+lighting[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-electrical",
    label: "Entrance Pendant",
    unit: "",
    patterns: [/entrance\s+pendant[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-electrical",
    label: "Security Lighting",
    unit: "",
    patterns: [/security\s+lighting[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-electrical",
    label: "Outdoor Lighting",
    unit: "",
    patterns: [/outdoor\s+lighting[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },
  {
    moduleId: "iq-electrical",
    label: "Attic Light",
    unit: "",
    patterns: [/attic\s+light[:\s]+([A-Za-z0-9 ,.\-/]{2,60})/i],
    maxValueLen: 60,
  },
  {
    moduleId: "iq-electrical",
    label: "Doorbell",
    unit: "",
    patterns: [/\bdoorbell[:\s]+([A-Za-z0-9 ,.\-/]{2,60})/i],
    maxValueLen: 60,
  },

  // ── HEATING / HVAC ────────────────────────────────────────────────────────
  {
    moduleId: "iq-electrical",
    label: "Heat Pump",
    unit: "",
    patterns: [
      /(?:home\s+)?heating[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i,
      /heat\s+pump[:\s]+([A-Za-z0-9 ,.\-/]{2,120})/i,
    ],
    maxValueLen: 120,
  },

  // ── DECORATION / PAINT ────────────────────────────────────────────────────
  {
    moduleId: "iq-linings",
    label: "Paint — Ceiling & Scotia",
    unit: "",
    patterns: [/ceiling\s+and\s+scotia[:\s]+([A-Za-z0-9 ,.\-/#]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-linings",
    label: "Paint — Walls",
    unit: "",
    patterns: [
      /\bwalls?[:\s]+((?:[A-Za-z0-9]+\s+){1,4}N\d{2}-\d{3}-\d{3}[A-Za-z0-9 ,.\-/]{0,80})/i,
    ],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-linings",
    label: "Paint — Exterior Cladding 1",
    unit: "",
    patterns: [/exterior\s+cladding\s+1[:\s]+([A-Za-z0-9 ,.\-/#]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-linings",
    label: "Paint — Exterior Cladding 2",
    unit: "",
    patterns: [/exterior\s+cladding\s+2[:\s]+([A-Za-z0-9 ,.\-/#]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-linings",
    label: "Paint — Soffits",
    unit: "",
    patterns: [/\bsoffits?[:\s]+([A-Za-z0-9 ,.\-/#]{2,120})/i],
    maxValueLen: 120,
  },

  // ── FLOOR COVERINGS ───────────────────────────────────────────────────────
  {
    moduleId: "iq-linings",
    label: "Floor — Bedrooms",
    unit: "",
    patterns: [/bedrooms?[:\s]+(?:carpet|vinyl|timber|concrete)[A-Za-z0-9 ,.\-/]{0,120}/i],
    maxValueLen: 140,
  },
  {
    moduleId: "iq-linings",
    label: "Floor — Lounge",
    unit: "",
    patterns: [/lounge[:\s]+(?:carpet|vinyl|timber|concrete)[A-Za-z0-9 ,.\-/]{0,120}/i],
    maxValueLen: 140,
  },
  {
    moduleId: "iq-linings",
    label: "Floor — Dining",
    unit: "",
    patterns: [/dining[:\s]+(?:carpet|vinyl|timber|concrete)[A-Za-z0-9 ,.\-/]{0,120}/i],
    maxValueLen: 140,
  },
  {
    moduleId: "iq-linings",
    label: "Floor — Kitchen",
    unit: "",
    patterns: [
      /kitchen(?:\/pantry)?[:\s]+(?:carpet|vinyl|timber|concrete)[A-Za-z0-9 ,.\-/]{0,120}/i,
    ],
    maxValueLen: 140,
  },
  {
    moduleId: "iq-linings",
    label: "Floor — Bathrooms",
    unit: "",
    patterns: [/bathrooms?[:\s]+(?:carpet|vinyl|timber|concrete|tile)[A-Za-z0-9 ,.\-/]{0,120}/i],
    maxValueLen: 140,
  },
  {
    moduleId: "iq-linings",
    label: "Floor — Hallways",
    unit: "",
    patterns: [/hall(?:way)?[:\s]+(?:carpet|vinyl|timber|concrete)[A-Za-z0-9 ,.\-/]{0,120}/i],
    maxValueLen: 140,
  },
  {
    moduleId: "iq-linings",
    label: "Carpet Underlay",
    unit: "",
    patterns: [/carpet\s+underlay[:\s]+([A-Za-z0-9 ,.\-/]{2,100})/i],
    maxValueLen: 100,
  },

  // ── EXTERIOR WORKS ────────────────────────────────────────────────────────
  {
    moduleId: "iq-core",
    label: "Driveway Area",
    unit: "m²",
    patterns: [new RegExp(`driveway[:\\s]+(${NUM})\\s*m2?`, "i")],
  },
  {
    moduleId: "iq-core",
    label: "Paths & Patios",
    unit: "m²",
    patterns: [new RegExp(`paths?\\s+and\\s+patios?(?:/decks?)?[:\\s]+(${NUM})\\s*m2?`, "i")],
  },
  {
    moduleId: "iq-core",
    label: "Fencing",
    unit: "",
    patterns: [/\bfencing[:\s]+([A-Za-z0-9 ,.\-/.%]{2,120})/i],
    maxValueLen: 120,
  },
  {
    moduleId: "iq-core",
    label: "Vehicle Crossing",
    unit: "",
    patterns: [/vehicle\s+crossing[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-core",
    label: "Letterbox",
    unit: "",
    patterns: [/\bletterbox[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
  {
    moduleId: "iq-core",
    label: "Clothesline",
    unit: "",
    patterns: [/clothesline[:\s]+([A-Za-z0-9 ,.\-/]{2,80})/i],
    maxValueLen: 80,
  },
];

// ── helpers ────────────────────────────────────────────────────────────────

function snippet(text: string, idx: number, len: number, pad = 24): string {
  const a = Math.max(0, idx - pad);
  const b = Math.min(text.length, idx + len + pad);
  return text.slice(a, b).replace(/\s+/g, " ").trim();
}

function trimValue(raw: string, maxLen: number): string {
  let v = raw.replace(/\s+/g, " ").trim();
  const cut = v.search(
    /\s{2,}|\s+(?:Roof|Stud|Area|Perimeter|Wall|Ceiling|Skirting|Scotia|Architraves?|Cladding|Garage|Window|Door|Soffit|Fascia|Spouting|Downpipes?|Toilets?|Vanities|Showers|Baths|Cat\s*6|Insulation|Heating|Flooring|Floor|Driveway|Fencing|Letterbox|Exterior|Interior|Building|Foundation|Concrete|Wind|Ridge|Underlay)\b/i,
  );
  if (cut > 6) v = v.slice(0, cut);
  if (v.length > maxLen) v = v.slice(0, maxLen);
  return v.replace(/[\s,.;:]+$/g, "").trim();
}

const AS_PER_PLAN_RE = /as\s+per\s+plan/i;

// ── public API ─────────────────────────────────────────────────────────────

export function extractSpecRowsFromFile(file: ExtractedFile): SpecRow[] {
  const rows: SpecRow[] = [];
  const seenLabels = new Set<string>();

  for (const page of file.pages) {
    const text = page.text ?? "";
    if (!text.trim()) continue;

    for (const def of SPEC_DEFS) {
      if (seenLabels.has(def.label)) continue;

      for (const pattern of def.patterns) {
        const m = pattern.exec(text);
        if (!m) continue;

        const raw = m[1] ?? "";
        const maxLen = def.maxValueLen ?? 60;
        const value = trimValue(raw, maxLen);
        if (!value || value.length < 1) continue;

        const isAsPerPlan = AS_PER_PLAN_RE.test(value);
        const confidence: "high" | "mid" | "low" = isAsPerPlan
          ? "low"
          : def.unit === "m²" ||
              def.unit === "lm" ||
              def.unit === "qty" ||
              def.unit === "MPa" ||
              def.unit === "R" ||
              def.unit === "$"
            ? "high"
            : "mid";

        rows.push({
          moduleId: def.moduleId,
          label: def.label,
          unit: def.unit,
          value,
          evidence: snippet(text, m.index, m[0].length),
          page: page.pageNumber,
          fileId: file.fileId,
          fileName: file.fileName,
          confidence,
          dataSource: "Uploaded Specification Text",
          note: isAsPerPlan ? "Value defers to floorplan — confirm from plan measurements." : null,
        });

        seenLabels.add(def.label);
        break;
      }
    }
  }

  return rows;
}
