export type Confidence = "high" | "mid" | "low";

export type Job = {
  id: string;
  number: string;
  client: string;
  address: string;
  status: "Draft" | "Extracting" | "Pending Review" | "Approved" | "Exported";
  confidence: number;
  uploaded: string;
};

export const jobs: Job[] = [
  { id: "1", number: "JM-2451", client: "Hartley Family Trust", address: "12 Kahikatea Drive, Palmerston North", status: "Pending Review", confidence: 0.92, uploaded: "2025-05-08" },
  { id: "2", number: "JM-2450", client: "S. & R. Whitcombe", address: "44 Roslyn Terrace, Feilding", status: "Approved", confidence: 0.97, uploaded: "2025-05-06" },
  { id: "3", number: "JM-2449", client: "Manawatū Investments Ltd", address: "8 Aokautere Heights, Aokautere", status: "Extracting", confidence: 0.74, uploaded: "2025-05-05" },
  { id: "4", number: "JM-2448", client: "P. Henderson", address: "27 Tremaine Avenue, Palmerston North", status: "Approved", confidence: 0.95, uploaded: "2025-05-02" },
  { id: "5", number: "JM-2447", client: "K. & L. Tane", address: "3 Ruahine Street, Ashhurst", status: "Pending Review", confidence: 0.81, uploaded: "2025-04-29" },
  { id: "6", number: "JM-2446", client: "Greenfields Holdings", address: "115 Pioneer Highway, Awapuni", status: "Exported", confidence: 0.99, uploaded: "2025-04-24" },
];

export type Quantity = {
  id: string;
  type: string;
  unit: string;
  value: number | string;
  confidence: Confidence;
  notes: string;
};

export const sampleQuantities: Quantity[] = [
  { id: "q1",  type: "House Area",            unit: "m²", value: 184.5, confidence: "high", notes: "Ground floor + first floor net" },
  { id: "q2",  type: "Foundation Area",       unit: "m²", value: 192.0, confidence: "high", notes: "Includes 200mm overhang" },
  { id: "q3",  type: "External Perimeter",    unit: "lm", value: 58.4,  confidence: "high", notes: "" },
  { id: "q4",  type: "Internal Wall Length",  unit: "lm", value: 96.2,  confidence: "mid",  notes: "Some non-load bearing walls dimensioned to centerlines" },
  { id: "q5",  type: "Garage Area",           unit: "m²", value: 38.4,  confidence: "high", notes: "" },
  { id: "q6",  type: "Roof Area",             unit: "m²", value: 218.7, confidence: "mid",  notes: "Hip roof — verify eaves" },
  { id: "q7",  type: "Roof Pitch",            unit: "°",  value: 25,    confidence: "high", notes: "" },
  { id: "q8",  type: "Window Schedule",       unit: "no", value: 18,    confidence: "high", notes: "Includes 2x sliders" },
  { id: "q9",  type: "Door Schedule",         unit: "no", value: 11,    confidence: "high", notes: "" },
  { id: "q10", type: "Cladding Length",       unit: "lm", value: 58.4,  confidence: "low",  notes: "Mixed brick / weatherboard — manual check required" },
  { id: "q11", type: "Wet Area Lengths",      unit: "lm", value: 12.6,  confidence: "mid",  notes: "" },
  { id: "q12", type: "Ceiling Area",          unit: "m²", value: 184.5, confidence: "high", notes: "" },
];

export const templates = [
  { id: "t1", name: "Single Storey – Brick & Weatherboard", code: "SS-BW" },
  { id: "t2", name: "Single Storey – Linea",                code: "SS-LN" },
  { id: "t3", name: "Two Storey – Brick & Linea",           code: "TS-BL" },
  { id: "t4", name: "Show Home Spec – Manawatū",            code: "SH-MW" },
];
