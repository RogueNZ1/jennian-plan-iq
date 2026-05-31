/**
 * QS export library — writes job takeoff data into an IQ data sheet for
 * pasting into the Jennian master QS spreadsheet, and generates an Electrical
 * Schedule CSV for Laser Electrical.
 *
 * Uses the `xlsx` package (already in package.json) for spreadsheet operations.
 */
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { extractJobHeaderFromFile } from "@/lib/takeoff/extract-spec";
import type { ExtractedFile } from "@/lib/takeoff/pdf-text";
import type { MarkupDoorType } from "@/lib/takeoff/types";
import { normaliseRoomName } from "@/lib/takeoff/classify";
import { round2 } from "@/lib/takeoff/utils";
import { fieldFlags, type EnrichedTakeoff } from "@/lib/takeoff/enriched-takeoff";

type ModuleItemRow = Database["public"]["Tables"]["module_items"]["Row"];
type OpeningRow = Database["public"]["Tables"]["opening_schedule"]["Row"];

/* ------------------------------------------------------------------ types */

export type QSExportData = {
  jobNumber: string;
  clientName: string;
  address: string;
  templateId: string | null;
  createdAt: string;
  // Geometry
  floorAreaM2: number | null;
  perimeterLm: number | null;
  firstFloorAreaM2: number | null;
  studHeightMm: number | null;
  alfrescoAreaM2: number | null;
  // Roof / cladding / framing
  roofPitch: string | null;
  ridgeType: string | null;
  underlay: string | null;
  claddingType1: string | null;
  claddingType2: string | null;
  /** 1=brick/masonry only · 2=weatherboard/panel only · 3=mixed · null=unknown */
  claddingTypeCode?: number | null;
  /** Elevation extraction results for the ⑤ ELEVATION & SITE PLAN section */
  elevationSummary?: {
    roofType: string | null;
    roofPitchDegrees: number | null;
    externalDoorCount: number;
    gableEndCount: number;
    drivewayConcretM2: number | null;
    patioConcreteM2: number | null;
    totalConcreteM2: number | null;
    windowCountMatch: boolean | null;
    windowCountWarning: string | null;
  } | null;
  // Joinery windows (up to 10 rows)
  windows: Array<{ type: string; qty: number }>;
  // Garage doors (up to 6 rows)
  garageDoors: Array<{ type: string; qty: number }>;
  // Interior doors (up to 8 rows)
  interiorDoors: Array<{ type: string; qty: number }>;
  // Downpipes (up to 3 rows)
  downpipes: Array<{ size: string; qty: number }>;
  // Heating (up to 2 heat pump entries)
  heatPumps: Array<{ model: string; qty: number }>;
  // Extras / PC items (up to 6 rows)
  extras: Array<{ description: string; value: number }>;
  // Skylights (up to 4)
  skylights: Array<{ type: string; qty: number }>;

  // ---- New fields for revised build ----
  clientFirstName: string;
  clientSurname: string;
  streetAddress: string;
  addressLine2: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  jmwNumber: string;
  planVersion: string;
  exteriorWallLengthLm: number | null;
  exteriorWallHeightM: number | null;
  pathsPatioM2: number | null;
  drivewayM2: number | null;
  windowsByRoom: {
    bed1?: { cladding: string; qty: number; height: number; width: number };
    ensuite?: { cladding: string; qty: number; height: number; width: number };
    bed2?: { cladding: string; qty: number; height: number; width: number };
    bed3?: { cladding: string; qty: number; height: number; width: number };
    bed4?: { cladding: string; qty: number; height: number; width: number };
    toilet?: { cladding: string; qty: number; height: number; width: number };
    bathroom?: { cladding: string; qty: number; height: number; width: number };
    kitchen?: { cladding: string; qty: number; height: number; width: number };
    kitchenExtra?: { cladding: string; qty: number; height: number; width: number };
    familyLiving?: { cladding: string; qty: number; height: number; width: number };
    dining?: { cladding: string; qty: number; height: number; width: number };
    lounge?: { cladding: string; qty: number; height: number; width: number };
    garageWindow?: { cladding: string; qty: number; height: number; width: number };
    garageDoor1?: { cladding: string; qty: number; height: number; width: number };
    garageDoor2?: { cladding: string; qty: number; height: number; width: number };
    entrance?: { cladding: string; qty: number; height: number; width: number };
  };
  downpipesWhite: number;
  downpipesColourSteel: number;
  downpipesPvcColoured: number;
  garageDoor48x21Std: number;
  garageDoor48x21Insulated: number;
  garageDoor24x21Std: number;
  garageDoor24x21Insulated: number;
  garageDoor27x21Std: number;
  garageDoor27x21Insulated: number;
  intDoorStandard: number;
  intDoorUGroove: number;
  intDoorVGroove: number;
  intDoorBarnSlider: number;
  intDoorDouble: number;
  intDoorCavitySlider: number;
  ceilingHatch: number;
  atticStair: number;
  letterboxUrban: number;
  washingLine: number;
  heatPumpWallUnit: number;
  heatPumpDucted: number;
  specItems: Record<string, string>;
  /** Pre-loaded module_items rows — avoids a second DB query in writeIQDataSheetFull */
  moduleItems?: Array<{ module_id: string; label: string; extracted_value: string | null; approved_value: string | null; unit: string | null; value_source: string | null }>;
  /**
   * Convergence Slice 6 — per-field review flags carried over from the persisted enriched
   * takeoff (takeoff_runs.takeoff_json). Present (and surfaced in the .xlsx "Review Notes"
   * sheet + the review UI) only when an enriched takeoff exists AND it carries flags; absent
   * for pre-convergence jobs (relational fallback) → export is byte-identical to today.
   */
  reviewFlags?: Array<{ field: string; flags: string[] }>;
  /** Which source built the takeoff fields: the enriched takeoff_json, or the relational rows. */
  takeoffSource?: "enriched" | "relational";
};

export type ElectricalItem = {
  description: string;
  qty: number;
  unit: string;
  rate: number;
};

export type ElectricalSchedule = {
  jobNumber: string;
  clientName: string;
  address: string;
  floorAreaM2: number;
  lighting: ElectricalItem[];
  power: ElectricalItem[];
  communications: ElectricalItem[];
  mechanical: ElectricalItem[];
  totalEstimate: number;
};

/* -------------------------------------------------------------- data load */

/**
 * Convergence Slice 6 — load the canonical enriched takeoff (takeoff_runs.takeoff_json) for a
 * job's latest run. GRACEFUL + PERMANENT FALLBACK: returns null on ANY problem — the column
 * absent (pre-migration), no run row, a non-object payload, or any query error — so the caller
 * always falls back to the relational rows. `select("*")` is used deliberately: it never errors
 * on a column that does not exist yet, it simply omits it.
 */
export async function loadEnrichedTakeoffJson(jobId: string): Promise<EnrichedTakeoff | null> {
  try {
    const res = await supabase
      .from("takeoff_runs")
      .select("*")
      .eq("job_id", jobId)
      .order("started_at", { ascending: false })
      .limit(1);
    const row = res.data?.[0] as Record<string, unknown> | undefined;
    const tj = row?.["takeoff_json"];
    return tj && typeof tj === "object" ? (tj as EnrichedTakeoff) : null;
  } catch {
    return null;
  }
}

/**
 * Overlay the enriched takeoff onto a relational QSExportData base. When `enriched` is null
 * (every pre-convergence job) the base is returned UNCHANGED apart from a source tag — the
 * export is byte-identical to today (PERMANENT fallback, not a migration bridge). When present,
 * the converged takeoff VALUES win where they exist, and the per-field discrepancy flags are
 * attached for the .xlsx + review UI.
 */
export function applyEnrichedTakeoff(
  base: QSExportData,
  enriched: EnrichedTakeoff | null,
): QSExportData {
  if (!enriched) return { ...base, takeoffSource: "relational" };
  const perimeter = enriched.external_wall_lm.value;
  const studM = enriched.ceiling_height_m.value;
  return {
    ...base,
    floorAreaM2: enriched.floor_area_m2.value ?? base.floorAreaM2,
    perimeterLm: perimeter ?? base.perimeterLm,
    exteriorWallLengthLm: perimeter ?? base.exteriorWallLengthLm,
    alfrescoAreaM2: enriched.alfresco_area_m2.value ?? base.alfrescoAreaM2,
    studHeightMm: studM != null ? Math.round(studM * 1000) : base.studHeightMm,
    exteriorWallHeightM: studM ?? base.exteriorWallHeightM,
    reviewFlags: fieldFlags(enriched),
    takeoffSource: "enriched",
  };
}

export async function buildQSExportData(
  jobId: string,
  files?: ExtractedFile[],
): Promise<QSExportData> {
  const [jobRes, itemsRes, openingsRes, doorCountsRes] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", jobId).single(),
    supabase.from("module_items").select("*").eq("job_id", jobId),
    supabase.from("opening_schedule").select("*").eq("job_id", jobId),
    supabase.from("door_counts").select("*").eq("job_id", jobId).maybeSingle(),
  ]);

  if (jobRes.error) throw new Error(`Failed to load job: ${jobRes.error.message}`);
  if (itemsRes.error) throw new Error(`Failed to load module items: ${itemsRes.error.message}`);
  if (openingsRes.error) throw new Error(`Failed to load opening schedule: ${openingsRes.error.message}`);
  if (doorCountsRes.error) throw new Error(`Failed to load door counts: ${doorCountsRes.error.message}`);
  const job = jobRes.data;
  const items: ModuleItemRow[] = itemsRes.data ?? [];

  // Convergence Slice 6 — the canonical enriched takeoff (takeoff_json) is the PRIMARY source
  // when present; null for every pre-convergence job → relational fallback (overlay applied at
  // the return below).
  const enrichedJson = await loadEnrichedTakeoffJson(jobId);

  function getVal(label: string): string | null {
    const needle = label.toLowerCase();
    // Prefer exact label match to avoid collisions
    // (e.g. "wall length" matching both "external wall length" and "internal wall length").
    const exact = items.find((i: ModuleItemRow) => i.label?.toLowerCase() === needle);
    if (exact) return exact.extracted_value ?? null;
    const partial = items.find((i: ModuleItemRow) => i.label?.toLowerCase().includes(needle));
    return partial?.extracted_value ?? null;
  }

  function getNum(label: string): number | null {
    const v = getVal(label);
    if (!v) return null;
    // Strip commas (thousand separators) and any chars except digits, dot, minus.
    // Preserve a leading minus so negative values survive.
    const cleaned = v.replace(/,/g, "").replace(/[^\d.\-]/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }

  // Openings grouped
  const openings: OpeningRow[] = openingsRes.data ?? [];
  const windows = openings
    .filter((o: OpeningRow) => o.opening_type === "window")
    .map((o: OpeningRow) => ({ type: o.room_name ?? "Window", qty: o.quantity ?? 1 }));
  const garageDoors = openings
    .filter((o: OpeningRow) => o.opening_type === "garage_door")
    .map((o: OpeningRow) => ({ type: o.room_name ?? "Garage Door", qty: o.quantity ?? 1 }));
  const interiorDoors = openings
    .filter((o: OpeningRow) => o.opening_type === "interior_door")
    .map((o: OpeningRow) => ({ type: o.room_name ?? "Interior Door", qty: o.quantity ?? 1 }));
  const skylights = openings
    .filter((o: OpeningRow) => o.opening_type === "skylight")
    .map((o: OpeningRow) => ({ type: o.room_name ?? "Skylight", qty: o.quantity ?? 1 }));

  // Downpipes from items
  const downpipeItems = items.filter(
    (i: ModuleItemRow) => i.label?.toLowerCase().includes("downpipe"),
  );
  const downpipes = downpipeItems.map((i: ModuleItemRow) => ({
    size: i.extracted_value ?? "90mm",
    qty: parseFloat(i.extracted_value ?? "1") || 1,
  }));

  // Heat pumps from items
  const heatPumpItems = items.filter(
    (i: ModuleItemRow) =>
      i.label?.toLowerCase().includes("heat pump") ||
      i.label?.toLowerCase().includes("heating"),
  );
  const heatPumps = heatPumpItems.map((i: ModuleItemRow) => ({
    model: i.extracted_value ?? "Heat Pump",
    qty: 1,
  }));

  // PC / extra items
  const extraLabels = [
    "kitchen appliance",
    "dishwasher",
    "oven",
    "rangehood",
    "bathroom accessory",
    "towel rail",
    "mirror",
  ];
  const extras = items
    .filter((i: ModuleItemRow) =>
      extraLabels.some((l) => i.label?.toLowerCase().includes(l)),
    )
    .slice(0, 6)
    .map((i: ModuleItemRow) => ({
      description: i.label ?? "Extra",
      value: parseFloat(i.extracted_value ?? "0") || 0,
    }));

  // Merge job header from extracted files: Supabase > SMW > plans > fallback
  const smwHeader = files?.map(extractJobHeaderFromFile).find((h) => h.source === "smw");
  const plansHeader = files?.map(extractJobHeaderFromFile).find((h) => h.source === "plans");
  const resolvedClientName =
    (job.client_name as string | null) ??
    smwHeader?.clientName ??
    plansHeader?.clientName ??
    "";
  const resolvedAddress =
    (job.address as string | null) ??
    smwHeader?.addressLine1 ??
    plansHeader?.addressLine1 ??
    "";
  const resolvedJobNumber =
    (job.job_number as string | null) ??
    smwHeader?.jmwNumber ??
    plansHeader?.jobNumber ??
    jobId;

  // ---- New field population ----

  // Split client name into first/surname
  const nameParts = resolvedClientName.trim().split(/\s+/);
  const clientFirstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : "";
  const clientSurname = nameParts.length > 0 ? nameParts[nameParts.length - 1] : resolvedClientName;

  // Parse address into parts
  const addressParts = resolvedAddress.split(",").map((s) => s.trim());
  const streetAddress = addressParts[0] ?? resolvedAddress;
  const addressLine2 = addressParts[1] ?? null;
  const city = addressParts[2] ?? getVal("city") ?? null;

  // Contact info
  const email = getVal("email") ?? getVal("client email");
  const phone = getVal("phone") ?? getVal("mobile") ?? getVal("contact");

  // Plan version
  const planVersion = getVal("plan version") ?? "1";

  // Wall measurements
  const exteriorWallLengthLm =
    getNum("exterior wall length") ?? getNum("external wall length");

  // Wall height — module_items first, then plan_context stud height, then NZ default
  const planCtx = (job.plan_context ?? null) as { studHeightMm?: number } | null;
  let exteriorWallHeightM: number | null = getNum("wall height");
  if (exteriorWallHeightM === null) {
    const studH = getNum("stud height");
    if (studH !== null) {
      exteriorWallHeightM = studH > 10 ? studH / 1000 : studH;
    }
  }
  if (exteriorWallHeightM === null && planCtx?.studHeightMm) {
    exteriorWallHeightM = round2(planCtx.studHeightMm / 1000);
  }
  if (exteriorWallHeightM === null) {
    exteriorWallHeightM = 2.4;
  }

  // Concrete / exterior areas
  const pathsPatioM2 = getNum("paths") ?? getNum("patio") ?? getNum("concrete paths");
  const drivewayM2 = getNum("driveway");

  // Windows by room — match opening_schedule window openings by room_name keywords
  function matchWindowOpening(keywords: string[]): { cladding: string; qty: number; height: number; width: number } | undefined {
    const opening = openings.find((o: OpeningRow) => {
      if (o.opening_type !== "window") return false;
      const rn = normaliseRoomName(o.room_name ?? "").toLowerCase();
      return keywords.some((k) => rn.includes(k.toLowerCase()));
    });
    if (!opening) return undefined;
    return {
      cladding: opening.notes ?? "",
      qty: opening.quantity ?? 1,
      height: opening.height_mm != null ? opening.height_mm / 1000 : 1.2,
      width: opening.width_mm != null ? opening.width_mm / 1000 : 0.9,
    };
  }

  // Garage door openings by index
  const garageDoorOpenings = openings.filter((o: OpeningRow) => o.opening_type === "garage_door");
  function garageOpeningToEntry(o: OpeningRow | undefined): { cladding: string; qty: number; height: number; width: number } | undefined {
    if (!o) return undefined;
    return {
      cladding: o.notes ?? "",
      qty: o.quantity ?? 1,
      height: o.height_mm != null ? o.height_mm / 1000 : 2.1,
      width: o.width_mm != null ? o.width_mm / 1000 : 2.4,
    };
  }

  const windowsByRoom: QSExportData["windowsByRoom"] = {};
  const bed1 = matchWindowOpening(["bed 1", "bedroom 1", "master"]);
  if (bed1) windowsByRoom.bed1 = bed1;
  const ensuite = matchWindowOpening(["ensuite"]);
  if (ensuite) windowsByRoom.ensuite = ensuite;
  const bed2 = matchWindowOpening(["bed 2", "bedroom 2"]);
  if (bed2) windowsByRoom.bed2 = bed2;
  const bed3 = matchWindowOpening(["bed 3", "bedroom 3"]);
  if (bed3) windowsByRoom.bed3 = bed3;
  const bed4 = matchWindowOpening(["bed 4", "bedroom 4"]);
  if (bed4) windowsByRoom.bed4 = bed4;
  const toilet = matchWindowOpening(["toilet", "wc", "powder"]);
  if (toilet) windowsByRoom.toilet = toilet;
  const bathroom = matchWindowOpening(["bathroom", "bath"]);
  if (bathroom) windowsByRoom.bathroom = bathroom;

  // Kitchen — find first, then second if exists
  const kitchenOpenings = openings.filter((o: OpeningRow) => {
    if (o.opening_type !== "window") return false;
    const rn = (o.room_name ?? "").toLowerCase();
    return rn.includes("kitchen");
  });
  if (kitchenOpenings[0]) {
    const o = kitchenOpenings[0];
    windowsByRoom.kitchen = {
      cladding: o.notes ?? "",
      qty: o.quantity ?? 1,
      height: o.height_mm != null ? o.height_mm / 1000 : 1.2,
      width: o.width_mm != null ? o.width_mm / 1000 : 0.9,
    };
  }
  if (kitchenOpenings[1]) {
    const o = kitchenOpenings[1];
    windowsByRoom.kitchenExtra = {
      cladding: o.notes ?? "",
      qty: o.quantity ?? 1,
      height: o.height_mm != null ? o.height_mm / 1000 : 1.2,
      width: o.width_mm != null ? o.width_mm / 1000 : 0.9,
    };
  }

  const familyLiving = matchWindowOpening(["family", "living", "lounge/dining", "open plan"]);
  if (familyLiving) windowsByRoom.familyLiving = familyLiving;
  const dining = matchWindowOpening(["dining"]);
  if (dining) windowsByRoom.dining = dining;
  const lounge = matchWindowOpening(["lounge"]);
  if (lounge) windowsByRoom.lounge = lounge;
  const garageWindow = matchWindowOpening(["garage"]);
  if (garageWindow) windowsByRoom.garageWindow = garageWindow;
  const entrance = matchWindowOpening(["entrance", "entry", "foyer", "hall"]);
  if (entrance) windowsByRoom.entrance = entrance;

  // Garage door openings by index
  const gd1 = garageOpeningToEntry(garageDoorOpenings[0]);
  if (gd1) windowsByRoom.garageDoor1 = gd1;
  const gd2 = garageOpeningToEntry(garageDoorOpenings[1]);
  if (gd2) windowsByRoom.garageDoor2 = gd2;

  // Downpipes by type
  let downpipesWhite = 0;
  let downpipesColourSteel = 0;
  let downpipesPvcColoured = 0;

  const dpItems = items.filter((i: ModuleItemRow) => i.label?.toLowerCase().includes("downpipe"));
  if (dpItems.length > 0) {
    for (const item of dpItems) {
      const label = (item.label ?? "").toLowerCase();
      const qty = parseFloat(item.extracted_value ?? "0") || 0;
      if (label.includes("white")) {
        downpipesWhite += qty;
      } else if (label.includes("colour steel") || label.includes("colorsteel")) {
        downpipesColourSteel += qty;
      } else if (label.includes("pvc")) {
        downpipesPvcColoured += qty;
      } else {
        // No specific match, add to white as default
        downpipesWhite += qty;
      }
    }
  } else {
    // Use total from downpipes array
    const total = downpipes.reduce((s, d) => s + d.qty, 0);
    downpipesWhite = total;
  }

  // Garage door types by size/insulation
  let garageDoor48x21Std = 0;
  let garageDoor48x21Insulated = 0;
  let garageDoor24x21Std = 0;
  let garageDoor24x21Insulated = 0;
  let garageDoor27x21Std = 0;
  let garageDoor27x21Insulated = 0;

  const gdItems = items.filter((i: ModuleItemRow) => {
    const l = (i.label ?? "").toLowerCase();
    return l.includes("garage door") || l.includes("panel lift");
  });

  if (gdItems.length > 0) {
    for (const item of gdItems) {
      const label = (item.label ?? "").toLowerCase();
      const qty = parseFloat(item.extracted_value ?? "1") || 1;
      const insulated = label.includes("insulated");
      if (label.includes("4.8") || label.includes("48")) {
        if (insulated) garageDoor48x21Insulated += qty;
        else garageDoor48x21Std += qty;
      } else if (label.includes("2.7") || label.includes("27")) {
        if (insulated) garageDoor27x21Insulated += qty;
        else garageDoor27x21Std += qty;
      } else {
        // Default to 2.4
        if (insulated) garageDoor24x21Insulated += qty;
        else garageDoor24x21Std += qty;
      }
    }
  } else if (garageDoors.length > 0) {
    // Fall back: put count in standard 2.4
    garageDoor24x21Std = garageDoors.reduce((s, d) => s + d.qty, 0);
  }

  // Interior door types
  let intDoorStandard = 0;
  let intDoorUGroove = 0;
  let intDoorVGroove = 0;
  let intDoorBarnSlider = 0;
  let intDoorDouble = 0;
  let intDoorCavitySlider = 0;

  const idItems = items.filter((i: ModuleItemRow) => {
    const l = (i.label ?? "").toLowerCase();
    return l.includes("interior door") || l.includes("internal door");
  });

  if (idItems.length > 0) {
    for (const item of idItems) {
      const label = (item.label ?? "").toLowerCase();
      const qty = parseFloat(item.extracted_value ?? "1") || 1;
      if (label.includes("u groove") || label.includes("u-groove")) {
        intDoorUGroove += qty;
      } else if (label.includes("v groove") || label.includes("v-groove")) {
        intDoorVGroove += qty;
      } else if ((label.includes("barn") || label.includes("slider")) && !label.includes("cavity")) {
        intDoorBarnSlider += qty;
      } else if (label.includes("double")) {
        intDoorDouble += qty;
      } else if (label.includes("cavity")) {
        intDoorCavitySlider += qty;
      } else {
        intDoorStandard += qty;
      }
    }
  } else if (interiorDoors.length > 0) {
    // Fall back: put total in standard
    intDoorStandard = interiorDoors.reduce((s, d) => s + d.qty, 0);
  }

  // Carpentry extras
  const ceilingHatch = getNum("ceiling hatch") ?? 0;
  const atticStair = getNum("attic stair") ?? getNum("attic ladder") ?? 0;
  const letterboxUrban = getNum("letterbox") ?? 0;
  const washingLine = getNum("washing line") ?? 0;

  // Heating types
  let heatPumpWallUnit = 0;
  let heatPumpDucted = 0;

  const hpItems = items.filter((i: ModuleItemRow) => {
    const l = (i.label ?? "").toLowerCase();
    return l.includes("heat pump") || l.includes("heating");
  });

  if (hpItems.length > 0) {
    for (const item of hpItems) {
      const label = (item.label ?? "").toLowerCase();
      const qty = parseFloat(item.extracted_value ?? "1") || 1;
      if (label.includes("ducted")) {
        heatPumpDucted += qty;
      } else {
        heatPumpWallUnit += qty;
      }
    }
  } else if (heatPumps.length > 0) {
    heatPumpWallUnit = heatPumps.length;
  }

  // Door count override — when user has confirmed counts via DoorCountPanel, use those
  const confirmedCounts = doorCountsRes.data;
  if (confirmedCounts?.confirmed_at) {
    intDoorStandard = confirmedCounts.standard;
    intDoorDouble = confirmedCounts.double_doors;
    intDoorCavitySlider = confirmedCounts.cavity_sliders;
    intDoorBarnSlider = confirmedCounts.barn_sliders;
  }

  // All spec items as key-value
  const specItems: Record<string, string> = {};
  for (const item of items) {
    if (item.label) {
      specItems[item.label] = item.extracted_value ?? "";
    }
  }

  const perimeterLm = getNum("perimeter") ?? getNum("external perimeter");

  const base: QSExportData = {
    jobNumber: resolvedJobNumber,
    clientName: resolvedClientName,
    address: resolvedAddress,
    templateId: job.template ?? null,
    createdAt: job.created_at ?? new Date().toISOString(),
    floorAreaM2: getNum("floor area") ?? getNum("total area"),
    perimeterLm,
    firstFloorAreaM2: getNum("first floor") ?? getNum("upper floor"),
    studHeightMm: getNum("stud height"),
    alfrescoAreaM2: getNum("alfresco") ?? getNum("porch") ?? getNum("deck"),
    roofPitch: getVal("roof pitch"),
    ridgeType: getVal("ridge type") ?? getVal("ridge"),
    underlay: getVal("underlay"),
    claddingType1: getVal("cladding type 1") ?? getVal("exterior cladding type 1"),
    claddingType2: getVal("cladding type 2") ?? getVal("exterior cladding type 2"),
    windows: windows.slice(0, 10),
    garageDoors: garageDoors.slice(0, 6),
    interiorDoors: interiorDoors.slice(0, 8),
    downpipes: downpipes.slice(0, 3),
    heatPumps: heatPumps.slice(0, 2),
    extras: extras,
    skylights: skylights.slice(0, 4),
    // New fields
    clientFirstName,
    clientSurname,
    streetAddress,
    addressLine2,
    city,
    email,
    phone,
    jmwNumber: resolvedJobNumber,
    planVersion,
    exteriorWallLengthLm,
    exteriorWallHeightM,
    pathsPatioM2,
    drivewayM2,
    windowsByRoom,
    downpipesWhite,
    downpipesColourSteel,
    downpipesPvcColoured,
    garageDoor48x21Std,
    garageDoor48x21Insulated,
    garageDoor24x21Std,
    garageDoor24x21Insulated,
    garageDoor27x21Std,
    garageDoor27x21Insulated,
    intDoorStandard,
    intDoorUGroove,
    intDoorVGroove,
    intDoorBarnSlider,
    intDoorDouble,
    intDoorCavitySlider,
    ceilingHatch,
    atticStair,
    letterboxUrban,
    washingLine,
    heatPumpWallUnit,
    heatPumpDucted,
    specItems,
    moduleItems: items.map((i) => ({
      module_id: i.module_id ?? "",
      label: i.label ?? "",
      extracted_value: i.extracted_value ?? null,
      approved_value: i.approved_value ?? null,
      unit: i.unit ?? null,
      value_source: i.value_source ?? null,
    })),
  };

  // Convergence Slice 6 — enriched takeoff_json wins where present (values + flags); null →
  // relational base unchanged (byte-identical to today).
  return applyEnrichedTakeoff(base, enrichedJson);
}

/* -------------------------------------------------- electrical schedule */

const BASE_AREA_M2 = 165;

/**
 * Builds a scaled electrical schedule from 165m² base quantities.
 * All quantities are rounded to the nearest whole number.
 */
export function buildElectricalSchedule(data: QSExportData): ElectricalSchedule {
  const area = data.floorAreaM2 ?? BASE_AREA_M2;
  const sf = area / BASE_AREA_M2;
  const q = (base: number) => Math.round(base * sf);

  const lighting: ElectricalItem[] = [
    { description: "LED downlights — living/dining/kitchen", qty: q(14), unit: "ea", rate: 45 },
    { description: "LED downlights — bedrooms", qty: q(8), unit: "ea", rate: 45 },
    { description: "LED downlights — hallways", qty: q(4), unit: "ea", rate: 45 },
    { description: "LED downlights — bathrooms/ensuites", qty: q(4), unit: "ea", rate: 45 },
    { description: "Exterior coach lights", qty: q(4), unit: "ea", rate: 80 },
    { description: "Vanity light bar — bathrooms", qty: q(2), unit: "ea", rate: 120 },
    { description: "Attic/storage light", qty: 1, unit: "ea", rate: 45 },
    { description: "Dimmer switches", qty: q(6), unit: "ea", rate: 55 },
    { description: "Switching — single/double", qty: q(18), unit: "ea", rate: 30 },
  ];

  const power: ElectricalItem[] = [
    { description: "Double GPOs — living/dining", qty: q(6), unit: "ea", rate: 40 },
    { description: "Double GPOs — kitchen", qty: q(6), unit: "ea", rate: 40 },
    { description: "Double GPOs — bedrooms", qty: q(8), unit: "ea", rate: 40 },
    { description: "Double GPOs — bathrooms (shaver)", qty: q(2), unit: "ea", rate: 55 },
    { description: "Double GPOs — garage", qty: q(4), unit: "ea", rate: 40 },
    { description: "Stove/oven circuit — 32A", qty: 1, unit: "ea", rate: 180 },
    { description: "Dishwasher circuit", qty: 1, unit: "ea", rate: 85 },
    { description: "Rangehood connection", qty: 1, unit: "ea", rate: 65 },
    { description: "Washing machine circuit", qty: 1, unit: "ea", rate: 85 },
    { description: "Dryer circuit", qty: 1, unit: "ea", rate: 85 },
    { description: "Heat pump circuits (indoor + outdoor)", qty: data.heatPumps.length || q(1), unit: "ea", rate: 220 },
    { description: "Garage door operator circuit", qty: data.garageDoors.length || q(1), unit: "ea", rate: 95 },
    { description: "Hot water cylinder connection", qty: 1, unit: "ea", rate: 120 },
    { description: "Mains switchboard (100A)", qty: 1, unit: "ea", rate: 850 },
    { description: "Mains cable to boundary", qty: 1, unit: "lot", rate: 600 },
  ];

  const communications: ElectricalItem[] = [
    { description: "Cat 6 data points — living/office", qty: q(4), unit: "ea", rate: 60 },
    { description: "Cat 6 data points — bedrooms", qty: q(4), unit: "ea", rate: 60 },
    { description: "TV aerial points", qty: q(3), unit: "ea", rate: 75 },
    { description: "Network patch panel", qty: 1, unit: "ea", rate: 220 },
    { description: "Doorbell/video intercom", qty: 1, unit: "ea", rate: 180 },
    { description: "Smoke alarms (interconnected)", qty: q(3), unit: "ea", rate: 95 },
  ];

  const mechanical: ElectricalItem[] = [
    { description: "Bathroom exhaust fans", qty: q(2), unit: "ea", rate: 120 },
    { description: "Kitchen rangehood power point", qty: 1, unit: "ea", rate: 40 },
    { description: "Heated towel rail connections", qty: q(2), unit: "ea", rate: 75 },
  ];

  const allItems = [...lighting, ...power, ...communications, ...mechanical];
  const totalEstimate = allItems.reduce((s, i) => s + i.qty * i.rate, 0);

  return {
    jobNumber: data.jobNumber,
    clientName: data.clientName,
    address: data.address,
    floorAreaM2: area,
    lighting,
    power,
    communications,
    mechanical,
    totalEstimate,
  };
}

export function electricalScheduleToCSV(schedule: ElectricalSchedule): string {
  const rows: string[] = [];

  rows.push(`Jennian Electrical Schedule — Laser Electrical Manawatū`);
  rows.push(`Job,${schedule.jobNumber}`);
  rows.push(`Client,${schedule.clientName}`);
  rows.push(`Address,"${schedule.address}"`);
  rows.push(`Floor Area,${schedule.floorAreaM2} m²`);
  rows.push(`Generated,${new Date().toLocaleDateString("en-NZ")}`);
  rows.push(``);

  const sectionHeader = (name: string) =>
    rows.push(`${name},,,,`, `Description,Qty,Unit,Rate (NZD),Subtotal`);

  const itemRow = (item: ElectricalItem) =>
    rows.push(
      `"${item.description}",${item.qty},${item.unit},${item.rate.toFixed(2)},${(item.qty * item.rate).toFixed(2)}`,
    );

  sectionHeader("LIGHTING");
  schedule.lighting.forEach(itemRow);
  rows.push(``);

  sectionHeader("POWER");
  schedule.power.forEach(itemRow);
  rows.push(``);

  sectionHeader("COMMUNICATIONS");
  schedule.communications.forEach(itemRow);
  rows.push(``);

  sectionHeader("MECHANICAL");
  schedule.mechanical.forEach(itemRow);
  rows.push(``);

  rows.push(`TOTAL ESTIMATE (excl. GST),,,,"${schedule.totalEstimate.toFixed(2)}"`);
  rows.push(`TOTAL ESTIMATE (incl. 15% GST),,,,"${(schedule.totalEstimate * 1.15).toFixed(2)}"`);

  return rows.join("\n");
}

// Re-export Carters loads so callers can import everything from one place
export { exportCartersLoads } from "@/lib/iq-carters-loads";

/* --------------------------------- QS-aligned data input sheet ------------ */

/**
 * Builds the "IQ Data Input" sheet whose cells align 1-to-1 with the
 * Jennian_QS_IQ_Updated.xlsm "Data Input" sheet.  All value cells are
 * highlighted yellow so the estimator can filter/copy them straight into QS.
 */
/**
 * Convergence Slice 6 — the "Review Notes" worksheet: one row per per-field discrepancy flag
 * carried over from the enriched takeoff, so a QS sees them before pricing. Returns null when
 * there are no flags (relational/pre-convergence jobs) so the workbook is unchanged from today.
 */
export function buildReviewNotesSheet(
  reviewFlags: QSExportData["reviewFlags"],
): XLSX.WorkSheet | null {
  if (!reviewFlags || reviewFlags.length === 0) return null;
  const ws: XLSX.WorkSheet = {};
  const set = (addr: string, v: string) => {
    ws[addr] = { v, t: "s" };
  };
  set("A1", "⚠ CONFIDENCE / REVIEW NOTES — confirm each against the plan before pricing");
  set("A3", "Field");
  set("B3", "Flag");
  let r = 4;
  for (const f of reviewFlags) {
    for (const flag of f.flags) {
      set(`A${r}`, f.field);
      set(`B${r}`, flag);
      r += 1;
    }
  }
  ws["!ref"] = `A1:B${Math.max(r - 1, 3)}`;
  ws["!cols"] = [{ wch: 22 }, { wch: 110 }];
  return ws;
}

export function buildQSDataInputSheet(data: QSExportData): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};

  // --- styles ---
  const yellowStyle = { fill: { patternType: "solid", fgColor: { rgb: "FFFF00" } } };
  const redHeaderStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "E71B23" } },
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 14 },
  };
  const sectionStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "404040" } },
    font: { bold: true, color: { rgb: "FFFFFF" } },
  };
  const labelStyle = { font: { color: { rgb: "666666" } } };
  const instructionStyle = { font: { italic: true, color: { rgb: "444444" } } };

  function lbl(addr: string, v: string, style: object = labelStyle) {
    ws[addr] = { v, t: "s", s: style };
  }

  // Write a value cell only when v is a non-null, non-zero, non-empty value.
  // Per spec: leave QS cells empty rather than writing 0 for missing data.
  function val(addr: string, v: string | number | null | undefined) {
    if (v === null || v === undefined || v === "" || v === 0) return;
    const out = typeof v === "number" ? (round2(v) ?? v) : v;
    ws[addr] = { v: out, t: typeof out === "number" ? "n" : "s", s: yellowStyle };
  }

  // --- Row 1: banner ---
  lbl("A1", "JENNIAN IQ — Data Input Export", redHeaderStyle);

  // --- Row 2: instructions ---
  lbl(
    "A2",
    "Open your QS file. Filter this sheet by yellow fill, copy all yellow cells, and paste (values only) into the matching cells in your QS Data Input sheet. Yellow cell addresses match QS exactly.",
    instructionStyle,
  );

  // --- ① JOB INFORMATION ---
  lbl("A4", "① JOB INFORMATION", sectionStyle);
  lbl("A5", "Client Name");
  lbl("A6", "Site Address");
  lbl("A7", "City");
  lbl("A8", "JMW Number");
  lbl("A9", "Date");

  val("I3", data.clientName || undefined);
  val("I4", data.streetAddress || undefined);
  // City always has a value — default to Palmerston North per QS convention
  ws["I5"] = { v: data.city || "Palmerston North", t: "s", s: yellowStyle };
  val("I8", data.jmwNumber || undefined);
  ws["B9"] = { v: new Date().toLocaleDateString("en-NZ"), t: "s", s: yellowStyle };

  // --- ② CORE MEASUREMENTS ---
  lbl("A11", "② CORE MEASUREMENTS", sectionStyle);
  lbl("A12", "Floor Area (m²)");
  lbl("A13", "Alfresco Area (m²)");
  lbl("A15", "Perimeter (lm)");
  lbl("A16", "First Floor Area (m²)");
  lbl("A19", "External Wall Length (lm)");
  lbl("A20", "External Wall Height (m)");

  val("D12", data.floorAreaM2 ?? undefined);
  val("D13", data.alfrescoAreaM2 ?? undefined);
  val("D15", data.perimeterLm ?? undefined);
  val("F4",  data.firstFloorAreaM2 ?? undefined);
  val("D19", data.exteriorWallLengthLm ?? undefined);
  // exteriorWallHeightM defaults to 2.4 in buildQSExportData, so always write it
  if (data.exteriorWallHeightM != null) {
    ws["D20"] = { v: data.exteriorWallHeightM, t: "n", s: yellowStyle };
  }

  // --- ③ WINDOWS & OPENINGS ---
  // Rows match "5. Data Input House " sheet exactly: C=cladding type (1=brick/2=other — GAP: not written by IQ),
  // D=qty, E=height(m), F=width(m)
  lbl("A38", "③ WINDOWS & OPENINGS", sectionStyle);
  lbl("C39", "Cladding type (1/2) — enter in QS");
  lbl("D39", "Qty");
  lbl("E39", "H (m)");
  lbl("F39", "W (m)");

  const windowRooms: Array<{
    key: keyof QSExportData["windowsByRoom"];
    roomLabel: string;
    row: number;
  }> = [
    { key: "bed1",         roomLabel: "Bed 1 (Master)", row: 41 },
    { key: "ensuite",      roomLabel: "Ensuite",         row: 43 },
    { key: "bed2",         roomLabel: "Bed 2",           row: 45 },
    { key: "bed3",         roomLabel: "Bed 3",           row: 47 },
    { key: "bed4",         roomLabel: "Bed 4",           row: 49 },
    { key: "bathroom",     roomLabel: "Bathroom",        row: 52 },
    { key: "kitchen",      roomLabel: "Kitchen",         row: 54 },
    { key: "familyLiving", roomLabel: "Family/Living",   row: 56 },
    { key: "dining",       roomLabel: "Dining",          row: 59 },
    { key: "lounge",       roomLabel: "Lounge",          row: 62 },
    { key: "garageWindow", roomLabel: "Garage Window",   row: 65 },
    { key: "garageDoor1",  roomLabel: "Garage Door",     row: 67 },
    { key: "entrance",     roomLabel: "Entrance",        row: 72 },
  ];

  for (const { key, roomLabel, row } of windowRooms) {
    lbl(`A${row}`, roomLabel);
    const room = data.windowsByRoom[key];
    if (room) {
      // Write cladding type code to C column when derived from elevation data
      if (data.claddingTypeCode != null) {
        ws[`C${row}`] = { v: data.claddingTypeCode, t: "n", s: yellowStyle };
      }
      val(`D${row}`, room.qty);
      val(`E${row}`, room.height);
      val(`F${row}`, room.width);
    }
  }

  // --- Downpipes ---
  lbl("A143", "Downpipes");
  lbl("A145", "White");
  lbl("A146", "Colorsteel");
  lbl("A147", "PVC Coloured");

  val("E145", data.downpipesWhite > 0 ? data.downpipesWhite : undefined);
  val("E146", data.downpipesColourSteel > 0 ? data.downpipesColourSteel : undefined);
  val("E147", data.downpipesPvcColoured > 0 ? data.downpipesPvcColoured : undefined);

  // --- ④ DOORS & GARAGE ---
  lbl("A174", "④ DOORS & GARAGE", sectionStyle);
  lbl("A176", "Garage Door 4.8×2.1 Insulated");
  lbl("A177", "Garage Door 4.8×2.1 Standard");
  lbl("A178", "Garage Door 2.4×2.1 Insulated");
  lbl("A179", "Garage Door 2.4×2.1 Standard");
  lbl("A180", "Garage Door 2.7×2.1 Insulated");
  lbl("A181", "Garage Door 2.7×2.1 Standard");

  val("H176", data.garageDoor48x21Insulated > 0 ? data.garageDoor48x21Insulated : undefined);
  val("H177", data.garageDoor48x21Std > 0 ? data.garageDoor48x21Std : undefined);
  val("H178", data.garageDoor24x21Insulated > 0 ? data.garageDoor24x21Insulated : undefined);
  val("H179", data.garageDoor24x21Std > 0 ? data.garageDoor24x21Std : undefined);
  val("H180", data.garageDoor27x21Insulated > 0 ? data.garageDoor27x21Insulated : undefined);
  val("H181", data.garageDoor27x21Std > 0 ? data.garageDoor27x21Std : undefined);

  // --- Interior doors ---
  lbl("A185", "Interior Doors");
  lbl("A187", "Standard hinged");
  lbl("A192", "Double doors");
  lbl("A193", "Cavity sliders");

  val("H187", data.intDoorStandard > 0 ? data.intDoorStandard : undefined);
  val("H192", data.intDoorDouble > 0 ? data.intDoorDouble : undefined);
  val("H193", data.intDoorCavitySlider > 0 ? data.intDoorCavitySlider : undefined);

  // --- ⑤ ELEVATION & SITE PLAN DATA (auto-derived from elevation/site plan PDFs) ---
  if (data.elevationSummary) {
    const ev = data.elevationSummary;
    lbl("A197", "⑤ ELEVATION & SITE PLAN DATA", sectionStyle);
    lbl("A199", "Cladding type code (1=brick · 2=weatherboard · 3=mixed)");
    if (data.claddingTypeCode != null) val("D199", data.claddingTypeCode);
    lbl("A200", "Roof type");
    if (ev.roofType) lbl("D200", ev.roofType, { font: {} });
    lbl("A201", "Roof pitch (degrees)");
    if (ev.roofPitchDegrees != null) val("D201", ev.roofPitchDegrees);
    lbl("A202", "External door count (from elevations)");
    if (ev.externalDoorCount > 0) val("D202", ev.externalDoorCount);
    lbl("A203", "Gable end count");
    if (ev.gableEndCount > 0) val("D203", ev.gableEndCount);
    lbl("A205", "Driveway concrete (m²)");
    if (ev.drivewayConcretM2 != null) val("D205", ev.drivewayConcretM2);
    lbl("A206", "Paths / patio concrete (m²)");
    if (ev.patioConcreteM2 != null) val("D206", ev.patioConcreteM2);
    lbl("A207", "Total concrete (m²)");
    if (ev.totalConcreteM2 != null) val("D207", ev.totalConcreteM2);
    if (ev.windowCountWarning) {
      lbl("A209", `⚠ ${ev.windowCountWarning}`, { font: { color: { rgb: "FF8C00" }, italic: true } });
    }
    if (ev.windowCountMatch === true) {
      lbl("A209", "✓ Window count verified — floor plan and elevations agree", { font: { color: { rgb: "008000" } } });
    }
  }

  // --- sheet metadata ---
  ws["!cols"] = [
    { wch: 35 }, // A — labels
    { wch: 12 }, // B — date reference
    { wch: 15 }, // C — window cladding
    { wch: 15 }, // D — measurements / window qty
    { wch: 15 }, // E — window height / downpipes
    { wch: 15 }, // F — first floor / window width
    { wch: 15 }, // G — (spare)
    { wch: 15 }, // H — garage door / interior door counts
    { wch: 25 }, // I — job info values
  ];
  ws["!ref"] = "A1:I210";

  return ws;
}

/* --------------------------------- concept mode IQ data sheet (async, full) */

/**
 * Generates an IQ data workbook with Cover + Data + QS Data Input sheets,
 * loading plan type, confidence score, and module_items from Supabase when
 * jobId is provided.
 * Cover sheet: job info, plan type, confidence %, and assumed items list.
 * Data sheet: module_items with amber fill for assumed rows.
 * IQ Data Input sheet: values at exact QS cell addresses, yellow-highlighted.
 */
export async function writeIQDataSheetFull(
  data: QSExportData & { jobId?: string },
): Promise<Uint8Array> {
  const wb = XLSX.utils.book_new();

  let confidenceScore: number | null = null;
  let allItems: Array<{ module_id: string; label: string; extracted_value: string | null; approved_value: string | null; unit: string | null; value_source: string | null }> = [];

  if (data.jobId) {
    const jobRes = await supabase.from("jobs").select("confidence_score").eq("id", data.jobId).single();
    if (jobRes.error) throw new Error(`Failed to load job: ${jobRes.error.message}`);
    confidenceScore = (jobRes.data?.confidence_score as number | null) ?? null;
    if (data.moduleItems) {
      allItems = data.moduleItems;
    } else {
      const itemsRes = await supabase.from("module_items")
        .select("module_id, label, extracted_value, approved_value, unit, value_source")
        .eq("job_id", data.jobId)
        .order("sort_order", { ascending: true });
      if (itemsRes.error) throw new Error(`Failed to load module items: ${itemsRes.error.message}`);
      allItems = (itemsRes.data ?? []) as typeof allItems;
    }
  }

  const assumedItems = allItems.filter((i) => i.value_source === "assumed");

  // Cover sheet
  const coverRows: (string | number | null)[][] = [
    ["Jennian Homes — IQ Data Sheet"],
    [],
    ["Job Number", data.jobNumber],
    ["Client", data.clientName],
    ["Address", data.address],
    ["Date", new Date().toLocaleDateString("en-NZ")],
    ...(confidenceScore != null ? [["Confidence Score", `${confidenceScore}%`]] : []),
    [],
  ];

  if (assumedItems.length > 0) {
    coverRows.push(["ASSUMED ITEMS (Jennian standard allowances)"]);
    coverRows.push(["Module", "Label", "Value", "Unit"]);
    for (const item of assumedItems) {
      coverRows.push([
        item.module_id.replace("iq-", "").toUpperCase(),
        item.label,
        item.extracted_value ?? "—",
        item.unit ?? "",
      ]);
    }
  }

  const wsCover = XLSX.utils.aoa_to_sheet(coverRows);
  wsCover["!cols"] = [{ wch: 20 }, { wch: 40 }, { wch: 20 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsCover, "Cover");

  // Convergence Slice 6 — Review Notes sheet: the per-field confidence flags carried over from
  // the enriched takeoff, placed prominently (right after the Cover) so a QS sees them before
  // pricing. Added ONLY when there are flags → a pre-convergence/relational export (no flags)
  // is byte-identical to today.
  const wsFlags = buildReviewNotesSheet(data.reviewFlags);
  if (wsFlags) XLSX.utils.book_append_sheet(wb, wsFlags, "Review Notes");

  // Data sheet with amber fill for assumed rows
  const dataHeader = ["Module", "Label", "Value", "Unit", "Source"];
  const dataRows: (string | number | null)[][] = [dataHeader];
  for (const item of allItems) {
    dataRows.push([
      item.module_id.replace("iq-", "").toUpperCase(),
      item.label,
      item.extracted_value ?? "—",
      item.unit ?? "",
      item.value_source ?? "extracted",
    ]);
  }

  const wsData = XLSX.utils.aoa_to_sheet(dataRows);
  wsData["!cols"] = [{ wch: 16 }, { wch: 40 }, { wch: 20 }, { wch: 10 }, { wch: 12 }];

  // Apply amber fill style to assumed rows
  const amberFill = { patternType: "solid", fgColor: { rgb: "FFF3CD" } };
  for (let r = 1; r < dataRows.length; r++) {
    const src = dataRows[r][4];
    if (src === "assumed") {
      for (let c = 0; c < 5; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!wsData[addr]) wsData[addr] = { v: "", t: "s" };
        (wsData[addr] as XLSX.CellObject).s = { fill: amberFill };
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, wsData, "5. Data Input House ");

  // QS-aligned paste sheet — cell addresses match Jennian_QS_IQ_Updated.xlsm exactly
  const wsQSInput = buildQSDataInputSheet(data);
  XLSX.utils.book_append_sheet(wb, wsQSInput, "IQ Data Input");

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}
