import { supabase } from "@/integrations/supabase/client";
import {
  fromExtractedQuantityCorrectionDbRow,
  toExtractedQuantityCorrectionDbRow,
  type ExtractedQuantityCorrection,
  type ExtractedQuantityCorrectionDbRow,
  type ExtractedQuantityCorrectionInsertRow,
} from "./extracted-quantity-corrections";

type QueryError = { message: string } | null;
type QueryResult<T> = PromiseLike<{ data: T | null; error: QueryError }>;

export interface ExtractedQuantityCorrectionPersistenceClient {
  from(table: "extracted_quantity_corrections"): {
    insert(values: ExtractedQuantityCorrectionInsertRow): {
      select(columns: "*"): {
        single(): QueryResult<ExtractedQuantityCorrectionDbRow>;
      };
    };
    select(columns: "*"): {
      eq(
        column: "job_id",
        value: string,
      ): {
        eq(
          column: "run_id",
          value: string,
        ): {
          is(
            column: "reverted_at",
            value: null,
          ): {
            order(
              column: "created_at",
              options: { ascending: boolean },
            ): QueryResult<ExtractedQuantityCorrectionDbRow[]>;
          };
        };
      };
    };
    update(values: { reverted_at: string; reverted_by: string; revert_reason: string }): {
      eq(
        column: "job_id",
        value: string,
      ): {
        eq(
          column: "run_id",
          value: string,
        ): {
          eq(
            column: "id",
            value: string,
          ): {
            is(
              column: "reverted_at",
              value: null,
            ): {
              select(columns: "*"): {
                single(): QueryResult<ExtractedQuantityCorrectionDbRow>;
              };
            };
          };
        };
      };
    };
  };
}

export type InsertExtractedQuantityCorrectionResult = {
  correction: ExtractedQuantityCorrection | null;
  error: string | null;
};

export type LoadExtractedQuantityCorrectionsResult = {
  corrections: ExtractedQuantityCorrection[];
  error: string | null;
};

export type RevertExtractedQuantityCorrectionResult = {
  correction: ExtractedQuantityCorrection | null;
  error: string | null;
};

function errorMessage(error: QueryError): string {
  return error?.message ?? "Unknown Supabase error";
}

function validateCorrection(correction: ExtractedQuantityCorrection): string | null {
  if (!correction.jobId) return "jobId is required";
  if (!correction.runId) return "runId is required";
  if (!correction.extractedQuantityId) return "extractedQuantityId is required";
  if (!correction.reason.trim()) return "reason is required";
  return null;
}

export async function insertExtractedQuantityCorrection(
  correction: ExtractedQuantityCorrection,
  client: ExtractedQuantityCorrectionPersistenceClient = supabase as unknown as ExtractedQuantityCorrectionPersistenceClient,
): Promise<InsertExtractedQuantityCorrectionResult> {
  const validationError = validateCorrection(correction);
  if (validationError) return { correction: null, error: validationError };

  try {
    const result = await client
      .from("extracted_quantity_corrections")
      .insert(toExtractedQuantityCorrectionDbRow(correction))
      .select("*")
      .single();
    if (result.error) return { correction: null, error: errorMessage(result.error) };
    if (!result.data) return { correction: null, error: "inserted correction was not returned" };
    return { correction: fromExtractedQuantityCorrectionDbRow(result.data), error: null };
  } catch (error) {
    return {
      correction: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function loadExtractedQuantityCorrectionsForRun(
  args: { jobId: string; runId: string },
  client: ExtractedQuantityCorrectionPersistenceClient = supabase as unknown as ExtractedQuantityCorrectionPersistenceClient,
): Promise<LoadExtractedQuantityCorrectionsResult> {
  if (!args.jobId) return { corrections: [], error: "jobId is required" };
  if (!args.runId) return { corrections: [], error: "runId is required" };

  try {
    const result = await client
      .from("extracted_quantity_corrections")
      .select("*")
      .eq("job_id", args.jobId)
      .eq("run_id", args.runId)
      .is("reverted_at", null)
      .order("created_at", { ascending: true });
    if (result.error) return { corrections: [], error: errorMessage(result.error) };
    return {
      corrections: (result.data ?? []).map(fromExtractedQuantityCorrectionDbRow),
      error: null,
    };
  } catch (error) {
    return {
      corrections: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function revertExtractedQuantityCorrection(
  args: {
    jobId: string;
    runId: string;
    correctionId: string;
    revertedBy: string;
    revertReason: string;
    revertedAt?: string;
  },
  client: ExtractedQuantityCorrectionPersistenceClient = supabase as unknown as ExtractedQuantityCorrectionPersistenceClient,
): Promise<RevertExtractedQuantityCorrectionResult> {
  if (!args.jobId) return { correction: null, error: "jobId is required" };
  if (!args.runId) return { correction: null, error: "runId is required" };
  if (!args.correctionId) return { correction: null, error: "correctionId is required" };
  if (!args.revertedBy) return { correction: null, error: "revertedBy is required" };
  if (!args.revertReason.trim()) return { correction: null, error: "revertReason is required" };

  try {
    const result = await client
      .from("extracted_quantity_corrections")
      .update({
        reverted_at: args.revertedAt ?? new Date().toISOString(),
        reverted_by: args.revertedBy,
        revert_reason: args.revertReason.trim(),
      })
      .eq("job_id", args.jobId)
      .eq("run_id", args.runId)
      .eq("id", args.correctionId)
      .is("reverted_at", null)
      .select("*")
      .single();
    if (result.error) return { correction: null, error: errorMessage(result.error) };
    if (!result.data) return { correction: null, error: "reverted correction was not returned" };
    return { correction: fromExtractedQuantityCorrectionDbRow(result.data), error: null };
  } catch (error) {
    return {
      correction: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
