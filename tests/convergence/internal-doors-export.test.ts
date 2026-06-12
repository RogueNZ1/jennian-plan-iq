// @vitest-environment node
/**
 * AUDIT §5.5 regression — internal doors from the opening schedule must reach the export.
 *
 * Every producer writes opening_type "internal_door" (the OpeningScheduleTab dropdown,
 * extract-openings, the vision normaliser). The export's interiorDoors filter matched
 * only "interior_door", so EVERY schedule-entered internal door was silently dropped:
 * intDoorStandard stayed 0 (→ H187 = 0) on any job without confirmed door_counts or
 * door-labelled module items. This locks the fixed precedence chain:
 *   confirmed door_counts  >  module-item labels  >  opening_schedule rows (now alive).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;
const db: { openings: Row[]; items: Row[]; doorCounts: Row | null } = {
  openings: [],
  items: [],
  doorCounts: null,
};

const mockJob: Row = {
  id: "job-1",
  job_number: "JM-0099",
  client_name: "Test Client",
  address: "1 Test St",
  template: null,
  plan_type: "concept",
  status: "active",
  created_by: "u",
  created_at: "",
  updated_at: "",
  floor_area_m2: 100,
  perimeter_lm: 40,
  smw_enabled: false,
  plan_type_override: null,
  confidence_score: null,
  jmw_number: "JM-0099",
  client_first_name: "Test",
  client_surname: "Client",
  street_address: "1 Test St",
  address_line2: null,
  city: "Feilding",
  email: null,
  phone: null,
};

// NOTE: relative specifier — the @/ alias does not resolve for files outside src.
vi.mock("../../src/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({ single: () => Promise.resolve({ data: mockJob, error: null }) }),
          }),
        };
      }
      if (table === "door_counts") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: db.doorCounts, error: null }),
            }),
          }),
        };
      }
      if (table === "module_items") {
        return { select: () => ({ eq: () => Promise.resolve({ data: db.items, error: null }) }) };
      }
      if (table === "opening_schedule") {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: db.openings, error: null }) }),
        };
      }
      if (table === "takeoff_runs") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
    }),
  },
}));

import { buildQSExportData } from "../../src/lib/iq-qs-export";

const door = (qty: number, opening_type = "internal_door"): Row => ({
  id: `o-${Math.random()}`,
  job_id: "job-1",
  opening_type,
  room_name: "Hall",
  quantity: qty,
  width_mm: 810,
  height_mm: 1980,
});

beforeEach(() => {
  db.openings = [];
  db.items = [];
  db.doorCounts = null;
});

describe("AUDIT §5.5 — internal doors reach the export", () => {
  it("schedule rows typed 'internal_door' (what every producer writes) land in intDoorStandard", async () => {
    db.openings = [door(5), door(3)];
    const data = await buildQSExportData("job-1");
    expect(data.intDoorStandard).toBe(8);
    expect(data.interiorDoors).toHaveLength(2);
  });

  it("legacy 'interior_door' rows still count (defensive — no historic row dropped)", async () => {
    db.openings = [door(4, "interior_door")];
    const data = await buildQSExportData("job-1");
    expect(data.intDoorStandard).toBe(4);
  });

  it("CONFIRMED door_counts still override the schedule fallback (precedence unchanged)", async () => {
    db.openings = [door(8)];
    db.doorCounts = {
      confirmed_at: "2026-06-01",
      standard: 6,
      double_doors: 1,
      cavity_sliders: 2,
      barn_sliders: 0,
    };
    const data = await buildQSExportData("job-1");
    expect(data.intDoorStandard).toBe(6);
    expect(data.intDoorDouble).toBe(1);
    expect(data.intDoorCavitySlider).toBe(2);
  });

  it("door-labelled module items still override the schedule fallback (precedence unchanged)", async () => {
    db.openings = [door(8)];
    db.items = [
      {
        module_id: "m",
        label: "Interior door — standard hinged",
        extracted_value: "7",
        approved_value: null,
        unit: "count",
        value_source: "extracted",
      },
    ];
    const data = await buildQSExportData("job-1");
    expect(data.intDoorStandard).toBe(7);
  });

  it("windows and garage doors are untouched by the filter change", async () => {
    db.openings = [
      door(5),
      {
        id: "w1",
        job_id: "job-1",
        opening_type: "window",
        room_name: "Bed 1",
        quantity: 2,
        width_mm: 1800,
        height_mm: 1300,
      },
      {
        id: "g1",
        job_id: "job-1",
        opening_type: "garage_door",
        room_name: "Garage",
        quantity: 1,
        width_mm: 4800,
        height_mm: 2100,
      },
    ];
    const data = await buildQSExportData("job-1");
    expect(data.windows).toHaveLength(1);
    expect(data.garageDoors).toHaveLength(1);
    expect(data.interiorDoors).toHaveLength(1);
  });
});
