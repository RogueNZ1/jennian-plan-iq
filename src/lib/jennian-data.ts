import { supabase } from "@/integrations/supabase/client";

export type Confidence = "high" | "mid" | "low";
export type JobStatus = "draft" | "uploaded" | "extracted" | "review_required" | "approved" | "exported";

export type Job = {
  id: string;
  job_number: string;
  client_name: string;
  address: string;
  template: string | null;
  status: JobStatus;
  uploaded_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  plan_thumbnail_url?: string | null;
};

export type Quantity = {
  id: string;
  job_id: string;
  quantity_type: string;
  unit: string;
  extracted_value: number;
  approved_value: number | null;
  confidence: Confidence;
  notes: string | null;
  created_at: string;
};

export type OverrideRow = {
  id: string;
  quantity_id: string;
  original_value: number;
  new_value: number;
  edited_by: string;
  reason: string | null;
  timestamp: string;
};

export const STATUS_LABEL: Record<JobStatus, string> = {
  draft: "Draft",
  uploaded: "Uploaded",
  extracted: "Extracted",
  review_required: "Review Required",
  approved: "Approved",
  exported: "Exported",
};

/** Russell Street test extraction data */
export const RUSSELL_STREET_QUANTITIES: Array<{
  quantity_type: string;
  unit: string;
  extracted_value: number;
  confidence: Confidence;
  notes: string;
}> = [
  { quantity_type: "House Area (over frame)", unit: "m²", extracted_value: 138.76, confidence: "high", notes: "Measured over frame" },
  { quantity_type: "Foundation Area", unit: "m²", extracted_value: 143.47, confidence: "high", notes: "" },
  { quantity_type: "Total Coverage", unit: "m²", extracted_value: 145.52, confidence: "high", notes: "" },
  { quantity_type: "External Perimeter (over frame)", unit: "lm", extracted_value: 56.06, confidence: "high", notes: "" },
  { quantity_type: "Internal Wall Length", unit: "lm", extracted_value: 67.00, confidence: "mid", notes: "Verify non-load-bearing walls" },
  { quantity_type: "Garage Area", unit: "m²", extracted_value: 24.40, confidence: "mid", notes: "Confirm internal vs external" },
  { quantity_type: "Living Area excluding garage", unit: "m²", extracted_value: 114.30, confidence: "mid", notes: "" },
  { quantity_type: "Roof Pitch", unit: "°", extracted_value: 25, confidence: "high", notes: "" },
];

export const TEMPLATES = [
  { id: "t1", code: "SS-BW", name: "Single Storey – Brick & Weatherboard" },
  { id: "t2", code: "SS-LN", name: "Single Storey – Linea" },
  { id: "t3", code: "TS-BL", name: "Two Storey – Brick & Linea" },
  { id: "t4", code: "SH-MW", name: "Show Home Spec – Manawatū" },
];

export async function listJobs(): Promise<Job[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Job[];
}

export async function getJob(id: string): Promise<Job | null> {
  const { data, error } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Job | null;
}

export async function listQuantities(jobId: string): Promise<Quantity[]> {
  const { data, error } = await supabase
    .from("extracted_quantities")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Quantity[];
}

export async function listOverrides(jobId: string): Promise<OverrideRow[]> {
  const { data, error } = await supabase
    .from("quantity_overrides")
    .select("*, extracted_quantities!inner(job_id)")
    .eq("extracted_quantities.job_id", jobId)
    .order("timestamp", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as OverrideRow[];
}