import { supabase } from "@/integrations/supabase/client";

export type Confidence = "high" | "mid" | "low";
export type JobStatus = "draft" | "uploaded" | "extracted" | "review_required" | "approved" | "exported";

export type PlanType = "concept" | "detailed";

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
  electrical_plan_url?: string | null;
  plan_type?: PlanType;
  smw_enabled?: boolean;
  confidence_score?: number | null;
  plan_context?: Record<string, unknown> | null;
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
  data_source: string;
  source_evidence: string | null;
  plan_page_number: number | null;
  confidence_label: string | null;
  review_status: string;
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

// Job-specific seed data has been removed. Quantities are populated from
// uploaded plan/spec text, calibrated measurements, template allowances, or
// user overrides — never from a hardcoded reference job.

export const TEMPLATES = [
  { id: "t1", code: "SS-BW", name: "Single Storey – Brick & Weatherboard" },
  { id: "t2", code: "SS-LN", name: "Single Storey – Linea" },
  { id: "t3", code: "TS-BL", name: "Two Storey – Brick & Linea" },
  { id: "t4", code: "SH-MW", name: "Show Home Spec – Manawātū" },
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
    .select(
      "id, quantity_id, original_value, new_value, edited_by, reason, timestamp, extracted_quantities!inner(job_id)",
    )
    .eq("extracted_quantities.job_id", jobId)
    .order("timestamp", { ascending: false });
  if (error) throw error;
  // Strip the nested join column so the result matches OverrideRow exactly.
  return (data ?? []).map((row): OverrideRow => ({
    id: row.id,
    quantity_id: row.quantity_id,
    original_value: row.original_value,
    new_value: row.new_value,
    edited_by: row.edited_by,
    reason: row.reason,
    timestamp: row.timestamp,
  }));
}
