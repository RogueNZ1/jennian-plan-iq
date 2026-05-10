import { useEffect, useState } from "react";
import {
  loadMeasurements, validateAgainstPrinted, type PlanMeasurement,
} from "@/lib/iq-measurements";

/**
 * Shows printed-plan reference values vs measured values.
 * Printed values are user-entered (kept local for now; this stage of the
 * Plan Measurement Engine doesn't yet parse PDF text). The point is to make
 * the comparison surface honest and visible — Match / Minor / Review.
 */

const REFERENCES: Array<{ key: string; label: string; unit: "m" | "m²"; matchType: PlanMeasurement["measurement_type"] | "area"; }> = [
  { key: "perimeter",     label: "External Perimeter", unit: "m",  matchType: "external_perimeter" },
  { key: "total_area",    label: "Total Area",         unit: "m²", matchType: "area" },
  { key: "coverage_area", label: "Coverage Area",      unit: "m²", matchType: "area" },
  { key: "garage_area",   label: "Garage Area",        unit: "m²", matchType: "area" },
];

export function ValidationTab({ jobId }: { jobId: string }) {
  const [measurements, setMeasurements] = useState<PlanMeasurement[]>([]);
  const [printed, setPrinted] = useState<Record<string, string>>({});

  useEffect(() => {
    loadMeasurements(jobId).then(setMeasurements).catch(() => {});
  }, [jobId]);

  function bestMeasured(matchType: PlanMeasurement["measurement_type"] | "area"): number | null {
    const candidates = measurements.filter((m) =>
      m.review_status === "confirmed" && m.measurement_type === matchType,
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
          Compare printed plan / specification values against measured values.
          Each is kept as a separate quantity — Total Area, Coverage Area, and
          Area Over Frame are not merged.
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/30">
          <tr className="text-left text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="px-5 py-2.5 font-medium">Quantity</th>
            <th className="px-5 py-2.5 font-medium">Printed</th>
            <th className="px-5 py-2.5 font-medium">Measured</th>
            <th className="px-5 py-2.5 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {REFERENCES.map((ref) => {
            const measured = bestMeasured(ref.matchType);
            const printedNum = printed[ref.key] ? Number(printed[ref.key]) : null;
            const status = validateAgainstPrinted(printedNum, measured);
            return (
              <tr key={ref.key} className="border-t border-border">
                <td className="px-5 py-2.5 font-medium">{ref.label}</td>
                <td className="px-5 py-2.5">
                  <div className="inline-flex items-center gap-1.5">
                    <input
                      value={printed[ref.key] ?? ""}
                      onChange={(e) => setPrinted((p) => ({ ...p, [ref.key]: e.target.value }))}
                      placeholder="—"
                      inputMode="decimal"
                      className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm tabular-nums"
                    />
                    <span className="text-[11px] text-muted-foreground">{ref.unit}</span>
                  </div>
                </td>
                <td className="px-5 py-2.5 tabular-nums">
                  {measured == null
                    ? <span className="text-muted-foreground">—</span>
                    : <span>{measured.toFixed(ref.unit === "m" ? 3 : 2)} <span className="text-muted-foreground text-[11px]">{ref.unit}</span></span>}
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

function ValidationBadge({ status }: { status: "match" | "minor" | "review_required" | "missing" }) {
  const cls =
    status === "match"
      ? "border-confidence-high/40 bg-confidence-high/10 text-confidence-high"
      : status === "minor"
      ? "border-confidence-mid/40 bg-confidence-mid/10 text-confidence-mid"
      : status === "review_required"
      ? "border-confidence-low/40 bg-confidence-low/10 text-confidence-low"
      : "border-border bg-muted/30 text-muted-foreground";
  const label =
    status === "match"            ? "Match" :
    status === "minor"            ? "Minor difference" :
    status === "review_required"  ? "Review required" :
                                    "—";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}