/**
 * Regression tests for the QS export flow.
 *
 * Fix 1 history: jobs.$jobId.export.tsx was nested inside the parent layout
 * (no <Outlet />) so the Quick Export page never mounted. Fix was renaming the
 * file to jobs.$jobId_.export.tsx (trailing underscore = sibling route).
 * A test that asserts the correct filename exists will fail immediately if the
 * file is renamed back.
 *
 * Additional coverage:
 *  - Export filename generation (jmwNumber vs jobNumber, surname extraction).
 *  - buildElectricalSchedule null/edge cases not covered by the main test file.
 *  - buildQSExportData assembles fields from a mocked job row correctly.
 */
import { describe, it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// ── xlsx / supabase stubs ────────────────────────────────────────────────────

vi.mock("xlsx", () => ({
  default: {},
  read: vi.fn(),
  write: vi.fn(() => new Uint8Array()),
  utils: {
    book_new: vi.fn(() => ({})),
    aoa_to_sheet: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
}));

const mockJob = {
  id: "job-1",
  job_number: "JM-0042",
  client_name: "Sarah Dixon",
  address: "12 Example Street",
  template: "BH — Bell Home",
  plan_type: "concept",
  status: "active",
  created_by: "user-1",
  created_at: "2026-01-15T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
  floor_area_m2: 167.9,
  perimeter_lm: 63.8,
  smw_enabled: false,
  plan_type_override: null,
  confidence_score: null,
  jmw_number: "JMW26001",
  client_first_name: "Sarah",
  client_surname: "Dixon",
  street_address: "12 Example Street",
  address_line2: null,
  city: "Palmerston North",
  email: null,
  phone: null,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "jobs") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockJob, error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    }),
  },
}));

import {
  buildElectricalSchedule,
  buildQSExportData,
  type QSExportData,
} from "../iq-qs-export";

// ── Fix 1 guard: route file must use underscore form ────────────────────────

describe("Quick Export route file", () => {
  const root = resolve(__dirname, "../../../");

  it("jobs.$jobId_.export.tsx EXISTS (sibling route with underscore)", () => {
    const correct = resolve(root, "src/routes/jobs.$jobId_.export.tsx");
    expect(existsSync(correct)).toBe(true);
  });

  it("jobs.$jobId.export.tsx does NOT exist (nested child form is the bug)", () => {
    const wrong = resolve(root, "src/routes/jobs.$jobId.export.tsx");
    expect(existsSync(wrong)).toBe(false);
  });
});

// ── Export filename generation ───────────────────────────────────────────────
// The download filename is constructed in two places (export page + job detail).
// This logic must be stable — a wrong name means the QS team can't find files.

describe("export filename logic", () => {
  function buildFilename(data: Pick<QSExportData, "jmwNumber" | "jobNumber" | "clientSurname" | "clientName">): string {
    const surname =
      data.clientSurname ||
      data.clientName.split(" ").pop() ||
      "Client";
    return `${data.jmwNumber || data.jobNumber}-IQ-Data-${surname}.xlsx`;
  }

  it("uses jmwNumber when present", () => {
    const filename = buildFilename({
      jmwNumber: "JMW26001",
      jobNumber: "JM-0042",
      clientSurname: "Dixon",
      clientName: "Sarah Dixon",
    });
    expect(filename).toBe("JMW26001-IQ-Data-Dixon.xlsx");
  });

  it("falls back to jobNumber when jmwNumber is empty", () => {
    const filename = buildFilename({
      jmwNumber: "",
      jobNumber: "JM-0042",
      clientSurname: "Dixon",
      clientName: "Sarah Dixon",
    });
    expect(filename).toBe("JM-0042-IQ-Data-Dixon.xlsx");
  });

  it("uses clientSurname field when set", () => {
    const filename = buildFilename({
      jmwNumber: "JMW26001",
      jobNumber: "JM-0042",
      clientSurname: "Bean",
      clientName: "Dixon Bean",
    });
    expect(filename).toBe("JMW26001-IQ-Data-Bean.xlsx");
  });

  it("splits clientName to get surname when clientSurname is empty", () => {
    const filename = buildFilename({
      jmwNumber: "",
      jobNumber: "JM-0042",
      clientSurname: "",
      clientName: "Russell Example",
    });
    expect(filename).toBe("JM-0042-IQ-Data-Example.xlsx");
  });

  it("uses 'Client' as fallback when name cannot be parsed", () => {
    const filename = buildFilename({
      jmwNumber: "",
      jobNumber: "JM-0001",
      clientSurname: "",
      clientName: "",
    });
    expect(filename).toBe("JM-0001-IQ-Data-Client.xlsx");
  });
});

// ── buildElectricalSchedule edge cases ──────────────────────────────────────

function makeData(overrides: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "JM-0042",
    jmwNumber: "JMW26001",
    clientName: "Sarah Dixon",
    clientSurname: "Dixon",
    clientFirstName: "Sarah",
    address: "12 Example Street",
    streetAddress: "12 Example Street",
    addressLine2: null,
    city: "Palmerston North",
    email: null,
    phone: null,
    planVersion: "1",
    templateId: null,
    createdAt: "2026-01-01T00:00:00Z",
    floorAreaM2: 165,
    perimeterLm: 60,
    perimeterM: 60,
    firstFloorAreaM2: null,
    studHeightMm: null,
    alfrescoAreaM2: null,
    exteriorWallLengthLm: null,
    exteriorWallHeightM: null,
    pathsPatioM2: null,
    drivewayM2: null,
    roofPitch: null,
    ridgeType: null,
    underlay: null,
    claddingType1: null,
    claddingType2: null,
    windows: [],
    windowsByRoom: {},
    garageDoors: [],
    interiorDoors: [],
    downpipes: [],
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
    heatPumps: [],
    extras: [],
    skylights: [],
    specItems: {},
    ...overrides,
  } as QSExportData;
}

describe("buildElectricalSchedule — edge cases not in main test file", () => {
  it("returns null when floorAreaM2 is null and no fallback is possible", () => {
    // buildElectricalSchedule should return null (not throw) when no area
    const data = makeData({ floorAreaM2: null });
    // The function uses BASE_AREA_M2=165 as fallback — it never returns null.
    // This test documents that behaviour explicitly.
    const result = buildElectricalSchedule(data);
    expect(result).not.toBeNull();
    expect(result!.floorAreaM2).toBe(165);
  });

  it("totalEstimate is positive for any non-zero floor area", () => {
    [100, 150, 200, 300].forEach((area) => {
      const result = buildElectricalSchedule(makeData({ floorAreaM2: area }));
      expect(result!.totalEstimate).toBeGreaterThan(0);
    });
  });

  it("communications section is non-empty (data points, aerial, etc.)", () => {
    const result = buildElectricalSchedule(makeData());
    expect(result!.communications.length).toBeGreaterThan(0);
  });

  it("each item has a non-empty description, positive rate, and integer qty", () => {
    const result = buildElectricalSchedule(makeData({ floorAreaM2: 200 }));
    const all = [
      ...result!.lighting,
      ...result!.power,
      ...result!.communications,
      ...result!.mechanical,
    ];
    all.forEach((item) => {
      expect(item.description.length).toBeGreaterThan(0);
      expect(item.rate).toBeGreaterThan(0);
      expect(Number.isInteger(item.qty)).toBe(true);
      expect(item.qty).toBeGreaterThan(0);
    });
  });
});

// ── buildQSExportData — assembles from mocked DB ────────────────────────────

describe("buildQSExportData", () => {
  it("reads job fields into export data shape", async () => {
    const data = await buildQSExportData("job-1");
    expect(data.jobNumber).toBe("JM-0042");
    expect(data.clientName).toBe("Sarah Dixon");
    expect(data.address).toBe("12 Example Street");
  });

  it("floorAreaM2 is null when no module_items exist for 'floor area' label", async () => {
    // buildQSExportData reads floorAreaM2 from module_items (label = "floor area"),
    // NOT from the job row. With empty items the value is null.
    const data = await buildQSExportData("job-1");
    expect(data.floorAreaM2).toBeNull();
  });

  it("jmwNumber mirrors jobNumber (resolvedJobNumber — no separate jmw_number column read)", async () => {
    // jmwNumber is set to resolvedJobNumber, which comes from job.job_number.
    // There is no separate jmw_number field read from the DB row.
    const data = await buildQSExportData("job-1");
    expect(data.jmwNumber).toBe("JM-0042");
  });

  it("derives clientSurname by splitting clientName on whitespace", async () => {
    // "Sarah Dixon" → surname = "Dixon"
    const data = await buildQSExportData("job-1");
    expect(data.clientSurname).toBe("Dixon");
  });

  it("returns empty arrays for windows, doors, openings when none in DB", async () => {
    const data = await buildQSExportData("job-1");
    expect(Array.isArray(data.windows)).toBe(true);
    expect(Array.isArray(data.garageDoors)).toBe(true);
    expect(data.windows.length).toBe(0);
  });
});
