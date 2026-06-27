import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables, TablesInsert } from "@/integrations/supabase/types";
import type { VisualOpeningMarker } from "@/lib/verification/plan-overlay";

export type VisualOpeningCorrectionType =
  | "confirm_opening"
  | "not_opening"
  | "component_of_opening"
  | "box_too_small"
  | "box_too_large"
  | "wrong_type";

export type VisualOpeningCorrection = Tables<"visual_opening_corrections"> & {
  correction_type: VisualOpeningCorrectionType;
};

export type VisualOpeningCorrectionInput = {
  jobId: string;
  takeoffRunId?: string | null;
  marker: VisualOpeningMarker;
  correctionType: VisualOpeningCorrectionType;
  correctedType?: string | null;
  reason?: string | null;
};

type SupabaseError = { message?: string };

type VisualOpeningCorrectionInsert = TablesInsert<"visual_opening_corrections"> & {
  correction_type: VisualOpeningCorrectionType;
};

function errorMessage(error: SupabaseError | null): string {
  return error?.message ?? "Unknown Supabase error";
}

export function buildVisualOpeningCorrectionInsert(
  input: VisualOpeningCorrectionInput,
  userId: string,
): VisualOpeningCorrectionInsert {
  const markerSnapshot: Json = {
    id: input.marker.id,
    markerLabel: input.marker.markerLabel,
    type: input.marker.type,
    room: input.marker.room,
    label: input.marker.label,
    height_m: input.marker.height_m,
    width_m: input.marker.width_m,
    x: input.marker.x,
    y: input.marker.y,
    confidence: input.marker.confidence,
    evidence: input.marker.evidence,
    flags: input.marker.flags,
    recoveryProof: input.marker.recoveryProof ?? null,
  };

  return {
    job_id: input.jobId,
    takeoff_run_id: input.takeoffRunId ?? null,
    opening_id: input.marker.id || input.marker.markerLabel,
    marker_label: input.marker.markerLabel,
    correction_type: input.correctionType,
    corrected_type: input.correctedType ?? null,
    reason: input.reason ?? null,
    marker_snapshot: markerSnapshot,
    context: {
      source: "verification_plan_overlay",
      doctrine: "vision_review_only_geometry_prices",
    },
    created_by: userId,
  };
}

export function latestVisualOpeningCorrectionsByMarker(
  rows: readonly VisualOpeningCorrection[],
): Record<string, VisualOpeningCorrection> {
  const out: Record<string, VisualOpeningCorrection> = {};
  for (const row of rows) {
    const previous = out[row.marker_label];
    if (!previous || row.created_at > previous.created_at) out[row.marker_label] = row;
  }
  return out;
}

export async function loadVisualOpeningCorrections(
  jobId: string,
): Promise<Record<string, VisualOpeningCorrection>> {
  const { data, error } = await supabase
    .from("visual_opening_corrections")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(errorMessage(error));
  return latestVisualOpeningCorrectionsByMarker((data ?? []) as VisualOpeningCorrection[]);
}

export async function saveVisualOpeningCorrection(
  input: VisualOpeningCorrectionInput,
): Promise<VisualOpeningCorrection> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(errorMessage(userError));
  const user = userData.user;
  if (!user) throw new Error("You must be signed in to save visual opening corrections.");

  const payload = buildVisualOpeningCorrectionInsert(input, user.id);
  const { data, error } = await supabase
    .from("visual_opening_corrections")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(errorMessage(error));
  if (!data) throw new Error("Visual opening correction was not returned after save.");
  return data as VisualOpeningCorrection;
}
