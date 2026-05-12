/**
 * QS export library — writes job takeoff data into the Jennian master QS
 * xlsm template and generates an Electrical Schedule CSV for Laser Electrical.
 *
 * Uses the `xlsx` package (already in package.json) for spreadsheet operations.
 */
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ types */

export type QSExportData = {
  jobNumber: string;
  clientName: string;
  address: string;
  templateId: string | null;
  createdAt: string;
  // Geometry
  floorAreaM2: number | null;
  perimeterM: number | null;
  firstFloorAreaM2: number | null;
  studHeightMm: number | null;
  alfrescoAreaM2: number | null;
  // Roof / cladding / framing
  roofPitch: string | null;
  ridgeType: string | null;
  underlay: string | null;
  claddingType1: string | null;
  claddingType2: string | null;
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

export async function buildQSExportData(jobId: string): Promise<QSExportData> {
  const [jobRes, itemsRes, openingsRes] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", jobId).single(),
    supabase.from("module_items").select("*").eq("job_id", jobId),
    supabase.from("opening_schedule").select("*").eq("job_id", jobId),
  ]);

  if (jobRes.error) throw new Error(`Failed to load job: ${jobRes.error.message}`);
  const job = jobRes.data;
  const items = itemsRes.data ?? [];

  function getVal(label: string): string | null {
    const row = items.find(
      (i) => i.label?.toLowerCase().includes(label.toLowerCase()),
    );
    return row?.approved_value ?? row?.ai_value ?? null;
  }

  function getNum(label: string): number | null {
    const v = getVal(label);
    if (!v) return null;
    const n = parseFloat(v.replace(/[^\d.]/g, ""));
    return isNaN(n) ? null : n;
  }

  // Openings grouped
  const openings = openingsRes.data ?? [];
  const windows = openings
    .filter((o) => o.type === "window")
    .map((o) => ({ type: o.description ?? o.mark ?? "Window", qty: o.quantity ?? 1 }));
  const garageDoors = openings
    .filter((o) => o.type === "garage_door")
    .map((o) => ({ type: o.description ?? o.mark ?? "Garage Door", qty: o.quantity ?? 1 }));
  const interiorDoors = openings
    .filter((o) => o.type === "interior_door")
    .map((o) => ({ type: o.description ?? o.mark ?? "Interior Door", qty: o.quantity ?? 1 }));
  const skylights = openings
    .filter((o) => o.type === "skylight")
    .map((o) => ({ type: o.description ?? o.mark ?? "Skylight", qty: o.quantity ?? 1 }));

  // Downpipes from items
  const downpipeItems = items.filter(
    (i) => i.label?.toLowerCase().includes("downpipe"),
  );
  const downpipes = downpipeItems.map((i) => ({
    size: i.approved_value ?? i.ai_value ?? "90mm",
    qty: parseFloat(i.approved_value ?? i.ai_value ?? "1") || 1,
  }));

  // Heat pumps from items
  const heatPumpItems = items.filter(
    (i) =>
      i.label?.toLowerCase().includes("heat pump") ||
      i.label?.toLowerCase().includes("heating"),
  );
  const heatPumps = heatPumpItems.map((i) => ({
    model: i.approved_value ?? i.ai_value ?? "Heat Pump",
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
    .filter((i) =>
      extraLabels.some((l) => i.label?.toLowerCase().includes(l)),
    )
    .slice(0, 6)
    .map((i) => ({
      description: i.label ?? "Extra",
      value: parseFloat(i.approved_value ?? i.ai_value ?? "0") || 0,
    }));

  return {
    jobNumber: job.job_number ?? jobId,
    clientName: job.client_name ?? "",
    address: job.address ?? "",
    templateId: job.template ?? null,
    createdAt: job.created_at ?? new Date().toISOString(),
    floorAreaM2: getNum("floor area") ?? getNum("total area"),
    perimeterM: getNum("perimeter") ?? getNum("external perimeter"),
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
  };
}

/* ----------------------------------------------------- xlsx template write */

/**
 * Writes QS data into the Jennian master QS xlsm template buffer.
 * Returns a new workbook buffer ready for download.
 *
 * Cell mapping targets the "5. Data Input House" sheet.
 */
export function writeQSExport(templateBuffer: ArrayBuffer, data: QSExportData): Uint8Array {
  const wb = XLSX.read(new Uint8Array(templateBuffer), { type: "array", cellStyles: true });

  const sheetName = wb.SheetNames.find((n) => n.includes("Data Input")) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  function setCell(addr: string, value: string | number | null) {
    if (value === null || value === undefined) return;
    const cell = ws[addr];
    if (cell) {
      cell.v = value;
      cell.t = typeof value === "number" ? "n" : "s";
    } else {
      ws[addr] = { v: value, t: typeof value === "number" ? "n" : "s" };
    }
  }

  // Client / job info (I1:I7)
  setCell("I1", data.jobNumber);
  setCell("I2", data.clientName);
  setCell("I3", data.address);
  setCell("I4", data.templateId ?? "");
  setCell("I5", data.createdAt.slice(0, 10));

  // Geometry
  setCell("D4", data.floorAreaM2);
  setCell("E4", data.perimeterM);
  setCell("F4", data.firstFloorAreaM2);
  setCell("D20", data.studHeightMm);
  setCell("D13", data.alfrescoAreaM2);

  // Roof / cladding (write as text notes in adjacent cells if available)
  if (data.roofPitch) setCell("H8", data.roofPitch);
  if (data.ridgeType) setCell("H9", data.ridgeType);
  if (data.underlay) setCell("H10", data.underlay);
  if (data.claddingType1) setCell("H12", data.claddingType1);
  if (data.claddingType2) setCell("H13", data.claddingType2);

  // Skylights H96:H99
  data.skylights.forEach((s, i) => {
    setCell(`H${96 + i}`, s.qty);
  });

  // Downpipes H145:H147
  data.downpipes.forEach((d, i) => {
    setCell(`H${145 + i}`, d.qty);
  });

  // Garage doors H175:H180
  data.garageDoors.forEach((g, i) => {
    setCell(`H${175 + i}`, g.qty);
  });

  // Interior doors H187:H194
  data.interiorDoors.forEach((d, i) => {
    setCell(`H${187 + i}`, d.qty);
  });

  // Extras / PC H222:H227
  data.extras.forEach((e, i) => {
    setCell(`H${222 + i}`, e.value || "");
    setCell(`G${222 + i}`, e.description);
  });

  // Heating H235:H236
  data.heatPumps.forEach((hp, i) => {
    setCell(`H${235 + i}`, hp.model);
  });

  // Windows — rows 41–72 (every 2 rows: description col G, qty col H)
  data.windows.forEach((w, i) => {
    const row = 41 + i * 2;
    setCell(`G${row}`, w.type);
    setCell(`H${row}`, w.qty);
  });

  return XLSX.write(wb, { type: "array", bookType: "xlsm" }) as Uint8Array;
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
