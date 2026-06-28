import { useEffect, useState } from "react";
import {
  loadMeasurements,
  validateAgainstPrinted,
  loadPrintedQuantities,
  upsertPrintedQuantity,
  type PlanMeasurement,
} from "@/lib/iq-measurements";
import { toast } from "sonner";

/**
 * Shows printed-plan reference values vs measured values.
 * Printed values are user-entered (kept local for now; this stage of the
 * Plan Measurement Engine doesn't yet parse PDF text). The point is to make
 * the comparison surface honest and visible — Match / Minor / Review.
 */

const REFERENCES: Array<{
  key: string;
  label: string;
  unit: "m" | "m²";
  matchType: PlanMeasurement["measurement_type"] | "area";
}> = [
  { key: "perimeter", label: "External Perimeter", unit: "m", matchType: "external_perimeter" },
  { key: "total_area", label: "Total Area", unit: "m²", matchType: "area" },
  { key: "coverage_area", label: "Coverage Area", unit: "m²", matchType: "area" },
  { key: "garage_area", label: "Garage Area", unit: "m²", matchType: "area" },
];

type RowState = {
  value: string;
  source: "Uploaded Plan Text" | "Uploaded Specification Text";
  evidence: string;
  confidence: "high" | "mid" | "low";
  saved: boolean; // matches what's in DB
  loadedValue: string; // last persisted value
  loadedSource: "Uploaded Plan Text" | "Uploaded Specification Text";
  loadedEvidence: string;
  loadedConfidence: "high" | "mid" | "low";
};

function emptyRow(): RowState {
  return {
    value: "",
    source: "Uploaded Plan Text",
    evidence: "",
    confidence: "mid",
    saved: true,
    loadedValue: "",
    loadedSource: "Uploaded Plan Text",
    loadedEvidence: "",
    loadedConfidence: "mid",
  };
}

export function ValidationTab({
  jobId,
  legacyContainment = false,
}: {
  jobId: string;
  legacyContainment?: boolean;
}) {
  const [measurements, setMeasurements] = useState<PlanMeasurement[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(REFERENCES.map((r) => [r.key, emptyRow()])),
  );

  useEffect(() => {
    loadMeasurements(jobId)
      .then(setMeasurements)
      .catch(() => {});
  }, [jobId]);

  useEffect(() => {
    loadPrintedQuantities(jobId)
      .then((list) => {
        setRows((prev) => {
          const next = { ...prev };
          for (const ref of REFERENCES) {
            const match = list.find((p) => p.quantity_type === ref.key);
            if (match) {
              const value = match.extracted_value != null ? String(match.extracted_value) : "";
              const source =
                match.data_source === "Uploaded Specification Text"
                  ? "Uploaded Specification Text"
                  : "Uploaded Plan Text";
              const evidence = match.source_evidence ?? "";
              const conf =
                (match as unknown as { confidence?: string }).confidence === "high"
                  ? "high"
                  : (match as unknown as { confidence?: string }).confidence === "low"
                    ? "low"
                    : "mid";
              next[ref.key] = {
                value,
                source,
                evidence,
                confidence: conf,
                saved: true,
                loadedValue: value,
                loadedSource: source,
                loadedEvidence: evidence,
                loadedConfidence: conf,
              };
            }
          }
          return next;
        });
      })
      .catch(() => {});
  }, [jobId]);

  function update(key: string, patch: Partial<RowState>) {
    setRows((prev) => {
      const cur = prev[key] ?? emptyRow();
      const merged = { ...cur, ...patch };
      merged.saved =
        merged.value === merged.loadedValue &&
        merged.source === merged.loadedSource &&
        merged.evidence === merged.loadedEvidence &&
        merged.confidence === merged.loadedConfidence;
      return { ...prev, [key]: merged };
    });
  }

  async function persist(key: string) {
    if (legacyContainment) return;
    const ref = REFERENCES.find((r) => r.key === key);
    if (!ref) return;
    const row = rows[key];
    if (!row || row.saved) return;
    if (row.value.trim() === "") return;
    const num = Number(row.value);
    if (!Number.isFinite(num)) {
      toast.error("Enter a valid number.");
      return;
    }
    try {
      await upsertPrintedQuantity({
        jobId,
        quantityType: key,
        unit: ref.unit,
        value: num,
        source: row.source,
        evidence: row.evidence.trim() || null,
        confidence: row.confidence,
        confidenceLabel:
          row.confidence === "high" ? "High" : row.confidence === "low" ? "Low" : "Medium",
      });
      setRows((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          saved: true,
          loadedValue: row.value,
          loadedSource: row.source,
          loadedEvidence: row.evidence,
          loadedConfidence: row.confidence,
        },
      }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save printed value.");
    }
  }

  function bestMeasured(matchType: PlanMeasurement["measurement_type"] | "area"): number | null {
    const candidates = measurements.filter(
      (m) => m.review_status === "confirmed" && m.measurement_type === matchType,
    );
    if (candidates.length === 0) return null;
    if (matchType === "area") {
      return candidates[0].calculated_area_m2 ?? null;
    }
    return candidates[0].calculated_length_m ?? null;
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <div className="text-[13px] font-semibold tracking-tight">Validation</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          Compare printed plan / specification values against measured values. Each is kept as a
          separate quantity — Total Area, Coverage Area, and Area Over Frame are not merged.
        </div>
        {legacyContainment && (
          <div className="mt-2 rounded-md border border-confidence-mid/30 bg-confidence-mid/8 px-3 py-2 text-[11px] text-confidence-mid">
            Printed reference edits are disabled here; this is compatibility evidence, not the
            active extracted quantity authority.
          </div>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/30">
          <tr className="text-left text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="px-5 py-2.5 font-medium">Quantity</th>
            <th className="px-5 py-2.5 font-medium">Printed</th>
            <th className="px-5 py-2.5 font-medium">Source</th>
            <th className="px-5 py-2.5 font-medium">Source Evidence</th>
            <th className="px-5 py-2.5 font-medium">Confidence</th>
            <th className="px-5 py-2.5 font-medium">Measured</th>
            <th className="px-5 py-2.5 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {REFERENCES.map((ref) => {
            const measured = bestMeasured(ref.matchType);
            const row = rows[ref.key] ?? emptyRow();
            const printedNum = row.value ? Number(row.value) : null;
            const status = validateAgainstPrinted(printedNum, measured);
            return (
              <tr key={ref.key} className="border-t border-border">
                <td className="px-5 py-2.5 font-medium">{ref.label}</td>
                <td className="px-5 py-2.5">
                  <div className="inline-flex items-center gap-1.5">
                    <input
                      value={row.value}
                      disabled={legacyContainment}
                      title={
                        legacyContainment
                          ? "Printed reference edits are disabled in Review containment mode."
                          : undefined
                      }
                      onChange={(e) => update(ref.key, { value: e.target.value })}
                      onBlur={() => persist(ref.key)}
                      placeholder="—"
                      inputMode="decimal"
                      className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm tabular-nums disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <span className="text-[11px] text-muted-foreground">{ref.unit}</span>
                    <span
                      className={`ml-1 text-[10px] ${row.saved ? "text-confidence-high" : "text-confidence-mid"}`}
                    >
                      {row.value.trim() === "" ? "" : row.saved ? "Saved" : "Unsaved"}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-2.5">
                  <select
                    value={row.source}
                    disabled={legacyContainment}
                    onChange={(e) =>
                      update(ref.key, { source: e.target.value as RowState["source"] })
                    }
                    onBlur={() => persist(ref.key)}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="Uploaded Plan Text">Uploaded Plan Text</option>
                    <option value="Uploaded Specification Text">Uploaded Specification Text</option>
                  </select>
                </td>
                <td className="px-5 py-2.5">
                  <input
                    value={row.evidence}
                    disabled={legacyContainment}
                    onChange={(e) => update(ref.key, { evidence: e.target.value })}
                    onBlur={() => persist(ref.key)}
                    placeholder="e.g. Area box on floorplan page"
                    className="w-56 rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </td>
                <td className="px-5 py-2.5">
                  <select
                    value={row.confidence}
                    disabled={legacyContainment}
                    onChange={(e) =>
                      update(ref.key, { confidence: e.target.value as RowState["confidence"] })
                    }
                    onBlur={() => persist(ref.key)}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="high">High</option>
                    <option value="mid">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </td>
                <td className="px-5 py-2.5 tabular-nums">
                  {measured == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span>
                      {measured.toFixed(ref.unit === "m" ? 3 : 2)}{" "}
                      <span className="text-muted-foreground text-[11px]">{ref.unit}</span>
                    </span>
                  )}
                </td>
                <td className="px-5 py-2.5">
                  <ValidationBadge status={status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-5 py-3 border-t border-border text-[11px] text-muted-foreground">
        Tolerance: ±2% match · ±6% minor difference · otherwise review required.
      </div>
    </div>
  );
}

function ValidationBadge({
  status,
}: {
  status: "match" | "minor" | "review_required" | "missing";
}) {
  const cls =
    status === "match"
      ? "border-confidence-high/40 bg-confidence-high/10 text-confidence-high"
      : status === "minor"
        ? "border-confidence-mid/40 bg-confidence-mid/10 text-confidence-mid"
        : status === "review_required"
          ? "border-confidence-low/40 bg-confidence-low/10 text-confidence-low"
          : "border-border bg-muted/30 text-muted-foreground";
  const label =
    status === "match"
      ? "Match"
      : status === "minor"
        ? "Minor difference"
        : status === "review_required"
          ? "Review required"
          : "—";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {label}
    </span>
  );
}
