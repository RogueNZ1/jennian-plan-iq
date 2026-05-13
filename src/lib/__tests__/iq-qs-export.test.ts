import { describe, it, expect, vi } from "vitest";

// Mock xlsx before importing the module under test
vi.mock("xlsx", () => ({
  default: {},
  read: vi.fn(),
  write: vi.fn(() => new Uint8Array()),
  utils: { book_new: vi.fn(() => ({})), aoa_to_sheet: vi.fn(() => ({})), book_append_sheet: vi.fn() },
}));

// Stub Supabase client — tests only exercise pure calculation functions
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(), data: [] })) })) })),
  },
}));

import {
  buildElectricalSchedule,
  electricalScheduleToCSV,
  type QSExportData,
} from "../iq-qs-export";

function makeData(overrides: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "TEST001",
    clientName: "Test Client",
    address: "1 Test St",
    templateId: null,
    createdAt: "2026-01-01T00:00:00Z",
    floorAreaM2: 165,
    perimeterLm: 60,
    perimeterM: 60,
    firstFloorAreaM2: null,
    studHeightMm: null,
    alfrescoAreaM2: null,
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
    ...overrides,
  };
}

describe("buildElectricalSchedule", () => {
  it("uses BASE_AREA_M2 of 165 as scale factor 1.0", () => {
    const schedule = buildElectricalSchedule(makeData({ floorAreaM2: 165 }));
    expect(schedule.floorAreaM2).toBe(165);
  });

  it("scales up quantities for larger house", () => {
    const small = buildElectricalSchedule(makeData({ floorAreaM2: 165 }));
    const large = buildElectricalSchedule(makeData({ floorAreaM2: 330 }));
    const total = (s: typeof small) => [...s.lighting, ...s.power, ...s.communications, ...s.mechanical].reduce((acc, i) => acc + i.qty, 0);
    expect(total(large)).toBeGreaterThan(total(small));
  });

  it("totalEstimate equals sum of all item qty * rate", () => {
    const schedule = buildElectricalSchedule(makeData());
    const allItems = [...schedule.lighting, ...schedule.power, ...schedule.communications, ...schedule.mechanical];
    const expected = allItems.reduce((s, i) => s + i.qty * i.rate, 0);
    expect(schedule.totalEstimate).toBe(expected);
  });

  it("always has exactly one switchboard", () => {
    const hasOneSwitchboard = (floorAreaM2: number) => {
      const schedule = buildElectricalSchedule(makeData({ floorAreaM2 }));
      return schedule.power.filter((i) => i.description.includes("switchboard")).length === 1;
    };
    expect(hasOneSwitchboard(100)).toBe(true);
    expect(hasOneSwitchboard(400)).toBe(true);
  });

  it("uses heatPumps.length for heat pump circuit count when provided", () => {
    const schedule = buildElectricalSchedule(
      makeData({ heatPumps: [{ model: "Mitsubishi", qty: 1 }, { model: "Fujitsu", qty: 1 }] }),
    );
    const hpItem = schedule.power.find((i) => i.description.includes("Heat pump"));
    expect(hpItem?.qty).toBe(2);
  });

  it("uses garageDoors.length for garage door operator count when provided", () => {
    const schedule = buildElectricalSchedule(
      makeData({ garageDoors: [{ type: "Panel", qty: 1 }, { type: "Roller", qty: 1 }] }),
    );
    const gdItem = schedule.power.find((i) => i.description.includes("Garage door"));
    expect(gdItem?.qty).toBe(2);
  });

  it("falls back to scaled quantity when no heat pumps provided", () => {
    const schedule = buildElectricalSchedule(makeData({ heatPumps: [], floorAreaM2: 165 }));
    const hpItem = schedule.power.find((i) => i.description.includes("Heat pump"));
    // 0 length || q(1) → Math.round(1 * 1.0) = 1
    expect(hpItem?.qty).toBe(1);
  });

  it("all quantities are integers", () => {
    const schedule = buildElectricalSchedule(makeData({ floorAreaM2: 237 }));
    const allItems = [...schedule.lighting, ...schedule.power, ...schedule.communications, ...schedule.mechanical];
    allItems.forEach((item) => {
      expect(Number.isInteger(item.qty)).toBe(true);
    });
  });

  it("returns all four section arrays", () => {
    const schedule = buildElectricalSchedule(makeData());
    expect(Array.isArray(schedule.lighting)).toBe(true);
    expect(Array.isArray(schedule.power)).toBe(true);
    expect(Array.isArray(schedule.communications)).toBe(true);
    expect(Array.isArray(schedule.mechanical)).toBe(true);
    expect(schedule.lighting.length).toBeGreaterThan(0);
    expect(schedule.power.length).toBeGreaterThan(0);
  });

  it("fallback area is 165 when floorAreaM2 is null", () => {
    const schedule = buildElectricalSchedule(makeData({ floorAreaM2: null }));
    expect(schedule.floorAreaM2).toBe(165);
  });
});

describe("electricalScheduleToCSV", () => {
  it("includes job number and address", () => {
    const data = makeData({ jobNumber: "ABC123", address: "42 Test Rd" });
    const schedule = buildElectricalSchedule(data);
    const csv = electricalScheduleToCSV(schedule);
    expect(csv).toContain("ABC123");
    expect(csv).toContain("42 Test Rd");
  });

  it("includes GST total line", () => {
    const schedule = buildElectricalSchedule(makeData());
    const csv = electricalScheduleToCSV(schedule);
    expect(csv).toContain("15% GST");
  });

  it("GST total is 1.15x the excl total", () => {
    const schedule = buildElectricalSchedule(makeData());
    const csv = electricalScheduleToCSV(schedule);
    const exclMatch = csv.match(/excl\. GST.*?"([\d.]+)"/);
    const inclMatch = csv.match(/incl\. 15% GST.*?"([\d.]+)"/);
    expect(exclMatch).not.toBeNull();
    expect(inclMatch).not.toBeNull();
    const excl = parseFloat(exclMatch![1]);
    const incl = parseFloat(inclMatch![1]);
    expect(incl).toBeCloseTo(excl * 1.15, 1);
  });

  it("has all four section headers", () => {
    const schedule = buildElectricalSchedule(makeData());
    const csv = electricalScheduleToCSV(schedule);
    ["LIGHTING", "POWER", "COMMUNICATIONS", "MECHANICAL"].forEach((section) => {
      expect(csv).toContain(section);
    });
  });
});

describe("re-exports", () => {
  it("exports exportCartersLoads from iq-qs-export", async () => {
    const mod = await import("../iq-qs-export");
    expect(typeof mod.exportCartersLoads).toBe("function");
  });
});
