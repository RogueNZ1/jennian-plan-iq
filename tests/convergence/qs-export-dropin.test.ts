// @vitest-environment node
/**
 * Drop-in paste sheet — buildDropInSheet.
 *
 * Verifies the exact cell addresses that must match the master's IQ Input tab.
 * All tests are offline (no DB, no AI). The fixture is JM-0015/Young-shaped:
 * 10 openings including the Dining slider, no garage, 5+2+2 door counts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildDropInSheet, type QSExportData } from "../../src/lib/iq-qs-export";
import { buildExtractedQuantityReadModel } from "../../src/lib/takeoff/extracted-quantity-read-model";
import type { ExtractedQuantity } from "../../src/lib/takeoff/extracted-quantity-ledger";
import type { Opening } from "../../src/lib/takeoff/takeoff-types";

// ── helpers ──────────────────────────────────────────────────────────────────
function cellVal(ws: ReturnType<typeof buildDropInSheet>, addr: string): unknown {
  const c = ws[addr] as { v?: unknown } | undefined;
  return c?.v ?? undefined;
}

/** Minimal QSExportData base used across tests. */
function base(over: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "JM-0015",
    clientName: "Test Client",
    address: "23 Main St, Feilding",
    templateId: null,
    createdAt: "",
    floorAreaM2: 100.3,
    perimeterLm: 44.6,
    firstFloorAreaM2: null,
    studHeightMm: 2400,
    alfrescoAreaM2: 0.9,
    roofPitch: null,
    ridgeType: null,
    underlay: null,
    claddingType1: null,
    claddingType2: null,
    windows: [],
    garageDoors: [],
    interiorDoors: [],
    downpipes: [],
    heatPumps: [],
    extras: [],
    skylights: [],
    clientFirstName: "Test",
    clientSurname: "Client",
    streetAddress: "23 Main St",
    addressLine2: null,
    city: "Feilding",
    email: null,
    phone: null,
    jmwNumber: "JM-0015",
    planVersion: "1",
    exteriorWallLengthLm: 44.6,
    exteriorWallHeightM: 2.4,
    pathsPatioM2: null,
    drivewayM2: null,
    windowsByRoom: {},
    downpipesWhite: 0,
    downpipesColourSteel: 0,
    downpipesPvcColoured: 0,
    garageDoor48x21Std: 0,
    garageDoor48x21Insulated: 0,
    garageDoor24x21Std: 0,
    garageDoor24x21Insulated: 0,
    garageDoor27x21Std: 0,
    garageDoor27x21Insulated: 0,
    intDoorStandard: 0,
    intDoorUGroove: 0,
    intDoorVGroove: 0,
    intDoorBarnSlider: 0,
    intDoorDouble: 0,
    intDoorCavitySlider: 0,
    ceilingHatch: 0,
    atticStair: 0,
    letterboxUrban: 0,
    washingLine: 0,
    heatPumpWallUnit: 0,
    heatPumpDucted: 0,
    specItems: {},
    openings: null,
    ...over,
  };
}

function op(type: Opening["type"], room: string | null, h: number, w: number): Opening {
  return {
    type,
    room,
    height_m: h,
    width_m: w,
    glazed: type !== "sectional_door",
    cladding: null,
    area_m2: h * w,
    source: "vision",
    confidence: "medium",
  };
}

function eq(over: Partial<ExtractedQuantity>): ExtractedQuantity {
  const timestamp = "2026-07-01T00:00:00.000Z";
  return {
    id: "eq-window",
    jobId: "job-62",
    runId: "run-62",
    category: "window",
    label: "Window",
    count: 1,
    widthMm: 1300,
    heightMm: 2400,
    lengthMm: null,
    areaM2: 3.12,
    source: "pdf_text",
    evidence: [],
    status: "extracted",
    confidence: 95,
    warnings: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...over,
  };
}

function fennerExtractedQuantityReadModel() {
  return buildExtractedQuantityReadModel([
    eq({ id: "family", label: "FAMILY", widthMm: 2400, heightMm: 1300, areaM2: 3.12 }),
    eq({ id: "dining", label: "DINING", widthMm: 2400, heightMm: 1300, areaM2: 3.12 }),
    eq({ id: "study", label: "STUDY/BED4", widthMm: 1500, heightMm: 1300, areaM2: 1.95 }),
    eq({ id: "ensuite", label: "ENSUITE", widthMm: 600, heightMm: 2150, areaM2: 1.29 }),
    eq({ id: "bath", label: "BATH", widthMm: 1200, heightMm: 1100, areaM2: 1.32 }),
    eq({ id: "bed2", label: "BED2", widthMm: 1500, heightMm: 1300, areaM2: 1.95 }),
    eq({ id: "masterbed-a", label: "MASTERBED", widthMm: 800, heightMm: 1100, areaM2: 0.88 }),
    eq({ id: "masterbed-b", label: "MASTERBED", widthMm: 800, heightMm: 1100, areaM2: 0.88 }),
    eq({ id: "bed3", label: "BED3", widthMm: 2400, heightMm: 1300, areaM2: 3.12 }),
    eq({
      id: "garage-review",
      category: "garage_door",
      label: "Garage Door",
      widthMm: 4800,
      heightMm: 2100,
      areaM2: 10.08,
      status: "conflict",
      warnings: ["source_conflict"],
      source: "floorplan_symbol",
    }),
  ]);
}

// ── Young-shaped openings (10 rows, Dining slider included) ──────────────────
const YOUNG_OPENINGS: Opening[] = [
  op("window", "Bed 1 (Master)", 1.3, 1.8),
  op("window", "Bed 1 (Master)", 1.3, 1.8),
  op("window", "Bed 2", 1.3, 1.5),
  op("window", "Kitchen", 1.8, 0.6),
  op("window", "Lounge", 1.4, 1.3),
  op("window", "Wc", 1.1, 0.7),
  op("window", "Bathroom", 1.1, 0.7),
  op("window", "Laundry", 1.8, 0.6), // ← must be dropped (no laundry window slot)
  op("slider", "Dining", 2.1, 2.4), // ← must land at row 59
  op("entrance", "Entry", 2.1, 0), // ← w=0 unresolved, must appear at row 72
];

/** All manual-block lines (A48+) joined for matching. */
function manualBlock(ws: ReturnType<typeof buildDropInSheet>): string {
  let out = "";
  for (let r = 47; r < 80; r++) {
    const v = cellVal(ws, `A${r}`);
    if (typeof v === "string") out += v + "\n";
  }
  return out;
}

describe("buildDropInSheet — IQ Import meta block (live QS v4_1 contract)", () => {
  it("writes job/client/address and the QS-read measurement cells", () => {
    const ws = buildDropInSheet(base());
    expect(cellVal(ws, "B1")).toBe("JM-0015");
    expect(cellVal(ws, "B2")).toBe("Test Client");
    expect(cellVal(ws, "B3")).toBe("23 Main St, Feilding"); // street + city, no hardcoded fallback
    expect(cellVal(ws, "B9")).toBe(100.3); // floor m² → QS D4
    expect(cellVal(ws, "B11")).toBe(0.9); // alfresco → QS D13
    expect(cellVal(ws, "B12")).toBe(44.6); // ext wall lm → QS E4
    expect(cellVal(ws, "B22")).toBe(2.4); // ceiling in METRES (QS D20 expects m)
  });

  it("writes garage area when known, and never invents alfresco zero when unknown", () => {
    const ws = buildDropInSheet(base({ garageAreaM2: 23.8, alfrescoAreaM2: null }));
    expect(cellVal(ws, "B10")).toBe(23.8);
    expect(cellVal(ws, "B11")).toBe("");
    expect(String(cellVal(ws, "D11") ?? "")).toContain("verify on plan");
  });

  it("door breakdown lands at B27-B30 (→ H187/H193/H192/H190)", () => {
    const ws = buildDropInSheet(
      base({
        doorsSource: "engine",
        intDoorStandard: 12,
        intDoorCavitySlider: 1,
        intDoorDouble: 4,
        intDoorBarnSlider: 0,
      }),
    );
    expect(cellVal(ws, "B27")).toBe(12);
    expect(cellVal(ws, "B28")).toBe(1);
    expect(cellVal(ws, "B29")).toBe(4);
    expect(cellVal(ws, "B30")).toBe(0);
    expect(cellVal(ws, "B17")).toBe(17); // internal doors total
  });

  it("never invents roof area — B14 stays blank", () => {
    const ws = buildDropInSheet(base());
    expect(cellVal(ws, "B14")).toBe("");
  });
});

describe("buildDropInSheet — window slots (rows 33-45, B=Qty C=HEIGHT D=WIDTH)", () => {
  it("Young-shaped fixture lands every room on its positional row", () => {
    const ws = buildDropInSheet(base({ openings: YOUNG_OPENINGS }));
    // Bed 1: two identical 1.3H×1.8W aggregate at row 33
    expect([cellVal(ws, "B33"), cellVal(ws, "C33"), cellVal(ws, "D33")]).toEqual([2, 1.3, 1.8]);
    // Bed 2 row 35
    expect([cellVal(ws, "B35"), cellVal(ws, "C35"), cellVal(ws, "D35")]).toEqual([1, 1.3, 1.5]);
    // Kitchen row 39 — HEIGHT in C (1.8), WIDTH in D (0.6): the transposition fix
    expect([cellVal(ws, "B39"), cellVal(ws, "C39"), cellVal(ws, "D39")]).toEqual([1, 1.8, 0.6]);
    // Lounge row 42
    expect([cellVal(ws, "B42"), cellVal(ws, "C42"), cellVal(ws, "D42")]).toEqual([1, 1.4, 1.3]);
  });

  it("Dining slider lands on row 41 (dims feed QS E59/F59; qty manual is flagged)", () => {
    const ws = buildDropInSheet(base({ openings: [op("slider", "Dining", 2.1, 2.4)] }));
    expect([cellVal(ws, "B41"), cellVal(ws, "C41"), cellVal(ws, "D41")]).toEqual([1, 2.1, 2.4]);
    expect(manualBlock(ws)).toMatch(/Dining QTY is manual/);
  });

  it("Toilet/WC has NO IQ slot — routed to the manual block with target row 51", () => {
    const ws = buildDropInSheet(base({ openings: [op("window", "Wc", 1.1, 0.7)] }));
    expect(manualBlock(ws)).toMatch(/UNPLACED - Toilet: 1 window\(s\) @ 1\.1H x 0\.7W.*row 51/);
    // and nothing leaked into a slot
    for (let r = 33; r <= 45; r++) expect(cellVal(ws, `B${r}`)).toBe(0);
  });

  it("entrance lands on row 45", () => {
    const ws = buildDropInSheet(base({ openings: [op("entrance", null, 2.1, 1.0)] }));
    expect([cellVal(ws, "B45"), cellVal(ws, "C45"), cellVal(ws, "D45")]).toEqual([1, 2.1, 1]);
  });

  it("PA/laundry door has no IQ feed — manual block, target row 70", () => {
    const ws = buildDropInSheet(base({ openings: [op("pa_door", "Laundry", 2.0, 0.86)] }));
    expect(cellVal(ws, "B15")).toBe(1);
    expect(manualBlock(ws)).toMatch(/Laundry\/PA door 2H x 0\.86W.*row 70/);
    expect(manualBlock(ws)).toMatch(/1 of 1 QS openings require manual\/overflow entry/);
  });

  it("every unused slot row is explicitly zeroed (stale paste residue dies)", () => {
    const ws = buildDropInSheet(base({ openings: [op("window", "Bed 1", 1.3, 1.8)] }));
    for (const r of [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 45]) {
      expect(cellVal(ws, `B${r}`), `B${r}`).toBe(0);
      expect(cellVal(ws, `C${r}`), `C${r}`).toBe(0);
      expect(cellVal(ws, `D${r}`), `D${r}`).toBe(0);
    }
  });

  it("relational windowsByRoom fallback fills the same slots; kitchenExtra folds into kitchen", () => {
    const ws = buildDropInSheet(
      base({
        openings: null,
        windowsByRoom: {
          bed1: { qty: 2, height: 1.3, width: 1.8 },
          kitchen: { qty: 1, height: 1.8, width: 0.6 },
          kitchenExtra: { qty: 1, height: 0.6, width: 2.4 },
        } as QSExportData["windowsByRoom"],
      }),
    );
    expect([cellVal(ws, "B33"), cellVal(ws, "C33"), cellVal(ws, "D33")]).toEqual([2, 1.3, 1.8]);
    expect([cellVal(ws, "B39"), cellVal(ws, "C39"), cellVal(ws, "D39")]).toEqual([1, 1.8, 0.6]);
    expect(manualBlock(ws)).toMatch(/Kitchen: 1 more @ 0\.6H x 2\.4W/); // second dim-group -> manual
  });
});

describe("buildDropInSheet — multi-dims per room: slot takes group 1, manual block takes the rest", () => {
  it("JM-0020 lounge: 2× window in the slot, slider in the manual block with overflow row 63", () => {
    const ws = buildDropInSheet(
      base({
        openings: [
          op("window", "Lounge", 1.3, 1.8),
          op("window", "Lounge", 1.3, 1.8),
          op("slider", "Lounge", 2.1, 2.4),
        ],
      }),
    );
    expect([cellVal(ws, "B42"), cellVal(ws, "C42"), cellVal(ws, "D42")]).toEqual([2, 1.3, 1.8]);
    const m = manualBlock(ws);
    expect(m).toMatch(/Lounge: 1 more @ 2\.1H x 2\.4W.*row 63/);
    expect(m).toMatch(/Lounge QTY is manual/);
  });

  it("same-dims openings aggregate without any manual lines", () => {
    const ws = buildDropInSheet(
      base({
        openings: [op("window", "Lounge", 1.8, 0.8), op("window", "Lounge", 1.8, 0.8)],
      }),
    );
    expect(cellVal(ws, "B42")).toBe(2);
    expect(manualBlock(ws)).not.toMatch(/Lounge: \d+ more/);
  });
});

describe("buildDropInSheet — garage door 1 (row 44) + size string B24", () => {
  it("no garage anywhere → B24 empty, row 44 zeroed", () => {
    const ws = buildDropInSheet(base());
    expect(cellVal(ws, "B24")).toBe("");
    expect([cellVal(ws, "B44"), cellVal(ws, "C44"), cellVal(ws, "D44")]).toEqual([0, 0, 0]);
  });

  it("relational insulated 4.8 → B24='4.8x2.1' (H176 string match) + row 44 filled", () => {
    const ws = buildDropInSheet(base({ garageDoor48x21Insulated: 1 }));
    expect(cellVal(ws, "B24")).toBe("4.8x2.1");
    expect([cellVal(ws, "B44"), cellVal(ws, "C44"), cellVal(ws, "D44")]).toEqual([1, 2.1, 4.8]);
    expect(manualBlock(ws)).toMatch(/only H176.*auto-fills/);
  });

  it("canonical 3.0×2.1 sectional → exact size string, NEVER re-binned", () => {
    const ws = buildDropInSheet(base({ openings: [op("sectional_door", "Garage", 2.1, 3.0)] }));
    expect(cellVal(ws, "B24")).toBe("3x2.1");
    expect([cellVal(ws, "B44"), cellVal(ws, "C44"), cellVal(ws, "D44")]).toEqual([1, 2.1, 3]);
  });

  it("two distinct canonical sizes → first on row 44, second in the manual block", () => {
    const ws = buildDropInSheet(
      base({
        openings: [
          op("sectional_door", "Garage", 2.1, 4.8),
          op("sectional_door", "Garage", 2.1, 3.0),
        ],
      }),
    );
    expect(cellVal(ws, "B24")).toBe("4.8x2.1");
    expect(manualBlock(ws)).toMatch(/Garage door 3x2\.1 x1/);
  });

  it("relational counters win over canonical sectionals (insulation knowledge)", () => {
    const ws = buildDropInSheet(
      base({
        garageDoor24x21Std: 1,
        openings: [op("sectional_door", "Garage", 2.1, 4.8)],
      }),
    );
    expect(cellVal(ws, "B24")).toBe("2.4x2.1");
    expect([cellVal(ws, "C44"), cellVal(ws, "D44")]).toEqual([2.1, 2.4]);
  });
});

describe("buildDropInSheet - blocked opening handoff semantics", () => {
  it("row-level gate: clean extracted rows auto-fill their slots; unresolved slots stay blank", () => {
    const ws = buildDropInSheet(
      base({
        openings: [op("window", "Lounge", 1.3, 1.8)],
        openingPricingBlocked: true,
        extractedQuantityReadModel: fennerExtractedQuantityReadModel(),
      }),
    );

    // Clean W x H rows land in their IQ slots (B=Qty C=Height D=Width).
    expect([cellVal(ws, "B33"), cellVal(ws, "C33"), cellVal(ws, "D33")]).toEqual([2, 1.1, 0.8]); // Bed 1 (MASTERBED x2)
    expect([cellVal(ws, "B34"), cellVal(ws, "C34"), cellVal(ws, "D34")]).toEqual([1, 2.15, 0.6]); // Ensuite
    expect([cellVal(ws, "B35"), cellVal(ws, "C35"), cellVal(ws, "D35")]).toEqual([1, 1.3, 1.5]); // Bed 2
    expect([cellVal(ws, "B36"), cellVal(ws, "C36"), cellVal(ws, "D36")]).toEqual([1, 1.3, 2.4]); // Bed 3
    expect([cellVal(ws, "B37"), cellVal(ws, "C37"), cellVal(ws, "D37")]).toEqual([1, 1.3, 1.5]); // Bed 4 (STUDY/BED4)
    expect([cellVal(ws, "B38"), cellVal(ws, "C38"), cellVal(ws, "D38")]).toEqual([1, 1.1, 1.2]); // Bathroom
    expect([cellVal(ws, "B40"), cellVal(ws, "C40"), cellVal(ws, "D40")]).toEqual([1, 1.3, 2.4]); // Family
    expect([cellVal(ws, "B41"), cellVal(ws, "C41"), cellVal(ws, "D41")]).toEqual([1, 1.3, 2.4]); // Dining

    // Unresolved slots stay blank - never zero. The blocked composed opening (Lounge)
    // must NOT leak into its slot; only clean ledger rows write.
    for (const r of [39, 42, 43, 45]) {
      expect(cellVal(ws, `B${r}`), `B${r}`).toBe("");
      expect(cellVal(ws, `C${r}`), `C${r}`).toBe("");
      expect(cellVal(ws, `D${r}`), `D${r}`).toBe("");
    }
    // Aggregate window total stays unconfirmed while reconciliation is blocked.
    expect(cellVal(ws, "B15")).toBe("");
    expect(cellVal(ws, "C15")).toBe(
      "9 clean window(s) auto-filled in rows 33-45; total unconfirmed - opening reconciliation blocked",
    );
    expect(manualBlock(ws)).toContain("AI Takeoff Check - JM-0015");
    expect(manualBlock(ws)).toContain("Status: REVIEW REQUIRED - openings unresolved");
    expect(manualBlock(ws)).toContain("Clean window evidence 9 rows / 17.63 m2");
    expect(manualBlock(ws)).toContain("Do not price: unresolved openings, garage door, cladding");
  });

  it("row-level gate: clean rows without an IQ slot surface as manual lines, never dropped", () => {
    const ws = buildDropInSheet(
      base({
        openingPricingBlocked: true,
        extractedQuantityReadModel: buildExtractedQuantityReadModel([
          eq({ id: "scullery", label: "SCULLERY", widthMm: 900, heightMm: 1100, areaM2: 0.99 }),
          eq({ id: "wc", label: "WC", widthMm: 700, heightMm: 1100, areaM2: 0.77 }),
        ]),
      }),
    );
    for (const r of [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 45]) {
      expect(cellVal(ws, `B${r}`), `B${r}`).toBe("");
    }
    const text = manualBlock(ws);
    expect(text).toContain("Review CLEAN (no IQ slot) - SCULLERY: 1 @ 1.1H x 0.9W");
    expect(text).toContain("Review CLEAN (manual slot) - WC: 1 @ 1.1H x 0.7W -> Data Input House row 51");
  });

  it("does not emit legacy 2.4x2.1 garage import values while garage evidence is review-only", () => {
    const ws = buildDropInSheet(
      base({
        openingPricingBlocked: true,
        garageDoor24x21Std: 1,
        extractedQuantityReadModel: fennerExtractedQuantityReadModel(),
      }),
    );
    const text = manualBlock(ws);

    expect(cellVal(ws, "B24")).toBe("");
    expect([cellVal(ws, "B44"), cellVal(ws, "C44"), cellVal(ws, "D44")]).toEqual(["", "", ""]);
    expect(manualBlock(ws)).toContain("Garage: 4.8 x 2.1 garage door candidate found");
    expect(text).not.toContain("2.4x2.1");
  });
});

describe("module-item reads — APPROVED value wins over raw extraction", () => {
  // The estimator's UI correction must reach the export. Exporting the raw extraction
  // over a human approval was silent margin erosion on every module-sourced field.
  it("approved > extracted > null", async () => {
    const { pickModuleValue } = await import("../../src/lib/iq-qs-export");
    expect(pickModuleValue({ approved_value: "Brick Veneer", extracted_value: "Linea" })).toBe(
      "Brick Veneer",
    );
    expect(pickModuleValue({ approved_value: null, extracted_value: "Linea" })).toBe("Linea");
    expect(pickModuleValue({ approved_value: null, extracted_value: null })).toBeNull();
    expect(pickModuleValue(undefined)).toBeNull();
  });
});

describe("internal wall length — suppressed until P2 (policy reversed 12 Jun)", () => {
  it("B13 is ALWAYS blank + D13 flag — the engine's room-based estimate was proven wrong-low in the live audit (7 lm vs ~50+ real); never print a priceable number until the ribbon-trace ships", async () => {
    const ws1 = buildDropInSheet(base({ internalWallLm: 47.3 }));
    expect(cellVal(ws1, "B13")).toBe(""); // even when a value exists, it is not trustworthy
    expect(String(cellVal(ws1, "D13") ?? "")).toContain("UNVERIFIED");
    const ws2 = buildDropInSheet(base());
    expect(cellVal(ws2, "B13")).toBe(""); // no measurement → blank, not a guess
  });
});

describe("CLADDING (ENGINE) block on the IQ Import sheet", () => {
  function blockText(ws: ReturnType<typeof buildDropInSheet>): string {
    let out = "";
    for (let r = 47; r < 110; r++) {
      const v = cellVal(ws, `A${r}`);
      if (typeof v === "string") out += v + "\n";
    }
    return out;
  }

  it("flag-free single-type house renders all four provable terms + per-type net", () => {
    const ws = buildDropInSheet(
      base({
        perimeterLm: 52,
        studHeightMm: 2400,
        claddingType1: "Brick Veneer",
        elevationSummary: {
          roofType: "Gable",
          roofPitchDegrees: 25,
          externalDoorCount: 1,
          gableEndCount: 0,
          drivewayConcretM2: null,
          patioConcreteM2: null,
          totalConcreteM2: null,
          windowCountMatch: null,
          windowCountWarning: null,
        },
        openings: [op("window", "Lounge", 1.3, 1.8)],
      }),
    );
    const t = blockText(ws);
    expect(t).toMatch(/Wall \(perimeter x stud\): 124.8 m2/);
    expect(t).toMatch(/Gables: 0 m2/);
    expect(t).toMatch(/Less openings: 2.34 m2/);
    expect(t).toMatch(/NET CLADDING: 122.46 m2/);
    expect(t).toMatch(/- Brick Veneer: 122.46 m2/);
  });

  it("gabled house without measured span: NET NOT COMPUTED + flag — never a guess", () => {
    const ws = buildDropInSheet(
      base({
        perimeterLm: 52,
        studHeightMm: 2400,
        claddingType1: "Linea",
        elevationSummary: {
          roofType: "Gable",
          roofPitchDegrees: 25,
          externalDoorCount: 1,
          gableEndCount: 2,
          drivewayConcretM2: null,
          patioConcreteM2: null,
          totalConcreteM2: null,
          windowCountMatch: null,
          windowCountWarning: null,
        },
        openings: [],
      }),
    );
    const t = blockText(ws);
    expect(t).toMatch(/NET CLADDING: NOT COMPUTED/);
    expect(t).toMatch(/gable span not measured/);
  });

  it("no elevation extraction at all → gable-count VERIFY flag", () => {
    const ws = buildDropInSheet(base({ perimeterLm: 52, studHeightMm: 2400 }));
    expect(blockText(ws)).toMatch(/gable count not extracted .* VERIFY/);
  });
});

describe("dropInSheetToTSV — clipboard paste block", () => {
  it("emits the exact sheet as TSV: meta, slots, doors, cladding block", async () => {
    const { dropInSheetToTSV } = await import("../../src/lib/iq-qs-export");
    const tsv = dropInSheetToTSV(
      base({
        openings: [op("window", "Bed 1", 1.3, 1.8), op("window", "Bed 1", 1.3, 1.8)],
        doorsSource: "engine",
        intDoorStandard: 6,
        intDoorCavitySlider: 1,
      }),
    );
    const lines = tsv.split("\n");
    expect(lines[0]).toBe("Job Number\tJM-0015\t\t\t\t"); // A1:F1
    expect(lines[32]).toBe("Bed 1\t2\t1.3\t1.8\t\t"); // row 33 slot
    expect(lines[26]).toMatch(/^- Standard hinged\t6\t/); // B27
    expect(tsv).toMatch(/CLADDING \(ENGINE\)/);
    expect(tsv).not.toMatch(/\t.*\t.*\t.*\t.*\t.*\t/); // never >6 columns
  });
});

describe("CLADDING V1.1 — gable span from geometry on the sheet", () => {
  it("gabled house WITH measured span: NET computed + envelope verify-note", () => {
    const ws = buildDropInSheet(
      base({
        perimeterLm: 52,
        studHeightMm: 2400,
        claddingType1: "Linea",
        gableSpanM: 10,
        elevationSummary: {
          roofType: "Gable",
          roofPitchDegrees: 25,
          externalDoorCount: 1,
          gableEndCount: 2,
          drivewayConcretM2: null,
          patioConcreteM2: null,
          totalConcreteM2: null,
          windowCountMatch: null,
          windowCountWarning: null,
        },
        openings: [],
      }),
    );
    let t = "";
    for (let r = 47; r < 110; r++) {
      const v = cellVal(ws, `A${r}`);
      if (typeof v === "string") t += v + "\n";
    }
    expect(t).toMatch(/NET CLADDING: 148.12 m2/); // 124.8 + 23.32 - 0
    expect(t).toMatch(/gable span 10m = plan envelope short side/);
    expect(t).not.toMatch(/gable span not measured/);
  });
});
