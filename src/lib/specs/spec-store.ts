/**
 * Spec store — persistence for the meeting-spec picker.
 * Answers live in jobs.specifications (jsonb). Saves are whole-object
 * upserts of the answers map; the schema (rows/codes) never persists —
 * it lives in code (spec-schema.ts) so the contract has one home.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  type JobSpecifications,
  type SpecAnswers,
  SPEC_CONTRACT_VERSION,
  parseSpecifications,
} from "./spec-schema";

export async function loadJobSpecifications(jobId: string): Promise<JobSpecifications> {
  const { data, error } = await supabase
    .from("jobs")
    .select("specifications")
    .eq("id", jobId)
    .single();
  if (error) throw error;
  return parseSpecifications(data?.specifications ?? null);
}

export async function saveJobSpecifications(
  jobId: string,
  answers: SpecAnswers,
): Promise<JobSpecifications> {
  const payload: JobSpecifications = {
    v: SPEC_CONTRACT_VERSION,
    answers,
    updatedAt: new Date().toISOString(),
  };
  const { error } = await supabase.from("jobs").update({ specifications: payload }).eq("id", jobId);
  if (error) throw error;
  return payload;
}
