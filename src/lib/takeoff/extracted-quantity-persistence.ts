import type { Json } from "@/integrations/supabase/types";
import type {
  ExtractedQuantity,
  ExtractedQuantityCategory,
  ExtractedQuantityEvidence,
  ExtractedQuantitySource,
  ExtractedQuantityStatus,
  ExtractedQuantityWarning,
} from "./extracted-quantity-ledger";

type QueryResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

export type ExtractedQuantityDbRow = {
  id: string;
  job_id: string;
  run_id: string;
  category: string;
  label: string | null;
  count: number | null;
  width_mm: number | null;
  height_mm: number | null;
  length_mm: number | null;
  area_m2: number | null;
  status: string;
  confidence: number;
  warnings_json: Json;
  source: string;
  evidence_json: Json;
  created_at: string;
  updated_at: string;
  superseded_at: string | null;
};

export type ExtractedQuantityInsertRow = Omit<
  ExtractedQuantityDbRow,
  "created_at" | "updated_at" | "superseded_at"
> & {
  created_at?: string;
  updated_at?: string;
  superseded_at?: string | null;
};

export interface ExtractedQuantityPersistenceClient {
  from(table: "extracted_quantity_rows"): {
    update(values: { superseded_at: string }): {
      eq(
        column: "job_id",
        value: string,
      ): {
        is(
          column: "superseded_at",
          value: null,
        ): {
          neq(column: "run_id", value: string): QueryResult<unknown>;
        };
      };
    };
    insert(values: ExtractedQuantityInsertRow[]): QueryResult<unknown>;
    select(columns: "*"): {
      eq(column: "job_id", value: string): ExtractedQuantitySelectQuery;
    };
  };
}

export interface ExtractedQuantitySelectQuery {
  eq(column: "run_id", value: string): QueryResult<ExtractedQuantityDbRow[]>;
  is(column: "superseded_at", value: null): QueryResult<ExtractedQuantityDbRow[]>;
}

export type PersistExtractedQuantityRowsResult = {
  written: boolean;
  rowCount: number;
  error: string | null;
};

export type LoadExtractedQuantityRowsResult = {
  rows: ExtractedQuantity[];
  error: string | null;
};

function jsonArray(value: Json): unknown[] {
  return Array.isArray(value) ? value : [];
}

function warningArray(value: Json): ExtractedQuantityWarning[] {
  return jsonArray(value).filter(
    (item): item is ExtractedQuantityWarning => typeof item === "string",
  );
}

function evidenceArray(value: Json): ExtractedQuantityEvidence[] {
  return jsonArray(value).filter(
    (item): item is ExtractedQuantityEvidence => item != null && typeof item === "object",
  ) as ExtractedQuantityEvidence[];
}

export function toExtractedQuantityDbRow(
  quantity: ExtractedQuantity,
  args?: { jobId?: string; runId?: string; now?: string },
): ExtractedQuantityInsertRow {
  const now = args?.now ?? quantity.updatedAt;
  return {
    id: quantity.id,
    job_id: args?.jobId ?? quantity.jobId,
    run_id: args?.runId ?? quantity.runId ?? "",
    category: quantity.category,
    label: quantity.label ?? null,
    count: quantity.count ?? null,
    width_mm: quantity.widthMm ?? null,
    height_mm: quantity.heightMm ?? null,
    length_mm: quantity.lengthMm ?? null,
    area_m2: quantity.areaM2 ?? null,
    status: quantity.status,
    confidence: quantity.confidence,
    warnings_json: quantity.warnings as Json,
    source: quantity.source,
    evidence_json: quantity.evidence as unknown as Json,
    created_at: quantity.createdAt ?? now,
    updated_at: now,
    superseded_at: null,
  };
}

export function fromExtractedQuantityDbRow(row: ExtractedQuantityDbRow): ExtractedQuantity {
  return {
    id: row.id,
    jobId: row.job_id,
    runId: row.run_id,
    category: row.category as ExtractedQuantityCategory,
    label: row.label ?? undefined,
    count: row.count ?? undefined,
    widthMm: row.width_mm,
    heightMm: row.height_mm,
    lengthMm: row.length_mm,
    areaM2: row.area_m2,
    status: row.status as ExtractedQuantityStatus,
    confidence: row.confidence,
    warnings: warningArray(row.warnings_json),
    source: row.source as ExtractedQuantitySource,
    evidence: evidenceArray(row.evidence_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function persistExtractedQuantityRowsForRun(
  client: ExtractedQuantityPersistenceClient,
  args: { jobId: string; runId: string; quantities: ExtractedQuantity[]; now?: string },
): Promise<PersistExtractedQuantityRowsResult> {
  const now = args.now ?? new Date().toISOString();
  try {
    const supersede = await client
      .from("extracted_quantity_rows")
      .update({ superseded_at: now })
      .eq("job_id", args.jobId)
      .is("superseded_at", null)
      .neq("run_id", args.runId);
    if (supersede.error) {
      return { written: false, rowCount: 0, error: supersede.error.message };
    }

    const rows = args.quantities.map((quantity) =>
      toExtractedQuantityDbRow(quantity, { jobId: args.jobId, runId: args.runId, now }),
    );
    if (rows.length === 0) return { written: true, rowCount: 0, error: null };

    const insert = await client.from("extracted_quantity_rows").insert(rows);
    if (insert.error) return { written: false, rowCount: 0, error: insert.error.message };
    return { written: true, rowCount: rows.length, error: null };
  } catch (error) {
    return {
      written: false,
      rowCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function loadActiveExtractedQuantityRows(
  client: ExtractedQuantityPersistenceClient,
  args: { jobId: string; activeRunId?: string | null },
): Promise<LoadExtractedQuantityRowsResult> {
  try {
    const query = client.from("extracted_quantity_rows").select("*").eq("job_id", args.jobId);
    const result = args.activeRunId
      ? await query.eq("run_id", args.activeRunId)
      : await query.is("superseded_at", null);
    if (result.error) return { rows: [], error: result.error.message };
    return { rows: (result.data ?? []).map(fromExtractedQuantityDbRow), error: null };
  } catch (error) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
