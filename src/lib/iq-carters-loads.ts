/**
 * IQ Carters Stage Loads — Auto-generates all 7 Carters delivery loads
 * from Jennian IQ job measurements.
 *
 * Eliminates manual PM takeoff. Quantities derived from:
 *   - Floor area, perimeter, stud height (from plan measurements)
 *   - Cladding areas by type (from IQ Cladding module)
 *   - Window/door counts and areas (from opening schedule)
 *   - Room counts (from Vision Takeoff)
 *   - Spec items (from extract-spec)
 *
 * Output matches JMW25025_Dixon___Bean_Stage_Loads.xlsx format exactly.
 * Each sheet = one delivery load sent to Kirsty at Carters.
 *
 * Validated against Dixon & Bean (235.4m², 81.48lm) actual PM takeoffs.
 */

import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { extractJobHeaderFromFile } from "@/lib/takeoff/extract-spec";
import type { ExtractedFile } from "@/lib/takeoff/pdf-text";

// ── Types ─────────────────────────────────────────────────────────────────

export type CartersInputs = {
  // Job info
  jobName: string;
  jobNumber: string;
  deliveryAddress: string;
  builderContact: string;

  // Core measurements
  floorAreaM2: number;
  perimeterLm: number;
  studHeightM: number;
  firstFloorM2: number;

  // Cladding breakdown
  lineaAreaM2: number;
  obliqueAreaM2: number;
  brickAreaM2: number;
  totalCladdingAreaM2: number;

  // Soffit
  soffitPerimeterLm: number;

  // Openings
  windowCount: number;
  windowTotalAreaM2: number;
  doorCount: number;
  garageDoorCount: number;
  slidingDoorCount: number;

  // Rooms
  bedroomCount: number;
  bathroomCount: number;
  ensuiteCount: number;
  hasWIR: boolean;
  hasLaundry: boolean;
  livingSpaceCount: number;

  // Spec
  solartubeCount: number;
  hasCeilingHatch: boolean;
  hasAtticStair: boolean;

  // Foundation type
  foundationType: "expol" | "xpod_firth" | "standard";
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

// ── Quantity calculation engine ────────────────────────────────────────────

export function calculateCartersLoads(inp: CartersInputs): CartersLoad[] {
  const sf = inp.floorAreaM2 / 200;

  const extWallAreaM2 = inp.perimeterLm * inp.studHeightM;
  const wetRoomCount = inp.bathroomCount + inp.ensuiteCount + (inp.hasLaundry ? 1 : 0);
  const wetRoomPerimeterM = wetRoomCount * 8;
  const ceilPerimeterLm = inp.perimeterLm * 1.3;
  const openingAreaM2 = inp.windowTotalAreaM2 + inp.doorCount * 1.98 + inp.garageDoorCount * 10.08;

  const gibCeilingStdM2 = Math.round(inp.floorAreaM2 * 1.05);
  const gibCeilingAqualineM2 = Math.round(wetRoomCount * 6);
  const gibWallStdM2 = Math.max(0, Math.round(extWallAreaM2 * 2 - openingAreaM2 * 1.5));
  const gibWallAqualineM2 = Math.round(wetRoomPerimeterM * inp.studHeightM);
  const gibWallBracelineM2 = Math.round(inp.perimeterLm * 0.15);

  return [
    // ── LOAD 1: Foundation ─────────────────────────────────────────────────
    {
      name: "Load 1 foundation",
      items: [
        {
          qty: Math.ceil(inp.floorAreaM2 / 6) + 20,
          unit: "Lgth",
          code: "STRD12D",
          description: "D12 HD12 500E Reinforcing",
          note: "From engineer slab design — verify with PS4",
        },
        {
          qty: Math.ceil(inp.floorAreaM2 / 7.5),
          unit: "Sheet",
          code: "STMESE620500SM",
          description: "SE62 500E Ductile Mesh",
        },
        { qty: 1, unit: "Bundle", code: "PTMKB90261", description: "Tie Wire" },
        ...(inp.foundationType === "expol"
          ? [
              {
                qty: Math.ceil(inp.floorAreaM2 / 1.21),
                unit: "Each",
                description: "Expol 1100x1100 Polystyrene Pods",
              },
              {
                qty: Math.ceil(inp.floorAreaM2 / 1.21) + 15,
                unit: "Each",
                description: "Expol Podstick",
              },
            ]
          : []),
        {
          qty: Math.ceil(inp.floorAreaM2 / 100) + 1,
          unit: "Roll",
          code: "RPPO250425",
          description: "250 Micron Polythene 100m²",
        },
        {
          qty: Math.ceil(inp.floorAreaM2 / 50),
          unit: "Roll",
          code: "RPPO250425",
          description: "250 Micron Polythene 50m²",
        },
        {
          qty: Math.ceil(inp.floorAreaM2 / 50),
          unit: "Roll",
          code: "RPJT2040116",
          description: "Polythene Tape",
        },
        { qty: Math.ceil(sf * 10), unit: "Rolls", description: "Makita Gun Tie Wire 1.6mm" },
        { qty: 1, unit: "Can", description: "Pink Upside Down Dazzle" },
        { qty: 1, unit: "Each", description: "Stringline" },
        {
          qty: Math.ceil(inp.perimeterLm / 5),
          unit: "PKT",
          code: "9045RLF8H160",
          description: "90x45 H1.2 SG8 6m (Foundation Only)",
        },
      ],
    },

    // ── LOAD 2: Framing & Hardware ─────────────────────────────────────────
    {
      name: "Load 2 Framing & Hardware",
      items: [
        {
          qty: Math.ceil(inp.perimeterLm / 12),
          unit: "Lgth",
          code: "14035RLF8H1",
          description: "140x35 H1.2 MSG8 Valley Boards 5.4m (Tile Roof)",
        },
        {
          qty: Math.ceil(inp.perimeterLm / 6),
          unit: "Lgth",
          code: "15025RAMEH3RS",
          description: "150x25 H3.2 6.0m Valley Boards",
        },
        {
          qty: Math.round(inp.floorAreaM2 * 3.0),
          unit: "M",
          description: "70x45 H1.2 MSG8 Purlin",
        },
        {
          qty: Math.ceil(inp.perimeterLm / 3.5),
          unit: "Sheet",
          code: "PPEP7DDT2412",
          description: "2700x1200 7mm DD H3.2 Bracing Ply",
        },
        {
          qty: Math.round(inp.perimeterLm * 3.5),
          unit: "M",
          code: "9045RLF8H160",
          description: "90x45 H1.2 SG8",
        },
        { qty: 1, unit: "Each", description: "Blue Dazzle" },
        { qty: 1, unit: "Each", description: "Pink Dazzle" },
        {
          qty: Math.ceil(extWallAreaM2 / 40),
          unit: "Roll",
          description: "Jennian Branded Building Wrap",
        },
        {
          qty: Math.ceil(inp.perimeterLm / 2.4),
          unit: "Bag",
          code: "FXGIBHBACWBE",
          description: "Handibracs with Bolts (1 Bag per Brace Unit)",
        },
        { qty: 1, unit: "Box", code: "NAGFC40X5KG", description: "5kg 40mm Galv Clouts" },
        { qty: 1, unit: "Box", code: "FXAP1010HD5M", description: "10mm Staples x5000" },
        { qty: 2, unit: "Box", description: "50mm Tek Screws (WANZ Bars Timber)" },
        {
          qty: 2,
          unit: "Box",
          code: "FXCFSBH650GE",
          description: "50x6mm Screw Bolts Conc (WANZ Bars)",
        },
        {
          qty: Math.ceil(inp.perimeterLm / 4),
          unit: "Each",
          code: "FXLLSBS400",
          description: "SB400 Straps",
        },
        {
          qty: Math.ceil(inp.perimeterLm / 20),
          unit: "Box",
          description: "Blue Purlin Screws Box",
        },
        {
          qty: Math.ceil(inp.floorAreaM2 / 100),
          unit: "Box",
          code: "BULLSB30T",
          description: "30m Roof Strap Brace with Tensioners",
        },
        ...(inp.brickAreaM2 > 0
          ? [
              {
                qty: 1,
                unit: "Each",
                code: "ADSKBSP4",
                description: "Sika Blackseal 4L (Brick Cladding)",
              },
              { qty: 1, unit: "Each", description: "Cheap 100mm Brush (Brick Cladding)" },
            ]
          : []),
      ],
    },

    // ── LOAD 3: Close In ───────────────────────────────────────────────────
    {
      name: "Load 3 Close In",
      items: [
        ...(inp.solartubeCount > 0
          ? [
              {
                qty: inp.solartubeCount,
                unit: "Each",
                description: "Velux Solar Tube — flexible ducting",
              },
            ]
          : []),
        {
          qty: Math.ceil(inp.floorAreaM2 / 3.24),
          unit: "Lgth",
          code: "7035RLFH1CFJ54",
          description: "70x35 H1.2 Ceiling Batten 5.4m",
        },
        {
          qty: Math.ceil((inp.soffitPerimeterLm * 0.6) / 1.44),
          unit: "Sheet",
          code: "PPHF452460",
          description: "2400x600x4.5 Hardisoffit",
        },
        {
          qty: Math.ceil(inp.soffitPerimeterLm / 20),
          unit: "Sheet",
          code: "PPHF452412",
          description: "2400x1200x4.5 Hardisoffit (corners/fillers)",
        },
        {
          qty: Math.ceil(inp.soffitPerimeterLm / 2.4),
          unit: "Lgth",
          code: "MDHA5J24",
          description: "2400 Hardijointer",
        },
        {
          qty: Math.ceil(extWallAreaM2 / 80),
          unit: "Roll",
          code: "RPDSCWFT015025",
          description: "Dristud Cool Tape 150mm x 25m",
        },
        {
          qty: Math.ceil(inp.garageDoorCount * 1.5 + 2),
          unit: "Lgth",
          code: "20040RAFJH3FSPP",
          description: "200x40 H3.1 Fascia Garage Door",
        },
        {
          qty: 2,
          unit: "Lgth",
          code: "MOFP2854",
          description: "RAD FJ H3.1 No.28 40x18 D4S 5.4m Preprimed",
        },
        {
          qty: Math.ceil(inp.perimeterLm / 12),
          unit: "Lgth",
          code: "MOFP24A54",
          description: "RAD FJ H3.1 No.24A 18x18 D4S Arrised 5.4m Preprimed",
        },
        ...(inp.brickAreaM2 > 0
          ? [
              {
                qty: Math.ceil(inp.brickAreaM2 / 200),
                unit: "Roll",
                code: "RPDLDPC200",
                description: "200mm Supercourse x30m (Brick Only)",
              },
            ]
          : []),
        {
          qty: Math.ceil(inp.perimeterLm / 15),
          unit: "Lgth",
          code: "PHSG40510",
          description: "Ezy Dwang 50x50 2.4m Backing Angle",
        },
        {
          qty: 1,
          unit: "Box",
          code: "NAIMPZB20550V",
          description: "Paslode Impulse 90x3.15mm Bright D Head Nails 3000",
        },
        {
          qty: Math.ceil(inp.perimeterLm / 15),
          unit: "Each",
          code: "CPSKNZ00177",
          description: "Sika PEF Backing Rod 15mm 100m",
        },
        {
          qty: Math.ceil(sf * 4),
          unit: "Each",
          code: "ADSK000404",
          description: "Sika Boom Expanding Foam 500ml",
        },
        ...(inp.lineaAreaM2 > 0
          ? [
              {
                qty: Math.ceil(inp.lineaAreaM2 / 0.6),
                unit: "Lgth",
                description: "200mm Linea Oblique Weatherboard 3.0m",
                note: `Based on ${Math.round(inp.lineaAreaM2)}m² Linea area`,
              },
              {
                qty: Math.ceil(inp.lineaAreaM2 / 0.84),
                unit: "Lgth",
                description: "200mm Linea Oblique Weatherboard 4.2m",
              },
              {
                qty: Math.ceil(inp.perimeterLm / 25),
                unit: "Lgth",
                description: "Linea Oblique External Box Corner",
              },
              {
                qty: Math.ceil(inp.lineaAreaM2 / 2.4),
                unit: "Lgth",
                description: "50x20 H3.1 Cavity Batten 5.4m (Linea)",
              },
            ]
          : []),
        ...(inp.obliqueAreaM2 > 0
          ? [
              {
                qty: Math.ceil(inp.obliqueAreaM2 / 0.54),
                unit: "Lgth",
                description: "50x20 H3.1 Castellated Cavity Batten 2.7m (Oblique)",
              },
            ]
          : []),
        {
          qty: Math.ceil(inp.soffitPerimeterLm / 5),
          unit: "Lgth",
          description: "18x18 PP Eaves Mould 5.4m (Soffit Mould)",
        },
        {
          qty: Math.ceil(inp.windowCount / 10),
          unit: "Lgth",
          description: "20mm Cavity Closer 3.0m",
        },
        { qty: 2, unit: "Can", description: "Spray Primer" },
        { qty: Math.ceil(inp.lineaAreaM2 / 50), unit: "Box", description: "75mm Jolt Screws" },
        {
          qty: Math.ceil(inp.windowCount / 5),
          unit: "Tube",
          description: "Bostik Seal & Flex White",
        },
      ],
    },

    // ── LOAD 4: Gib Ceilings ───────────────────────────────────────────────
    {
      name: " Load 4 Gib Ceilings",
      items: [
        {
          qty: gibCeilingStdM2,
          unit: "sqm",
          code: "PPGB13M2",
          description: "13mm Standard Gibboard Ceiling",
          note: `${inp.floorAreaM2}m² floor × 1.05`,
        },
        {
          qty: gibCeilingAqualineM2,
          unit: "sqm",
          code: "PPGBAQ13M2",
          description: "13mm Aqualine Gibboard Ceiling (wet areas)",
          note: `${wetRoomCount} wet rooms × 6m²`,
        },
        {
          qty: Math.ceil((gibCeilingStdM2 + gibCeilingAqualineM2) / 30),
          unit: "Box",
          code: "SCGGSCHT326TH",
          description: "Collated Screws 32mm x1000",
        },
        {
          qty: Math.ceil((gibCeilingStdM2 + gibCeilingAqualineM2) / 40),
          unit: "Box",
          code: "SCGGSCHT416TH",
          description: "Collated Screws 40mm x1000",
        },
        {
          qty: Math.ceil((gibCeilingStdM2 + gibCeilingAqualineM2) / 10),
          unit: "Box",
          code: "ADBOWBGS600",
          description: "Bostik Wallboard Gold Adhesive 600ml Sausage",
        },
        {
          qty: Math.ceil(wetRoomCount * 2),
          unit: "Sheet",
          description: "2400x1200x9mm 2 Edge Villa Board (Tile Shower Only)",
        },
        {
          qty: "",
          unit: "",
          description:
            "⚠ Builder to advise quantities and sizes of Gib (confirm Aqualine locations)",
        },
      ],
    },

    // ── LOAD 5: Gib Walls ──────────────────────────────────────────────────
    {
      name: "Load 5 Gib Walls",
      items: [
        {
          qty: gibWallStdM2,
          unit: "sqm",
          code: "PPGB10M2",
          description: "10mm Standard Gibboard Walls",
          note: `(${Math.round(inp.perimeterLm)}lm × ${inp.studHeightM}m × 2) − openings`,
        },
        {
          qty: gibWallAqualineM2,
          unit: "sqm",
          code: "PPGBAQ10M2",
          description: "10mm Aqualine Gibboard Walls (wet areas)",
          note: `~${wetRoomCount} wet rooms`,
        },
        {
          qty: gibWallBracelineM2,
          unit: "sqm",
          code: "PPGBBNL10M2",
          description: "10mm Braceline/Noiseline (per bracing plan)",
          note: "Confirm with bracing plan",
        },
        {
          qty: Math.ceil(ceilPerimeterLm / 3.6),
          unit: "Lgth",
          code: "PPGAGC3655",
          description: "GIB Cove Classic Cornice 55mm x 3.6m",
        },
        {
          qty: Math.ceil((gibWallStdM2 + gibWallAqualineM2) / 10),
          unit: "Box",
          code: "ADBOWBGS600",
          description: "Bostik Wallboard Gold Adhesive 600ml Sausage",
        },
        {
          qty: Math.ceil((gibWallStdM2 + gibWallAqualineM2) / 30),
          unit: "Box",
          code: "SCGGSCHT326TH",
          description: "Collated Screws 32mm x1000",
        },
        {
          qty: Math.ceil((gibWallStdM2 + gibWallAqualineM2) / 60),
          unit: "Box",
          code: "SCGGSCHT416TH",
          description: "Collated Screws 40mm x1000",
        },
        {
          qty: "",
          unit: "",
          description:
            "⚠ Builder to advise quantities and sizes of Gib (confirm Braceline locations)",
        },
      ],
    },

    // ── LOAD 6: Finishing ──────────────────────────────────────────────────
    {
      name: "Load 6 Finishing",
      items: [
        {
          qty: Math.ceil((inp.perimeterLm * 1.4 + inp.doorCount * 5) / 5.4),
          unit: "Lgth",
          code: "MOCU0254PP",
          description: "60x10 Single Bevelled MDF Skirting & Architrave 5.4m",
          note: "Allow 2.75 l/m per sqm",
        },
        {
          qty: Math.ceil(inp.bedroomCount * 2),
          unit: "Lgth",
          description: "40x18 Square MDF P/P (Wardrobes and Storage Cupboards)",
        },
        { qty: 2, unit: "Box", code: "NAIMB20750", description: "50mm Angle Brads x2000" },
        { qty: 2, unit: "Each", code: "ADBO003812", description: "PVA Glue" },
        {
          qty: Math.ceil(inp.bedroomCount * 3 + 2),
          unit: "Each",
          code: "PPFBCP18183",
          description: "1800x400x18 MDF Handiplanks (Wardrobes)",
        },
        {
          qty: Math.ceil(inp.bedroomCount * 2 + (inp.hasWIR ? 2 : 0)),
          unit: "Each",
          description: "2400x400x18 Handi Planks (Shelving)",
        },
        {
          qty: inp.bedroomCount + (inp.hasWIR ? 2 : 0),
          unit: "Each",
          code: "BHLLCRW18",
          description: "1800mm Closet Rail White",
        },
        { qty: 1, unit: "Lgth", description: "4.8m 190x45 H1.2 SG8 (HWC beam only)" },
        { qty: 1, unit: "Sheet", description: "2.4x1.2x18mm MDF Sheet (HWC backing only)" },
        {
          qty: "",
          unit: "",
          description: "⚠ Builder to advise wardrobe shelving configurations before ordering",
        },
      ],
    },

    // ── FINAL DELIVERY ─────────────────────────────────────────────────────
    {
      name: "Final Delivery",
      items: [
        {
          qty: inp.bedroomCount + inp.livingSpaceCount + 1,
          unit: "Each",
          description: "Smoke Alarms (Cavius Interconnected)",
          note: `${inp.bedroomCount} beds + ${inp.livingSpaceCount} living + 1 hall`,
        },
        {
          qty: inp.hasCeilingHatch ? 1 : 0,
          unit: "Each",
          code: "GEHATCH600500",
          description: "Ceiling Hatch 500x600mm",
        },
        ...(inp.hasAtticStair
          ? [{ qty: 1, unit: "Each", description: "Fakro LWK2800 Attic Stair" }]
          : []),
        { qty: 1, unit: "Each", description: "Austral Fold Down Compact Clothesline" },
        {
          qty: 1,
          unit: "Each",
          description: "Standard Urban Back Open Letterbox — confirm fence or urban",
        },
        { qty: 1, unit: "Each", description: "80mm Numbers for Letterbox" },
        { qty: 2, unit: "Bag", description: "25kg Fastcrete" },
        {
          qty: Math.ceil(inp.bedroomCount * 20 + 20),
          unit: "Each",
          description: "100x25 D4S Pine UT Shelving Slats (5 rows per cupboard)",
        },
        { qty: 2, unit: "Each", description: "40x18 D4S Pine UT (Props if required)" },
      ],
    },
  ];
}

// ── Supabase data loader ───────────────────────────────────────────────────

export async function buildCartersInputs(
  jobId: string,
  files?: ExtractedFile[],
): Promise<CartersInputs> {
  const [jobRes, qtyRes, openingsRes, itemsRes] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", jobId).single(),
    supabase.from("extracted_quantities").select("*").eq("job_id", jobId),
    supabase.from("opening_schedule").select("*").eq("job_id", jobId),
    supabase.from("module_items").select("*").eq("job_id", jobId),
  ]);

  const job = jobRes.data as Record<string, unknown>;
  const qtys = (qtyRes.data ?? []) as Record<string, unknown>[];
  const openings = (openingsRes.data ?? []) as Record<string, unknown>[];
  const items = (itemsRes.data ?? []) as Record<string, unknown>[];

  const qty = (type: string): number => {
    const q = qtys.find((q) => q["quantity_type"] === type);
    return Number(q?.["approved_value"] ?? q?.["extracted_value"] ?? 0);
  };

  const specItem = (label: string): string | null => {
    const i = items.find((i) =>
      String(i["label"] ?? "")
        .toLowerCase()
        .includes(label.toLowerCase()),
    );
    return (i?.["approved_value"] ?? i?.["extracted_value"] ?? null) as string | null;
  };

  const floorArea = qty("area_over_frame") || qty("total_floor_area") || 165;
  const perimeter = qty("external_perimeter") || 63.8;
  const studHeight = 2.4;

  const windows = openings.filter((o) => o["opening_type"] === "window");
  const doors = openings.filter((o) =>
    ["external", "internal", "sliding"].includes(String(o["opening_type"] ?? "")),
  );
  const garageDoors = openings.filter((o) => o["opening_type"] === "garage");

  const windowArea = windows.reduce((s, w) => {
    const width = Number(w["width_mm"] ?? 0) / 1000;
    const height = Number(w["height_mm"] ?? 0) / 1000;
    return s + width * height * Number(w["quantity"] ?? 1);
  }, 0);

  const totalCladdingArea = qty("cladding_area") || perimeter * studHeight * 0.85;
  const lineaArea = Number(specItem("Linea") ?? 0) || totalCladdingArea * 0.3;
  const brickArea = Number(specItem("Brick") ?? 0) || totalCladdingArea * 0.5;
  const obliqueArea = Math.max(0, totalCladdingArea - lineaArea - brickArea);

  const bedroomCount = Number(specItem("Bedrooms") ?? 3);
  const bathroomCount = Number(specItem("Bathrooms") ?? 1);
  const ensuiteCount = Number(specItem("Ensuite") ?? 1);

  const foundationSpec = String(specItem("Foundation") ?? "");
  const foundationType: CartersInputs["foundationType"] = /expol/i.test(foundationSpec)
    ? "expol"
    : /xpod|firth/i.test(foundationSpec)
      ? "xpod_firth"
      : "expol";

  // Merge job header from extracted files: Supabase > SMW > plans > fallback
  const smwHeader = files?.map(extractJobHeaderFromFile).find((h) => h.source === "smw");
  const plansHeader = files?.map(extractJobHeaderFromFile).find((h) => h.source === "plans");
  const resolvedJobName =
    String(job?.["client_name"] ?? "") || smwHeader?.clientName || plansHeader?.clientName || "";
  const resolvedJobNumber =
    String(job?.["job_number"] ?? "") || smwHeader?.jmwNumber || plansHeader?.jobNumber || "";
  const resolvedAddress =
    String(job?.["address"] ?? "") || smwHeader?.addressLine1 || plansHeader?.addressLine1 || "";

  return {
    jobName: resolvedJobName,
    jobNumber: resolvedJobNumber,
    deliveryAddress: resolvedAddress,
    builderContact: "STUD",

    floorAreaM2: floorArea,
    perimeterLm: perimeter,
    studHeightM: studHeight,
    firstFloorM2: qty("first_floor_area"),

    lineaAreaM2: lineaArea || totalCladdingArea * 0.4,
    obliqueAreaM2: obliqueArea,
    brickAreaM2: brickArea,
    totalCladdingAreaM2: totalCladdingArea,

    soffitPerimeterLm: perimeter,

    windowCount: windows.reduce((s, w) => s + Number(w["quantity"] ?? 1), 0),
    windowTotalAreaM2: windowArea,
    doorCount: doors.reduce((s, d) => s + Number(d["quantity"] ?? 1), 0),
    garageDoorCount: garageDoors.reduce((s, g) => s + Number(g["quantity"] ?? 1), 0),
    slidingDoorCount: openings
      .filter((o) => o["opening_type"] === "sliding")
      .reduce((s, d) => s + Number(d["quantity"] ?? 1), 0),

    bedroomCount,
    bathroomCount,
    ensuiteCount,
    hasWIR: bedroomCount >= 3,
    hasLaundry: true,
    livingSpaceCount: 2,

    solartubeCount: Number(specItem("Solartube") ?? 0),
    hasCeilingHatch: true,
    hasAtticStair: !!specItem("Attic Stair"),

    foundationType,
  };
}

// ── Excel writer ───────────────────────────────────────────────────────────

export function writeCartersLoadsExcel(loads: CartersLoad[], inputs: CartersInputs): Blob {
  const wb = XLSX.utils.book_new();

  for (const load of loads) {
    const rows: (string | number)[][] = [
      ["Stage Loads"],
      [],
      [load.name.replace(/^\s+/, "")],
      [],
      ["Job name", inputs.jobName],
      ["Job number", inputs.jobNumber],
      ["Delivery Address", inputs.deliveryAddress],
      ["Builder contact", inputs.builderContact],
      [],
      ["Delivery Date", ""],
      [],
      ["Quantity", "", "Description"],
    ];

    for (const item of load.items) {
      const row: (string | number)[] = [
        item.qty === "" ? "" : item.qty,
        item.unit,
        item.description,
      ];
      if (item.note) row.push(item.note);
      rows.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 10 }, { wch: 8 }, { wch: 60 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws, load.name);
  }

  // Full summary sheet for Kirsty at Carters
  const summaryRows: (string | number)[][] = [
    ["Stage Loads — Full Order Summary"],
    [],
    ["Job", inputs.jobName, "", "Job Number", inputs.jobNumber],
    ["Address", inputs.deliveryAddress],
    [],
  ];
  for (const load of loads) {
    summaryRows.push([load.name.replace(/^\s+/, "").toUpperCase()]);
    summaryRows.push(["Qty", "Unit", "Description"]);
    for (const item of load.items) {
      if (!item.description || item.qty === "") continue;
      summaryRows.push([item.qty, item.unit, item.description]);
    }
    summaryRows.push([]);
  }
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 10 }, { wch: 8 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "KIRSTY");

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export async function exportCartersLoads(jobId: string): Promise<{
  blob: Blob;
  filename: string;
}> {
  const inputs = await buildCartersInputs(jobId);
  const loads = calculateCartersLoads(inputs);
  const blob = writeCartersLoadsExcel(loads, inputs);
  return { blob, filename: `${inputs.jobNumber}-Carters-Stage-Loads.xlsx` };
}
