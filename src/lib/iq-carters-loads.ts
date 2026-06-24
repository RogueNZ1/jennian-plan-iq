/**
 * IQ Carters Stage Loads
 * Formula contract implementation for stage-load auto-calculation.
 */

import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { parseSpecifications } from "@/lib/specs/spec-schema";
import type { ElevationData } from "@/lib/takeoff/extract-elevations";
import { extractJobHeaderFromFile } from "@/lib/takeoff/extract-spec";
import type { ExtractedFile } from "@/lib/takeoff/pdf-text";

type ModuleItemRow = Database["public"]["Tables"]["module_items"]["Row"];
type QuantityRow = Database["public"]["Tables"]["extracted_quantities"]["Row"];
type OpeningRow = Database["public"]["Tables"]["opening_schedule"]["Row"];
type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

type MeasureRow = {
  label: string;
  approved_value: string | null;
  extracted_value: string | null;
};

export type CartersInputs = {
  jobName: string;
  jobNumber: string;
  deliveryAddress: string;
  builderContact: string;

  slab_area_m2: number;
  perimeter_m: number;
  stud_height_m: number;
  gable_area_m2: number;
  wall_area_m2: number;

  openings_m2: number;
  joinery_count: number;

  roof_type: "Tile" | "Longrun";
  roof_area_pitched_m2: number;
  purlin_spacing_m: number;
  soffit_width_mm: number;

  brick_lm: number;
  horiz_clad_m2: number;
  vert_clad_m2: number;
  vert_board_cover_mm: number;
  cedar_lm: number;
  clad_corners_ext: number;

  internal_wall_lm: number;
  internal_door_count: number;

  bedrooms: number;
  wic: number;
  storage: number;
  wet_rooms: number;
  living: number;
  tiled_showers: number;

  brace_units: number;
  sb400_straps: number;
  valley_lgths_5p4: number;

  garage_doors: number;
  solar_tubes: number;
  hwc_ceiling: number;
  attic_stairs: number;

  foundationType: "expol" | "standard";
};

export type CartersLoadItem = {
  qty: number | string;
  unit: string;
  code?: string;
  description: string;
  note?: string;
};

export type CartersLoad = {
  name: string;
  items: CartersLoadItem[];
};

const nz = (value: number | null | undefined): number => {
  const parsed = value ?? NaN;
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const parseToNumber = (value: string | null | undefined): number | null => {
  if (value == null) return null;
  const cleaned = value.replace(/,/g, "").match(/-?\d+\.?\d*/)?.[0];
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeLabel = (value: string | null | undefined): string =>
  (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const toMeasureRows = (rawQtys: QuantityRow[]): MeasureRow[] =>
  rawQtys.map((q) => ({
    label: (q.quantity_type ?? "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\s+/g, " ")
      .trim(),
    approved_value: q.approved_value == null ? null : `${q.approved_value}`,
    extracted_value: q.extracted_value == null ? null : `${q.extracted_value}`,
  }));

const findMeasure = (rows: MeasureRow[], termGroups: string[][]): MeasureRow | undefined => {
  const normalized = rows.map((row) => ({
    row,
    text: normalizeLabel(row.label),
  }));

  for (const group of termGroups) {
    const match = normalized.find(({ text }) =>
      group.every((term) => text.includes(normalizeLabel(term))),
    );
    if (match) return match.row;
  }

  return undefined;
};

const readMeasureNum = (rows: MeasureRow[], termGroups: string[][], fallback = 0): number => {
  const found = findMeasure(rows, termGroups);
  if (!found) return fallback;
  const candidate = parseToNumber(found.approved_value ?? found.extracted_value);
  return candidate == null ? fallback : nz(candidate);
};

const readMeasureText = (rows: MeasureRow[], termGroups: string[][]): string | null => {
  const found = findMeasure(rows, termGroups);
  if (!found) return null;
  return found.approved_value ?? found.extracted_value ?? null;
};

const parseRoofType = (value: string | null | undefined): "Tile" | "Longrun" => {
  const text = normalizeLabel(value);
  if (!text) return "Tile";
  if (
    text.includes("longrun") ||
    text.includes("long run") ||
    text.includes("corrugate") ||
    text.includes("corrugated")
  ) {
    return "Longrun";
  }
  if (text.includes("tile") || text.includes("metal tile")) return "Tile";
  return text.includes("colorsteel") ? "Longrun" : "Tile";
};

const roofTypeFromSource = (rows: MeasureRow[], elevation: ElevationData | null): "Tile" | "Longrun" =>
  parseRoofType(readMeasureText(rows, [["roof type"], ["roof profile"]]) ?? elevation?.roofType ?? null);

const countOpenings = (rows: OpeningRow[], predicate: (normalizedType: string) => boolean): number =>
  rows.reduce((total, opening) => {
    const type = normalizeLabel(opening.opening_type);
    if (!predicate(type)) return total;
    const qty = Number(opening.quantity ?? 1);
    return total + (Number.isFinite(qty) ? Math.max(1, qty) : 1);
  }, 0);

const openingAreaSum = (rows: OpeningRow[]): number =>
  rows.reduce((total, opening) => {
    const w = nz(Number(opening.width_mm) / 1000);
    const h = nz(Number(opening.height_mm) / 1000);
    const qty = nz(opening.quantity);
    if (w <= 0 || h <= 0) return total;
    return total + w * h * qty;
  }, 0);

export function calculateCartersLoads(inp: CartersInputs): CartersLoad[] {
  const stud = nz(inp.stud_height_m);
  const wallArea = nz(inp.wall_area_m2);

  const load1D12 = Math.round(inp.slab_area_m2 * 0.6);
  const load1Mesh = Math.ceil(inp.slab_area_m2 / 7) + 1;
  const load1ExpolPods = Math.round(inp.slab_area_m2 * 0.64);
  const load1Podsticks = load1ExpolPods + 15;
  const load1Poly100 = Math.ceil(inp.slab_area_m2 / 100);
  const load1Tape = Math.ceil(inp.slab_area_m2 / 50) + 1;
  const load1TieWire = inp.slab_area_m2 > 200 ? 10 : 5;

  const purlinRaw = Math.round(inp.roof_area_pitched_m2 / inp.purlin_spacing_m);
  const purlins = Math.round(purlinRaw / 10) * 10;
  const bracingDivider = stud > 2.45 ? 3.24 : 2.88;
  const bracingPly = Math.ceil((inp.perimeter_m * stud) / bracingDivider) + 1;
  const bracingPlyLabel = stud > 2.45 ? "2700x1200 7mm DD H3.2" : "2400x1200 7mm DD H3.2";
  const buildingWrap = Math.ceil(wallArea / 90);

  const ceilingBatten = Math.ceil((inp.slab_area_m2 / 0.6 / 5.4) * 1.2);
  const hardisoffit = Math.ceil((inp.perimeter_m * 1.15) / 2.4) + 1;
  const hardijointer = Math.ceil(hardisoffit / 3.5);
  const nonBrickPerimeter = Math.max(0, inp.perimeter_m - inp.brick_lm);
  const eavesMould = Math.max(2, Math.ceil((nonBrickPerimeter * 0.85) / 5.4));
  const cavityCloser = Math.ceil((nonBrickPerimeter * 1.2) / 3);
  const cavityHorz = Math.ceil(inp.horiz_clad_m2 / 0.45 / 5.4);
  const cavityVert = Math.ceil(inp.vert_clad_m2 / 0.6 / 2.7);
  const obliqueBoard = Math.ceil(inp.vert_clad_m2 / (((inp.vert_board_cover_mm || 1) / 1000) * 3));
  const paslode90mm = inp.slab_area_m2 > 150 ? 2 : 1;
  const paslode65mm = inp.slab_area_m2 > 150 ? 2 : 1;
  const polyStrips = inp.slab_area_m2 > 200 ? 50 : 25;
  const roofStrapBrace = inp.roof_type === "Longrun" ? 3 : 2;

  const gibCeilingStd = Math.round(inp.slab_area_m2 * 1.05 - inp.wet_rooms * 6);
  const gibCeilingAqua = inp.wet_rooms * 6;
  const gibWallStd = Math.round(
    (inp.internal_wall_lm * 2 + inp.perimeter_m) * stud -
      inp.openings_m2 -
      inp.internal_door_count * 1.7 -
      inp.wet_rooms * 18 -
      inp.brace_units * 2.88,
  );
  const gibWallAqua = inp.wet_rooms * 18;
  const braceline = Math.round(inp.brace_units * 2.88);

  const skirting =
    inp.internal_wall_lm > 0
      ? Math.ceil(((inp.internal_wall_lm * 2 + inp.perimeter_m) * 0.95) / 5.4)
      : Math.ceil((inp.slab_area_m2 * 2.45) / 5.4);
  const mdfRail = Math.ceil((inp.bedrooms + inp.wic + inp.storage) * 1.4);
  const handiplank2400 = inp.wic;
  const handiplank1800 = inp.bedrooms * 4;
  const closetRail2400 = inp.wic;
  const closetRail1800 = inp.bedrooms + 1;

  const ceilingHatch = inp.attic_stairs === 1 ? 0 : 1;
  const shelvingSlats = Math.max(0, inp.storage + 1) * 20;
  const smokeAlarms = inp.bedrooms + inp.living + 1;

  return [
    {
      name: "Load 1 Foundation",
      items: [
        { qty: load1D12, unit: "Lgth", description: "D12 HD12 500E Reinforcing" },
        { qty: load1Mesh, unit: "Sheet", description: "SE62 500E Ductile Mesh", note: "Never-short policy (+1)" },
        { qty: 1, unit: "Bundle", description: "Tie Wire" },
        {
          qty: load1ExpolPods,
          unit: "Each",
          description: "Expol 1100x1100 Polystyrene Pods",
          note: "xPod/Firth foundation",
        },
        { qty: load1Podsticks, unit: "Each", description: "Expol Podsticks", note: "xPod/Firth foundation" },
        { qty: inp.slab_area_m2, unit: "Each", description: "UNIMAX Spacers" },
        { qty: load1Poly100, unit: "Roll", description: "250 Micron Polythene 100m2" },
        { qty: load1Tape, unit: "Roll", description: "Polythene Tape", note: "Includes lap/joins allowance" },
        { qty: load1TieWire, unit: "Pack", description: "Makita Gun Tie Wire 1.6mm" },
        { qty: 1, unit: "Can", description: "Pink Dazzle" },
        { qty: 1, unit: "Each", description: "Stringline" },
      ].filter((item) => {
        if (
          item.description === "Expol Podsticks" ||
          item.description === "Expol 1100x1100 Polystyrene Pods"
        ) {
          return inp.foundationType === "expol";
        }
        return true;
      }),
    },
    {
      name: "Load 2 Framing & Hardware",
      items: [
        {
          qty: inp.roof_type === "Tile" ? inp.valley_lgths_5p4 : 0,
          unit: "Lgth",
          description: "140x35 H1.2 MSG8 Valley Boards 5.4m (Tile Roof)",
          note: "Manual roof-plan driver",
        },
        { qty: purlins, unit: "Lgth", description: "70x45 H1.2 MSG8 Purlin 6.0m" },
        { qty: bracingPly, unit: "Sheet", description: bracingPlyLabel },
        { qty: buildingWrap, unit: "Roll", description: "Jennian Branded Building Wrap" },
        { qty: inp.brace_units, unit: "Bag", description: "Handibracs", note: "Manual bracing-plan driver" },
        { qty: 1, unit: "Each", description: "Blue Dazzle" },
        { qty: 1, unit: "Each", description: "Pink Dazzle" },
        { qty: inp.joinery_count >= 18 ? 2 : 1, unit: "Box", description: "50mm Wanz Tek screws" },
        { qty: inp.joinery_count >= 18 ? 2 : 1, unit: "Box", description: "50mm Wanz Bolt screws" },
        { qty: inp.sb400_straps, unit: "Each", description: "SB400 Straps", note: "Manual fixing-plan driver" },
        { qty: purlins > 0 ? 4 : 0, unit: "Each", description: "Blue screws" },
        { qty: roofStrapBrace, unit: "Each", description: "Roof Strap Brace" },
        { qty: inp.brick_lm > 0 ? 1 : 0, unit: "Each", description: "Sika Blackseal 4L" },
        { qty: inp.brick_lm > 0 ? 1 : 0, unit: "Each", description: "100mm Brush" },
        { qty: paslode90mm, unit: "Each", description: "Paslode 90mm" },
        { qty: paslode65mm, unit: "Each", description: "Paslode 65mm" },
        { qty: polyStrips, unit: "Sheet", description: "Poly Strips" },
        { qty: 1, unit: "Box", description: "Clouts" },
        { qty: 1, unit: "Box", description: "Staples" },
        { qty: 1, unit: "Box", description: "Flathead screws" },
      ],
    },
    {
      name: "Load 3 Close In",
      items: [
        { qty: inp.solar_tubes, unit: "Each", description: "Velux Solar Tube" },
        { qty: ceilingBatten, unit: "Lgth", description: "70x35 H1.2 Ceiling Batten 5.4m" },
        { qty: hardisoffit, unit: "Sheet", description: `2400 x ${inp.soffit_width_mm} Hardisoffit` },
        { qty: 1, unit: "Sheet", description: "Hardisoffit wide/corner sheet" },
        { qty: hardijointer, unit: "Lgth", description: "2400 Hardijointer" },
        { qty: 3, unit: "Each", description: "Dristud Tape" },
        { qty: inp.garage_doors > 0 ? 2 : 0, unit: "Lgth", description: "Fascia 200x40 Garage Opening" },
        { qty: cavityCloser, unit: "Lgth", description: "20mm Cavity Closer 3.0m" },
        { qty: cavityHorz, unit: "Lgth", description: "50x20 H3.1 Cavity Batten (horizontal cladding)" },
        { qty: cavityVert, unit: "Lgth", description: "50x20 H3.1 Castellated Cavity Batten" },
        {
          qty: obliqueBoard,
          unit: "Lgth",
          description: `50x20 H3.1 Oblique Board (${inp.vert_board_cover_mm}mm cover x 3m)`,
        },
        { qty: inp.clad_corners_ext, unit: "Each", description: "External box corner" },
        { qty: 2, unit: "Each", description: "Internal box corner" },
        { qty: inp.cedar_lm, unit: "Lgth", description: "Cedar Board" },
        { qty: inp.cedar_lm > 0 ? 4 : 0, unit: "Each", description: "Axent Trim" },
        { qty: inp.cedar_lm > 0 ? 6 : 0, unit: "Each", description: "Scribber" },
        { qty: eavesMould, unit: "Lgth", description: "Eaves mould" },
        { qty: inp.brick_lm > 0 ? 2 : 5, unit: "Each", description: "Bostik" },
        { qty: inp.brick_lm > 0 ? 2 : 0, unit: "Each", description: "Supercourse" },
        { qty: inp.tiled_showers, unit: "Each", description: "Ezy Dwang 50x50 2.4m Backing Angle" },
        { qty: inp.garage_doors >= 2 ? 2 : 1, unit: "Each", description: "Tuatara wrap" },
        { qty: 3, unit: "Each", description: "Primer" },
        { qty: 1, unit: "Each", description: "Paslode 65mm" },
        { qty: 2, unit: "Each", description: "Jolt screws" },
        { qty: 1, unit: "Each", description: "Jolt head" },
        { qty: 4, unit: "Sheet", description: "CDUT ply" },
        { qty: 4, unit: "Each", description: "Tee hinges" },
        { qty: 1, unit: "Each", description: "Pad bolts" },
        { qty: 2, unit: "Roll", description: "Duct tape" },
      ],
    },
    {
      name: "Load 4 Gib Ceilings",
      items: [
        { qty: Math.max(0, gibCeilingStd), unit: "sqm", description: "13mm Standard Gibboard Ceiling" },
        { qty: gibCeilingAqua, unit: "sqm", description: "13mm Aqualine Gibboard Ceiling" },
        { qty: Math.ceil((inp.slab_area_m2 * 1.05) / 30), unit: "Box", description: "Screws 32mm" },
        { qty: Math.ceil((inp.slab_area_m2 * 1.05) / 10), unit: "Box", description: "Bostik Wallboard Gold" },
        { qty: inp.tiled_showers > 0 ? inp.tiled_showers * 2 : 0, unit: "Sheets", description: "2-edge Villaboard" },
        { qty: "UNCALIBRATED", unit: "", description: "Confirm actual gib ceiling split and board sizes." },
      ],
    },
    {
      name: "Load 5 Gib Walls",
      items: [
        { qty: Math.max(0, gibWallStd), unit: "sqm", description: "10mm Standard Gibboard Walls" },
        { qty: gibWallAqua, unit: "sqm", description: "10mm Aqualine Gibboard Walls" },
        { qty: Math.max(0, braceline), unit: "sqm", description: "10mm Braceline / Noiseline" },
        { qty: "UNCALIBRATED", unit: "", description: "Confirm actual gib wall split and wall quantities." },
      ],
    },
    {
      name: "Load 6 Finishing",
      items: [
        { qty: skirting, unit: "Lgth", description: "60x10 MDF Skirting & Architrave 5.4m" },
        { qty: mdfRail, unit: "Lgth", description: "40x18 Square MDF P/P" },
        { qty: 2, unit: "Box", description: "Brads" },
        { qty: 2, unit: "Each", description: "PVA Glue" },
        { qty: handiplank2400, unit: "Each", description: "2400 Handiplank" },
        { qty: handiplank1800, unit: "Each", description: "1800 Handiplank" },
        { qty: closetRail2400, unit: "Each", description: "2400 Closet Rail" },
        { qty: closetRail1800, unit: "Each", description: "1800 Closet Rail" },
        { qty: inp.attic_stairs, unit: "Each", description: "Fakro LWK2800 Attic Stair" },
        { qty: inp.hwc_ceiling, unit: "Each", description: "HWC Framing Kit" },
        { qty: inp.hwc_ceiling, unit: "Each", description: "HWC MDF 300x600x15" },
      ],
    },
    {
      name: "Load 7 Final Delivery",
      items: [
        { qty: smokeAlarms, unit: "Each", description: "Smoke Alarms" },
        { qty: ceilingHatch, unit: "Each", description: "Ceiling Hatch 600x500mm" },
        { qty: shelvingSlats, unit: "Each", description: "Shelving Slats" },
        { qty: 1, unit: "Each", description: "Austral Fold Down Compact Clothesline" },
        { qty: 1, unit: "Each", description: "Letterbox" },
        { qty: 1, unit: "Each", description: "Numbers" },
        { qty: 1, unit: "Each", description: "Fastcrete" },
        { qty: 1, unit: "Each", description: "UT pine" },
      ],
    },
  ];
}

export async function buildCartersInputs(jobId: string, files?: ExtractedFile[]): Promise<CartersInputs> {
  const [jobRes, moduleItemsRes, qtyRes, openingsRes] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", jobId).single(),
    supabase.from("module_items").select("*").eq("job_id", jobId),
    supabase.from("extracted_quantities").select("*").eq("job_id", jobId),
    supabase.from("opening_schedule").select("*").eq("job_id", jobId),
  ]);

  if (jobRes.error) throw new Error(`Failed to load job: ${jobRes.error.message}`);
  if (moduleItemsRes.error) throw new Error(`Failed to load module items: ${moduleItemsRes.error.message}`);
  if (qtyRes.error) throw new Error(`Failed to load extracted quantities: ${qtyRes.error.message}`);
  if (openingsRes.error) throw new Error(`Failed to load openings: ${openingsRes.error.message}`);

  const rawJob = jobRes.data as JobRow;
  const moduleItems = (moduleItemsRes.data as ModuleItemRow[]) ?? [];
  const quantities = (qtyRes.data as QuantityRow[]) ?? [];
  const openings = (openingsRes.data as OpeningRow[]) ?? [];

  const rows: MeasureRow[] = [
    ...moduleItems.map((item) => ({
      label: item.label,
      approved_value: item.approved_value,
      extracted_value: item.extracted_value,
    })),
    ...toMeasureRows(quantities),
  ];

  const getNum = (groups: string[][], fallback = 0) => readMeasureNum(rows, groups, fallback);
  const getText = (groups: string[][]) => readMeasureText(rows, groups);

  const specAnswers = parseSpecifications(rawJob.specifications).answers;
  const elevation = (rawJob.elevation_data ?? null) as ElevationData | null;

  const slab = getNum([["foundation area"], ["slab area"], ["floor area"], ["d4"]], 165);
  const perimeter = getNum([["perimeter"], ["external perimeter"], ["external wall length"], ["wall length"]], 65);
  const studSource = getNum([["stud height"], ["wall height"], ["height"], ["ceiling height"]], 2.4);
  const stud = studSource > 100 ? studSource / 1000 : studSource || 2.4;
  const gable = getNum([["gable area"]], 0);
  const wallArea = Math.max(0, perimeter * stud + gable);
  const roofArea = getNum([["roof area"], ["roof area pitched"]], Math.max(0, slab * 1.25));
  const roofType = roofTypeFromSource(rows, elevation);
  const purlinSpacing = getNum([["purlin spacing"], ["purlin centre"]], 0.42) || 0.42;
  const soffitWidth = getNum([["soffit width"], ["hardisoffit width"]], 450);
  const soffitWidthMm = soffitWidth >= 600 ? 600 : 450;

  const openingsArea = openingAreaSum(openings);
  const joineryCount = countOpenings(openings, (type) =>
    ["window", "slider", "garage window", "entrance", "pa door"].includes(type),
  );
  const garageDoors = countOpenings(
    openings,
    (type) => type.includes("garage door") || type === "sectional door",
  );
  const internalDoors = countOpenings(
    openings,
    (type) =>
      type.includes("standard door") ||
      type.includes("double") ||
      type.includes("cavity slider") ||
      type.includes("barn slider") ||
      type.includes("interior door") ||
      type.includes("internal door"),
  );

  const bedroomCount = getNum([["bedrooms"], ["bed room"]], 1);
  const wic = getNum([["wic"], ["walk in"], ["walk-in"], ["walkin"]], 0);
  const storage = getNum([["storage"], ["store"], ["cupboard"]], 1);
  const wetRooms = getNum([["wet rooms"], ["wetroom"], ["bathroom"], ["ensuite"]], 0);
  const living = getNum([["living"], ["living rooms"], ["lounge"]], 1);
  const tiledShowers = getNum([["tiled shower"], ["tiled showers"], ["tile shower"]], 0);
  const solarTubes = getNum([["solartube"], ["solar tube"], ["sun tube"]], specAnswers["solar_tubes"] ?? 0);
  const hwcCeiling = getNum([["hwc ceiling"]], 0);
  const atticStairs = getNum([["attic stair"], ["attic stairs"], ["fakro"]], 0);
  const braceUnits = getNum([["brace unit"], ["handibracs"], ["brace units"]], 0);
  const sb400 = getNum([["sb400"], ["sb400 straps"], ["sb 400"]], 0);
  const valleys = getNum([["valley"], ["5.4"], ["5p4"]], 0);
  const boardCover = getNum([["vertical board"], ["oblique board"], ["board cover"]], 200);
  const foundationText = getText([["foundation"], ["slab"], ["foundations"]])?.toLowerCase() ?? "";
  const foundationType: CartersInputs["foundationType"] = /expol/i.test(foundationText) ? "expol" : "standard";
  const brickLm = getNum([["brick lineal"], ["brick"], ["brick lm"]], 0);
  const horizClad = getNum([["horizontal cladding"], ["cladding area"]], 0);
  const vertClad = getNum([["vertical cladding"], ["oblique cladding"], ["feature cladding"]], 0);
  const cedarLm = getNum([["cedar"], ["cedar board"]], 0);
  const cladCornersExt = getNum([["cladding corners"], ["external corners"], ["ext corners"]], 0);
  const internalWall = getNum([["internal wall length"], ["internal walls"], ["iq import b13"], ["b13"]], 0);

  const smwHeader = files?.map(extractJobHeaderFromFile).find((h) => h.source === "smw");
  const plansHeader = files?.map(extractJobHeaderFromFile).find((h) => h.source === "plans");
  const resolvedJobName = rawJob.client_name || smwHeader?.clientName || plansHeader?.clientName || "";
  const resolvedJobNumber = rawJob.job_number || smwHeader?.jmwNumber || plansHeader?.jobNumber || "";
  const resolvedAddress = rawJob.address || smwHeader?.addressLine1 || plansHeader?.addressLine1 || "";

  return {
    jobName: resolvedJobName,
    jobNumber: resolvedJobNumber,
    deliveryAddress: resolvedAddress,
    builderContact: "STUD",
    slab_area_m2: slab,
    perimeter_m: perimeter,
    stud_height_m: stud,
    gable_area_m2: gable,
    wall_area_m2: wallArea,
    openings_m2: openingsArea,
    joinery_count: joineryCount,
    roof_type: roofType,
    roof_area_pitched_m2: roofArea,
    purlin_spacing_m: purlinSpacing,
    soffit_width_mm: soffitWidthMm,
    brick_lm: brickLm,
    horiz_clad_m2: horizClad,
    vert_clad_m2: vertClad,
    vert_board_cover_mm: boardCover,
    cedar_lm: cedarLm,
    clad_corners_ext: cladCornersExt,
    internal_wall_lm: internalWall,
    internal_door_count: internalDoors,
    bedrooms: bedroomCount,
    wic,
    storage,
    wet_rooms: wetRooms,
    living,
    tiled_showers: tiledShowers,
    brace_units: braceUnits,
    sb400_straps: sb400,
    valley_lgths_5p4: valleys,
    garage_doors: garageDoors,
    solar_tubes: Math.max(0, solarTubes),
    hwc_ceiling: Math.max(0, hwcCeiling),
    attic_stairs: Math.max(0, atticStairs),
    foundationType,
  };
}

function writeSummaryRows(inputs: CartersInputs, loads: CartersLoad[]): (string | number)[][] {
  const rows: (string | number)[][] = [
    ["Carters Stage Loads Summary", "", "", ""],
    [],
    ["Inputs", "Value", "Units", "Notes"],
    ["Job", inputs.jobName, "", ""],
    ["Job Number", inputs.jobNumber, "", ""],
    ["Slab (m2)", inputs.slab_area_m2, "m2", ""],
    ["Perimeter (lm)", inputs.perimeter_m, "lm", ""],
    ["Stud (m)", inputs.stud_height_m, "m", ""],
    ["Gable Area (m2)", inputs.gable_area_m2, "m2", ""],
    ["Wall Area (m2)", inputs.wall_area_m2, "m2", ""],
    ["Brick LM", inputs.brick_lm, "lm", ""],
    ["Horizontal Cladding", inputs.horiz_clad_m2, "m2", "Manual until IQ cladding is locked"],
    ["Vertical Cladding", inputs.vert_clad_m2, "m2", "Manual until IQ cladding is locked"],
    ["Internal Wall LM", inputs.internal_wall_lm, "lm", ""],
    ["Roof Type", inputs.roof_type, "", ""],
    ["Roof area pitched (m2)", inputs.roof_area_pitched_m2, "m2", ""],
    ["Brace Units", inputs.brace_units, "count", "Manual bracing-plan driver"],
    ["SB400 Straps", inputs.sb400_straps, "count", "Manual fixing-plan driver"],
    ["Valley Lengths", inputs.valley_lgths_5p4, "5.4m lengths", "Manual roof-plan driver"],
    ["Garage Doors", inputs.garage_doors, "count", ""],
    ["Attic stairs", inputs.attic_stairs, "", ""],
    [],
    ["Load", "Quantity", "Unit", "Description"],
  ];

  for (const load of loads) {
    rows.push([load.name, "", "", ""]);
    for (const item of load.items) {
      rows.push([item.description, item.qty, item.unit, item.note ?? ""]);
    }
  }

  return rows;
}

export function writeCartersLoadsExcel(loads: CartersLoad[], inputs: CartersInputs): Blob {
  const wb = XLSX.utils.book_new();

  for (const load of loads) {
    const rows: (string | number)[][] = [
      ["Carters Stage Loads"],
      [],
      [load.name],
      [],
      ["Job name", inputs.jobName],
      ["Job number", inputs.jobNumber],
      ["Delivery Address", inputs.deliveryAddress],
      ["Builder Contact", inputs.builderContact],
      [],
      ["Qty", "Unit", "Description", "Note"],
    ];

    for (const item of load.items) {
      rows.push([item.qty, item.unit, item.description, item.note ?? ""]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 70 }, { wch: 44 }];
    XLSX.utils.book_append_sheet(wb, ws, load.name.slice(0, 31));
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(writeSummaryRows(inputs, loads));
  summarySheet["!cols"] = [{ wch: 35 }, { wch: 14 }, { wch: 12 }, { wch: 58 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function exportCartersLoads(jobId: string): Promise<{ blob: Blob; filename: string }> {
  const inputs = await buildCartersInputs(jobId);
  const loads = calculateCartersLoads(inputs);
  const blob = writeCartersLoadsExcel(loads, inputs);
  return { blob, filename: `${inputs.jobNumber || "job"}-Carters-Stage-Loads.xlsx` };
}
