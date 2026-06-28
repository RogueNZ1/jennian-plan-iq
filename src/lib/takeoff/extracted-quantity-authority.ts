import { supabase } from "@/integrations/supabase/client";
import type { EnrichedTakeoff } from "./enriched-takeoff";
import type { ExtractedQuantity } from "./extracted-quantity-ledger";
import {
  buildExtractedQuantityReadModel,
  type ExtractedQuantityReadModel,
} from "./extracted-quantity-read-model";
import {
  loadActiveExtractedQuantityRows,
  type ExtractedQuantityPersistenceClient,
} from "./extracted-quantity-persistence";

const ENRICHED_RUN_SCAN_LIMIT = 5;

export type EnrichedTakeoffRun = { id: string; started_at: string };

export type EnrichedTakeoffJsonWithRun = {
  enriched: EnrichedTakeoff | null;
  run: EnrichedTakeoffRun | null;
};

export type ExtractedQuantityAuthoritySource =
  | "persisted_current_run"
  | "takeoff_json_fallback"
  | "unavailable";

export type ExtractedQuantityAuthority = {
  source: ExtractedQuantityAuthoritySource;
  runId: string | null;
  quantities: ExtractedQuantity[];
  readModel: ExtractedQuantityReadModel | null;
  warnings: string[];
  enriched: EnrichedTakeoff | null;
  run: EnrichedTakeoffRun | null;
};

export interface EnrichedTakeoffRunClient {
  from(table: "takeoff_runs"): {
    select(columns: "*"): {
      eq(
        column: "job_id",
        value: string,
      ): {
        order(
          column: "started_at",
          options: { ascending: boolean },
        ): {
          limit(limit: number): PromiseLike<{
            data: Array<Record<string, unknown>> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

export async function loadEnrichedTakeoffJsonWithRun(
  jobId: string,
  client: EnrichedTakeoffRunClient = supabase as unknown as EnrichedTakeoffRunClient,
): Promise<EnrichedTakeoffJsonWithRun> {
  try {
    const res = await client
      .from("takeoff_runs")
      .select("*")
      .eq("job_id", jobId)
      .order("started_at", { ascending: false })
      .limit(ENRICHED_RUN_SCAN_LIMIT);
    if (res.error) return { enriched: null, run: null };
    for (const row of res.data ?? []) {
      const tj = row["takeoff_json"];
      if (tj && typeof tj === "object") {
        return {
          enriched: tj as EnrichedTakeoff,
          run: { id: row["id"] as string, started_at: row["started_at"] as string },
        };
      }
    }
    const first = (res.data ?? [])[0];
    return {
      enriched: null,
      run: first ? { id: first["id"] as string, started_at: first["started_at"] as string } : null,
    };
  } catch {
    return { enriched: null, run: null };
  }
}

export async function loadEnrichedTakeoffJson(jobId: string): Promise<EnrichedTakeoff | null> {
  return (await loadEnrichedTakeoffJsonWithRun(jobId)).enriched;
}

export async function loadActiveExtractedQuantityReadModel(
  jobId: string,
  activeRunId?: string | null,
  client: ExtractedQuantityPersistenceClient = supabase as unknown as ExtractedQuantityPersistenceClient,
): Promise<ExtractedQuantityReadModel | null> {
  if (!activeRunId) return null;
  const result = await loadActiveExtractedQuantityRows(client, { jobId, activeRunId });
  if (result.error || result.rows.length === 0) return null;
  return buildExtractedQuantityReadModel(result.rows, { activeRunId });
}

export async function resolveExtractedQuantityAuthorityForRun(
  client: ExtractedQuantityPersistenceClient,
  args: { jobId: string; enrichedRun: EnrichedTakeoffJsonWithRun },
): Promise<ExtractedQuantityAuthority> {
  const warnings: string[] = [];
  const runId = args.enrichedRun.run?.id ?? null;

  if (!runId) {
    return {
      source: "unavailable",
      runId,
      quantities: [],
      readModel: null,
      warnings: ["current takeoff runId unavailable"],
      enriched: args.enrichedRun.enriched,
      run: args.enrichedRun.run,
    };
  }

  const persisted = await loadActiveExtractedQuantityRows(client, {
    jobId: args.jobId,
    activeRunId: runId,
  });
  if (!persisted.error && persisted.rows.length > 0) {
    return {
      source: "persisted_current_run",
      runId,
      quantities: persisted.rows,
      readModel: buildExtractedQuantityReadModel(persisted.rows, { activeRunId: runId }),
      warnings,
      enriched: args.enrichedRun.enriched,
      run: args.enrichedRun.run,
    };
  }
  if (persisted.error)
    warnings.push(`persisted extracted quantity rows unavailable: ${persisted.error}`);

  const fallbackRows = args.enrichedRun.enriched?.extracted_quantities ?? [];
  if (fallbackRows.length > 0) {
    try {
      return {
        source: "takeoff_json_fallback",
        runId,
        quantities: fallbackRows,
        readModel: buildExtractedQuantityReadModel(fallbackRows, { activeRunId: runId }),
        warnings,
        enriched: args.enrichedRun.enriched,
        run: args.enrichedRun.run,
      };
    } catch (error) {
      warnings.push(
        `takeoff_json extracted quantities unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    source: "unavailable",
    runId,
    quantities: [],
    readModel: null,
    warnings,
    enriched: args.enrichedRun.enriched,
    run: args.enrichedRun.run,
  };
}

export async function loadExtractedQuantityAuthorityForJob(
  jobId: string,
  clients: {
    takeoffRuns?: EnrichedTakeoffRunClient;
    persistence?: ExtractedQuantityPersistenceClient;
  } = {},
): Promise<ExtractedQuantityAuthority> {
  const enrichedRun = await loadEnrichedTakeoffJsonWithRun(jobId, clients.takeoffRuns);
  return resolveExtractedQuantityAuthorityForRun(
    clients.persistence ?? (supabase as unknown as ExtractedQuantityPersistenceClient),
    { jobId, enrichedRun },
  );
}
