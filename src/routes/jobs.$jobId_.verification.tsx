/**
 * TAKEOFF VERIFICATION PRINTOUT - /jobs/$jobId/verification
 *
 * The human twin of the QS export: an A4 print-first document the estimator holds next to
 * the plans. Values come from buildQSExportData (the SAME composer the spreadsheet uses);
 * provenance, confidence and flags come from the persisted enriched takeoff, selected with
 * the SAME run-scan rule the export uses - so paper and sheet can never tell two stories.
 *
 * Acceptance criterion (12 Jun STATE): a verification page ships with EVERY takeoff.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Printer,
  ArrowLeft,
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronsLeftRight,
  ScanSearch,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildQSExportData, type QSExportData } from "@/lib/iq-qs-export";
import { loadExtractedQuantityAuthorityForJob } from "@/lib/takeoff/extracted-quantity-authority";
import {
  buildVerificationModel,
  SOURCE_LEGEND,
  type VerificationModel,
  type VerificationQuantityCategorySummary,
  type MeasureRow,
  type CountRow,
} from "@/lib/verification/verification-model";
import {
  VerificationPlanOverlay,
  type OverlayRenderStatus,
} from "@/components/jennian/VerificationPlanOverlay";
import type { VisualOpeningMarker } from "@/lib/verification/plan-overlay";
import {
  loadVisualOpeningCorrections,
  saveVisualOpeningCorrection,
  type VisualOpeningCorrection,
  type VisualOpeningCorrectionType,
} from "@/lib/verification/visual-opening-corrections";
import type { LedgerPlanOverlayModel } from "@/lib/verification/plan-overlay";

export const Route = createFileRoute("/jobs/$jobId_/verification")({
  component: VerificationPrintout,
});

/* ------------------------------------------------------------------ atoms */

function SourceChip({ row }: { row: MeasureRow }) {
  if (!row.source) return null;
  return (
    <span className="vchip">
      {row.source}
      {row.confidence ? <span className="vconf"> / {row.confidence}</span> : null}
    </span>
  );
}

function MeasureTable({ rows }: { rows: MeasureRow[] }) {
  return (
    <table className="vtable">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="vlabel">
              {r.flagged ? <span className="vflag">Review </span> : null}
              {r.label}
            </td>
            <td className="vvalue">
              {r.value}
              {r.value !== "-" && r.unit ? ` ${r.unit}` : ""}
            </td>
            <td className="vsrc">
              <SourceChip row={r} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CountTable({
  rows,
  totalLabel,
  total,
}: {
  rows: CountRow[];
  totalLabel?: string;
  total?: number;
}) {
  if (rows.length === 0) return <p className="vempty">None.</p>;
  return (
    <table className="vtable">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="vlabel">{r.label}</td>
            <td className="vvalue">{r.qty}</td>
            <td className="vsrc" />
          </tr>
        ))}
        {totalLabel ? (
          <tr className="vtotal">
            <td className="vlabel">{totalLabel}</td>
            <td className="vvalue">{total}</td>
            <td className="vsrc" />
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function fmtLedgerCell(value: number | string | null | undefined): string {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function bboxText(bbox: [number, number, number, number] | undefined): string {
  return bbox ? bbox.map((n) => Math.round(n * 100) / 100).join(", ") : "-";
}

function LedgerQuantityTable({ category }: { category: VerificationQuantityCategorySummary }) {
  const rows = [
    ...category.rows.extracted,
    ...category.rows.needs_review,
    ...category.rows.missing_evidence,
    ...category.rows.conflict,
    ...category.rows.ignored,
  ];
  if (rows.length === 0) return <p className="vempty">No ledger rows.</p>;
  return (
    <table className="vtable">
      <thead>
        <tr>
          <th>Label</th>
          <th>Status</th>
          <th>Count</th>
          <th>W</th>
          <th>H</th>
          <th>Len</th>
          <th>Area</th>
          <th>Conf.</th>
          <th>Evidence</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const evidence = row.evidence[0];
          return (
            <tr key={row.id}>
              <td className="vlabel">
                {row.label ?? row.id}
                <div className="vledger-sub">
                  {row.source}  /  {row.runId ?? "no run"}  /  {row.id}
                </div>
              </td>
              <td>{row.status}</td>
              <td className="vvalue">{fmtLedgerCell(row.count)}</td>
              <td className="vvalue">{fmtLedgerCell(row.widthMm)}</td>
              <td className="vvalue">{fmtLedgerCell(row.heightMm)}</td>
              <td className="vvalue">{fmtLedgerCell(row.lengthMm)}</td>
              <td className="vvalue">{fmtLedgerCell(row.areaM2)}</td>
              <td>{row.confidence}</td>
              <td>
                {[
                  row.warnings.join(", "),
                  evidence?.page ? `p${evidence.page}` : null,
                  bboxText(evidence?.bbox),
                  evidence?.text,
                ]
                  .filter(Boolean)
                  .join("  /  ")}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function LedgerQuantitySection({ model }: { model: VerificationModel }) {
  const q = model.extractedQuantities;
  if (!q.readModel) {
    return (
      <div className="vbanner vbanner-compact">
        <strong>Extracted quantity ledger unavailable.</strong>
        {q.warnings.map((warning) => (
          <div key={warning}>{warning}</div>
        ))}
      </div>
    );
  }
  return (
    <>
      <div className="vsrcline">
        Authority: <strong>{q.source}</strong>  /  run <strong>{q.runId ?? "-"}</strong>  /  clean
        totals exclude needs_review, missing_evidence, conflict, and ignored rows.
      </div>
      {q.warnings.length > 0 && (
        <div className="vbanner vbanner-compact">
          {q.warnings.map((warning) => (
            <div key={warning}>
              <strong>{warning}</strong>
            </div>
          ))}
        </div>
      )}
      {q.categories.map((category) => (
        <div key={category.category} className="vledger-category">
          <h3>{category.label}</h3>
          <div className="vledger-summary">
            <span>Clean count {category.cleanTotals.count}</span>
            <span>Clean length {category.cleanTotals.lengthMm || "-"} mm</span>
            <span>Clean area {category.cleanTotals.areaM2 || "-"} m2</span>
            <span>needs_review {category.statusCounts.needs_review}</span>
            <span>missing {category.statusCounts.missing_evidence}</span>
            <span>conflict {category.statusCounts.conflict}</span>
            <span>ignored {category.statusCounts.ignored}</span>
            <span>confidence {category.confidence ?? "-"}</span>
          </div>
          <LedgerQuantityTable category={category} />
        </div>
      ))}
    </>
  );
}

function LedgerOverlayRowsTable({
  rows,
  emptyText,
}: {
  rows: LedgerPlanOverlayModel["unmarkedRows"];
  emptyText: string;
}) {
  if (rows.length === 0) return <p className="vempty">{emptyText}</p>;
  return (
    <table className="vtable">
      <thead>
        <tr>
          <th>Ledger row</th>
          <th>Category</th>
          <th>Status</th>
          <th>Count</th>
          <th>W</th>
          <th>H</th>
          <th>Len</th>
          <th>Area</th>
          <th>Warnings / evidence</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.extractedQuantityId}>
            <td className="vlabel">
              {row.label ?? row.extractedQuantityId}
              <div className="vledger-sub">
                {row.source}  /  {row.runId ?? "no run"}  /  {row.extractedQuantityId}
              </div>
              {row.visualAnchorId ? (
                <div className="vledger-sub">anchor  /  {row.visualAnchorId}</div>
              ) : null}
            </td>
            <td>{row.category}</td>
            <td>{row.status}</td>
            <td className="vvalue">{fmtLedgerCell(row.count)}</td>
            <td className="vvalue">{fmtLedgerCell(row.widthMm)}</td>
            <td className="vvalue">{fmtLedgerCell(row.heightMm)}</td>
            <td className="vvalue">{fmtLedgerCell(row.lengthMm)}</td>
            <td className="vvalue">{fmtLedgerCell(row.areaM2)}</td>
            <td>
              {[
                row.warnings.join(", "),
                row.evidencePage ? `p${row.evidencePage}` : null,
                row.evidenceText,
              ]
                .filter(Boolean)
                .join("  /  ")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LedgerOverlaySection({ overlay }: { overlay: LedgerPlanOverlayModel }) {
  return (
    <>
      <div className="vsrcline">
        Active extracted quantity overlay: <strong>{overlay.authoritySource}</strong>  /  run{" "}
        <strong>{overlay.runId ?? "-"}</strong>
      </div>
      <div className="vledger-summary">
        <span>Total ledger rows {overlay.totalLedgerRows}</span>
        <span>Rows with markers {overlay.markedRows.length}</span>
        <span>Rows without markers {overlay.unmarkedRows.length}</span>
      </div>
      {overlay.warnings.length > 0 && (
        <div className="vbanner vbanner-compact">
          {overlay.warnings.map((warning) => (
            <div key={warning}>
              <strong>{warning}</strong>
            </div>
          ))}
        </div>
      )}
      <h3>Drawable ledger markers</h3>
      <LedgerOverlayRowsTable
        rows={overlay.markedRows}
        emptyText="No active ledger rows have drawable bbox markers."
      />
      <h3>Rows without markers</h3>
      <LedgerOverlayRowsTable rows={overlay.unmarkedRows} emptyText="No unmarked ledger rows." />
      <div className="vbanner vbanner-compact">
        <div>
          <strong>Legacy visual evidence only.</strong> Legacy door hits:{" "}
          {overlay.legacyEvidence.doorHitCount}; legacy visual openings:{" "}
          {overlay.legacyEvidence.visualOpeningCount}. {overlay.legacyEvidence.warning}
        </div>
      </div>
    </>
  );
}

function openingDisplayType(type: string): string {
  switch (type) {
    case "window":
      return "window";
    case "garage_window":
      return "garage window";
    case "slider":
      return "slider";
    case "pa_door":
      return "PA opening";
    case "external_door":
      return "opening";
    case "garage_door":
      return "garage door";
    default:
      return type.replace(/_/g, " ");
  }
}

function doorMarkerNeedsReview(note: string | undefined): boolean {
  return /swing arc not vector-recovered/i.test(note ?? "");
}

function doorMarkerStatus(d: { confidence: "confirmed" | "flag"; note?: string }): string {
  if (d.confidence === "flag") return "Review flag - review";
  return doorMarkerNeedsReview(d.note) ? "counted - verify" : "confirmed";
}

const VISUAL_CORRECTION_ACTIONS: Array<{
  type: VisualOpeningCorrectionType;
  label: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    type: "confirm_opening",
    label: "Confirm",
    title: "Confirm this visual marker is a real opening candidate.",
    icon: CheckCircle2,
  },
  {
    type: "component_of_opening",
    label: "Part",
    title: "Mark this as part of the neighbouring opening, not a separate row.",
    icon: ChevronsLeftRight,
  },
  {
    type: "not_opening",
    label: "Not opening",
    title: "Mark this as cladding, hatch, annotation, or another non-opening.",
    icon: Ban,
  },
  {
    type: "box_too_small",
    label: "Small",
    title: "The visual box covers only part of the opening.",
    icon: ScanSearch,
  },
  {
    type: "box_too_large",
    label: "Large",
    title: "The visual box includes surrounding cladding or neighbouring geometry.",
    icon: ScanSearch,
  },
];

function correctionLabel(type: VisualOpeningCorrectionType): string {
  switch (type) {
    case "confirm_opening":
      return "confirmed candidate";
    case "component_of_opening":
      return "component of another opening";
    case "not_opening":
      return "not an opening";
    case "box_too_small":
      return "box too small";
    case "box_too_large":
      return "box too large";
    case "wrong_type":
      return "wrong type";
  }
}

function correctionReason(type: VisualOpeningCorrectionType): string {
  switch (type) {
    case "confirm_opening":
      return "Human review confirms the marker is a visible physical opening candidate.";
    case "component_of_opening":
      return "Human review says this is part of a neighbouring opening assembly, not a separate row.";
    case "not_opening":
      return "Human review says this is not a physical opening.";
    case "box_too_small":
      return "Human review says the marker covers only part of the opening.";
    case "box_too_large":
      return "Human review says the marker includes material outside the opening.";
    case "wrong_type":
      return "Human review says the opening type is wrong.";
  }
}

function Section({
  title,
  children,
  checkbox = true,
  className,
}: {
  title: string;
  children: React.ReactNode;
  checkbox?: boolean;
  className?: string;
}) {
  return (
    <section className={["vsec", className].filter(Boolean).join(" ")}>
      <div className="vsec-head">
        <h2>{title}</h2>
        {checkbox ? <span className="vcheck">Checked against plan&nbsp;[ ]</span> : null}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ page */

function VerificationPrintout() {
  const { jobId } = Route.useParams();
  const [model, setModel] = useState<VerificationModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overlayStatus, setOverlayStatus] = useState<OverlayRenderStatus>("loading");
  const [visualCorrections, setVisualCorrections] = useState<
    Record<string, VisualOpeningCorrection>
  >({});
  const [correctionSaving, setCorrectionSaving] = useState<string | null>(null);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOverlayStatus("loading");
    (async () => {
      try {
        const [data, er] = await Promise.all([
          buildQSExportData(jobId) as Promise<QSExportData>,
          loadExtractedQuantityAuthorityForJob(jobId),
        ]);
        if (cancelled) return;
        setModel(buildVerificationModel(data, er.enriched, er.run, undefined, er));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    let cancelled = false;
    setCorrectionError(null);
    loadVisualOpeningCorrections(jobId)
      .then((rows) => {
        if (!cancelled) setVisualCorrections(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setVisualCorrections({});
          setCorrectionError(
            err instanceof Error ? err.message : "Could not load visual opening corrections.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const overlayReady = model != null && overlayStatus !== "loading";

  async function handleVisualCorrection(
    marker: VisualOpeningMarker,
    correctionType: VisualOpeningCorrectionType,
  ) {
    if (!model) return;
    const savingKey = `${marker.markerLabel}:${correctionType}`;
    setCorrectionSaving(savingKey);
    setCorrectionError(null);
    try {
      const saved = await saveVisualOpeningCorrection({
        jobId,
        takeoffRunId: model.header.runId,
        marker,
        correctionType,
        reason: correctionReason(correctionType),
      });
      setVisualCorrections((prev) => ({ ...prev, [saved.marker_label]: saved }));
    } catch (err) {
      setCorrectionError(
        err instanceof Error ? err.message : "Could not save visual opening correction.",
      );
    } finally {
      setCorrectionSaving(null);
    }
  }

  useEffect(() => {
    document.documentElement.dataset.verificationReady = overlayReady ? "true" : "false";
    return () => {
      delete document.documentElement.dataset.verificationReady;
    };
  }, [overlayReady]);

  async function waitForPrintAssets() {
    await document.fonts?.ready;
    const images = Array.from(document.images);
    await Promise.all(
      images.map(async (img) => {
        if (img.complete && img.naturalWidth > 0) return;
        await img.decode().catch(() => {});
      }),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }

  async function handlePrint() {
    if (!overlayReady) return;
    await waitForPrintAssets();
    window.print();
  }

  if (loading) {
    return (
      <div className="p-10 text-sm text-muted-foreground">Building verification document...</div>
    );
  }
  if (error || !model) {
    return (
      <div className="p-10">
        <p className="text-sm text-destructive">
          Could not build the verification document: {error ?? "no data"}
        </p>
        <Link
          to="/jobs/$jobId"
          params={{ jobId }}
          className="text-sm text-primary underline mt-3 inline-block"
        >
          {"<- Back to job"}
        </Link>
      </div>
    );
  }

  const m = model;

  return (
    <div className="vroot">
      <style>{PRINT_CSS}</style>

      {/* screen-only toolbar */}
      <div className="no-print vtoolbar">
        <Link to="/jobs/$jobId" params={{ jobId }} className="vtool-link">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to job
        </Link>
        <button
          type="button"
          className="vtool-print"
          onClick={handlePrint}
          disabled={!overlayReady}
          aria-busy={!overlayReady}
        >
          <Printer className="h-3.5 w-3.5" />{" "}
          {overlayReady ? "Print / Save as PDF" : "Preparing print..."}
        </button>
      </div>
      <div className="no-print" data-verification-ready={overlayReady ? "true" : "false"} />

      <div className="vdoc">
        {/* header */}
        <header className="vhead">
          <div className="vbrand-bar" />
          <div className="vhead-row">
            <div>
              <div className="vtitle">TAKEOFF VERIFICATION</div>
              <div className="vsub">Jennian IQ  /  hold this document against the plans</div>
            </div>
            <div className="vmeta">
              <div>
                <span>Job</span>
                {m.header.jobNumber}
              </div>
              <div>
                <span>JMW</span>
                {m.header.jmwNumber}
              </div>
              <div>
                <span>Plan ver.</span>
                {m.header.planVersion}
              </div>
            </div>
          </div>
          <div className="vhead-grid">
            <div>
              <span>Client</span>
              {m.header.clientName}
            </div>
            <div>
              <span>Address</span>
              {m.header.address}
            </div>
            <div>
              <span>Takeoff run</span>
              {m.header.runIdShort ?? "-"}
              {m.header.runStartedNzt ? `  /  ${m.header.runStartedNzt} NZT` : ""}
            </div>
            <div>
              <span>Printed</span>
              {m.header.generatedNzt} NZT
            </div>
          </div>
        </header>

        {/* integrity / geometry banners */}
        {m.integrityAlerts.length > 0 && (
          <div className="vbanner vbanner-red">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div>
              <strong>DO NOT USE - printout/export divergence detected.</strong>
              {m.integrityAlerts.map((a) => (
                <div key={a}>{a}</div>
              ))}
            </div>
          </div>
        )}
        {m.geometryOffline && (
          <div className="vbanner">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div>
              <strong>ReviewReview GEOMETRY LAYER OFFLINE</strong> - vision-only takeoff; deterministic
              measurement and cross-checks did not run. Verify all measurements against the plan
              before pricing.
            </div>
          </div>
        )}

        {/* 1  /  key measures */}
        <Section title="1  /  Key measures">
          <MeasureTable rows={m.measures} />
        </Section>

        <Section title="2 - Extracted quantity ledger">
          <LedgerQuantitySection model={m} />
        </Section>

        {/* 2  /  windows */}
        <Section title="2  /  Windows & glazed openings">
          {m.windows.pricingBlockFlags.length > 0 && (
            <div className="vbanner vbanner-compact">
              {m.windows.pricingBlockFlags.map((f) => (
                <div key={f}>
                  <strong>{f}</strong>
                </div>
              ))}
            </div>
          )}
          {m.windows.unplacedFlags.length > 0 && (
            <div className="vbanner vbanner-compact">
              {m.windows.unplacedFlags.map((f) => (
                <div key={f}>
                  <strong>{f}</strong>
                </div>
              ))}
            </div>
          )}
          <div className="vcols">
            <div>
              <h3>
                {m.windows.openings.length > 0
                  ? "Canonical QS openings"
                  : "Per-room (as the QS sheet receives it)"}
              </h3>
              {m.windows.openings.length > 0 ? (
                <table className="vtable">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Type</th>
                      <th>Room</th>
                      <th>H (m)</th>
                      <th>W (m)</th>
                      <th>Area</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.windows.openings.map((r) => (
                      <tr key={r.id}>
                        <td className="vlabel">{r.id}</td>
                        <td>{r.type}</td>
                        <td>{r.room}</td>
                        <td className="vvalue">{r.height}</td>
                        <td className="vvalue">{r.width}</td>
                        <td className="vvalue">{r.area}</td>
                        <td>{[r.source, ...r.flags].filter(Boolean).join("  /  ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : m.windows.byRoom.length === 0 ? (
                <p className="vempty">No per-room window rows.</p>
              ) : (
                <table className="vtable">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Cladding</th>
                      <th>Qty</th>
                      <th>H (mm)</th>
                      <th>W (mm)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.windows.byRoom.map((r) => (
                      <tr key={r.room}>
                        <td className="vlabel">{r.room}</td>
                        <td>{r.cladding}</td>
                        <td className="vvalue">{r.qty}</td>
                        <td className="vvalue">{r.height}</td>
                        <td className="vvalue">{r.width}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div>
              <h3>Window schedule (plan cross-check)</h3>
              {m.windows.schedule.length === 0 ? (
                <p className="vempty">No schedule read for this run.</p>
              ) : (
                <table className="vtable">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>H (m)</th>
                      <th>W (m)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.windows.schedule.map((s) => (
                      <tr key={s.id}>
                        <td className="vlabel">{s.id}</td>
                        <td className="vvalue">{s.height_m ?? "-"}</td>
                        <td className="vvalue">{s.width_m ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="vtotals">
                <div>
                  <span>
                    {m.windows.pricingBlocked
                      ? "Pricing status"
                      : m.windows.totals.qsGlazedOpeningCount != null
                        ? "QS openings"
                        : "Window count"}
                  </span>
                  {m.windows.totals.qsGlazedOpeningCount ?? m.windows.totals.windowCount ?? "-"}
                </div>
                {m.windows.pricingBlocked &&
                  m.windows.reviewOnlyTotals.qsGlazedOpeningCount != null && (
                    <div>
                      <span>Review-only Visual QS openings</span>
                      {m.windows.reviewOnlyTotals.qsGlazedOpeningCount}
                    </div>
                  )}
                {m.windows.pricingBlocked && m.windows.reviewOnlyTotals.garageDoorCount != null && (
                  <div>
                    <span>Review-only garage candidates</span>
                    {m.windows.reviewOnlyTotals.garageDoorCount}
                  </div>
                )}
                {!m.windows.pricingBlocked && m.windows.totals.garageDoorCount != null && (
                  <div>
                    <span>Garage doors</span>
                    {m.windows.totals.garageDoorCount}
                  </div>
                )}
                <div>
                  <span>Glazed</span>
                  {m.windows.totals.glazedSqm ?? "-"} m2
                </div>
                <div>
                  <span>Total openings</span>
                  {m.windows.totals.totalOpeningSqm ?? "-"} m2
                </div>
              </div>
            </div>
          </div>
          {m.windows.qsRows.length > 0 && (
            <>
              <h3>Joinery rows (exported)</h3>
              <CountTable rows={m.windows.qsRows} />
            </>
          )}
        </Section>

        {/* 3  /  doors */}
        <Section title="3  /  Doors">
          <div className="vsrcline">
            Interior counts source: <strong>{m.doors.sourceLabel}</strong>
            {m.doors.visionHint != null ? (
              <span className="vhint">  /  vision hint: {m.doors.visionHint} (never exported)</span>
            ) : null}
          </div>
          <div className="vcols">
            <div>
              <h3>Interior</h3>
              <CountTable
                rows={m.doors.interior}
                totalLabel="Total interior"
                total={m.doors.interiorTotal}
              />
            </div>
            <div>
              <h3>External & garage</h3>
              <table className="vtable">
                <tbody>
                  <tr>
                    <td className="vlabel">Garage door size</td>
                    <td className="vvalue">{m.doors.garageDoorSize}</td>
                    <td className="vsrc">{m.doors.garageDoorFlags.length > 0 ? "Review" : null}</td>
                  </tr>
                  {m.doors.garageDoorFlags.map((flag) => (
                    <tr key={flag}>
                      <td />
                      <td colSpan={2} className="vflag">
                        {flag}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <CountTable rows={m.doors.garage} />
              {m.doors.hardware.length > 0 && (
                <>
                  <h3>Hardware</h3>
                  <CountTable rows={m.doors.hardware} />
                </>
              )}
            </div>
          </div>
        </Section>

        {/* 4  /  plan overlay */}
        <Section title="4  /  Plan overlay - active extracted quantity ledger" className="vsec-plan">
          <LedgerOverlaySection overlay={m.planOverlay.ledgerOverlay} />
          <VerificationPlanOverlay
            jobId={jobId}
            ledgerOverlay={m.planOverlay.ledgerOverlay}
            page={m.planOverlay.page}
            onStatusChange={setOverlayStatus}
          />
          <div className="vplan-note">
            Active overlay markers are drawn only from active extracted quantity ledger rows with
            bbox evidence. Rows without bbox stay visible above as no-marker ledger rows.
          </div>
          <div className="vplan-detail-break" />
          {m.planOverlay.visualWarnings.length > 0 && (
            <div className="vbanner vbanner-compact">
              {m.planOverlay.visualWarnings.map((w) => (
                <div key={w}>
                  <strong>{w}</strong>
                </div>
              ))}
            </div>
          )}
          {m.planOverlay.visualOpenings.length > 0 && (
            <>
              <div className="vsrcline" style={{ marginTop: 8 }}>
                Legacy visual evidence only - not active extracted quantity authority:{" "}
                <strong>{m.planOverlay.visualSummary?.totalOpenings ?? "-"}</strong> total  / {" "}
                <strong>{m.planOverlay.visualSummary?.qsGlazedOpenings ?? "-"}</strong> QS
                glazed/opening items  / {" "}
                <strong>{m.planOverlay.visualSummary?.garageDoors ?? "-"}</strong> garage door
                excluded from glazing  / {" "}
                <strong>{m.planOverlay.visualSummary?.uncertain ?? "-"}</strong> uncertain/low.
              </div>
              <table className="vtable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Type</th>
                    <th>Room</th>
                    <th>Size</th>
                    <th>Conf.</th>
                    <th className="no-print">Review truth</th>
                    <th>Evidence / flags</th>
                  </tr>
                </thead>
                <tbody>
                  {m.planOverlay.visualOpenings.map((o) => (
                    <tr key={o.markerLabel}>
                      <td className="vlabel">{o.markerLabel}</td>
                      <td>{openingDisplayType(o.type)}</td>
                      <td>{o.room ?? "-"}</td>
                      <td className="vvalue">
                        {o.height_m != null && o.width_m != null
                          ? `${Math.round(o.height_m * 1000)} Ã- ${Math.round(o.width_m * 1000)}`
                          : (o.label ?? "-")}
                      </td>
                      <td>{o.confidence}</td>
                      <td className="no-print vcorrection-cell">
                        {visualCorrections[o.markerLabel] ? (
                          <div className="vcorrection-state">
                            {correctionLabel(visualCorrections[o.markerLabel].correction_type)}
                          </div>
                        ) : null}
                        <div className="vcorrection-actions">
                          {VISUAL_CORRECTION_ACTIONS.map((action) => {
                            const Icon = action.icon;
                            const savingKey = `${o.markerLabel}:${action.type}`;
                            const isSaving = correctionSaving === savingKey;
                            return (
                              <button
                                key={action.type}
                                type="button"
                                className="vcorrection-btn"
                                title={`${action.title} Legacy visual correction controls are quarantined in ledger overlay mode.`}
                                disabled
                              >
                                <Icon className="h-3 w-3" />
                                <span>{isSaving ? "Saving" : `${action.label} (legacy)`}</span>
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td>{[o.evidence, ...o.flags].filter(Boolean).join("  /  ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="no-print vcorrection-note">
                Legacy visual correction controls are quarantined in ledger overlay mode. They do
                not change active ledger rows, QS pricing, opening totals, or the export.
                {correctionError ? <strong> Save issue: {correctionError}</strong> : null}
              </div>
            </>
          )}
          {m.planOverlay.markers.length > 0 && (
            <>
              <div className="vsrcline" style={{ marginTop: 8 }}>
                Legacy door-engine evidence only - not active extracted quantity authority:{" "}
                {m.planOverlay.markers.length} hits  / {" "}
                {m.planOverlay.markers.filter((d) => doorMarkerNeedsReview(d.note)).length} verify
                 /  {m.planOverlay.summary.flagged} flagged &nbsp;(hinged{" "}
                {m.planOverlay.summary.byType.hinged}  /  double{" "}
                {m.planOverlay.summary.byType.double}
                &nbsp; /  cavity {m.planOverlay.summary.byType.cavity}). These legacy hits are not
                active ledger totals.
              </div>
              <table className="vtable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Type</th>
                    <th>Width (mm)</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {m.planOverlay.markers.map((d) => (
                    <tr key={d.label}>
                      <td className="vlabel">{d.label}</td>
                      <td>{d.type}</td>
                      <td className="vvalue">{d.widthMm}</td>
                      <td>{doorMarkerStatus(d)}</td>
                      <td>{d.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Section>

        {/* 5  /  roof / cladding / elevations */}
        <Section title="5  /  Roof, cladding & elevations">
          {m.elevationWarning && (
            <div className="vbanner vbanner-compact">
              <strong>Review {m.elevationWarning}</strong>
            </div>
          )}
          <div className="vcols">
            <div>
              <h3>Roof & cladding</h3>
              <MeasureTable rows={m.roofCladding} />
            </div>
            <div>
              <h3>Elevations & site</h3>
              <MeasureTable rows={m.elevation} />
            </div>
          </div>
        </Section>

        {/* 6  /  services & extras */}
        <Section title="6  /  Services & extras">
          <div className="vcols">
            <div>
              <h3>Downpipes</h3>
              <CountTable rows={m.services.downpipes} />
              <h3>Heat pumps</h3>
              <CountTable rows={m.services.heatPumps} />
            </div>
            <div>
              <h3>Skylights</h3>
              <CountTable rows={m.services.skylights} />
              <h3>Extras / PC items</h3>
              {m.services.extras.length === 0 ? (
                <p className="vempty">None.</p>
              ) : (
                <table className="vtable">
                  <tbody>
                    {m.services.extras.map((x) => (
                      <tr key={x.label}>
                        <td className="vlabel">{x.label}</td>
                        <td className="vvalue">{x.value}</td>
                        <td className="vsrc" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </Section>

        {/* 7  /  specifications */}
        <Section title="7  /  Specifications (meeting answers)">
          <div className="vspec-grid">
            {m.specs.map((g) => (
              <div key={g.group} className="vspec-group">
                <h3>{g.group}</h3>
                <table className="vtable">
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.label}>
                        <td className="vlabel">{r.label}</td>
                        <td className={r.answer === "- not set" ? "vvalue vunset" : "vvalue"}>
                          {r.answer}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </Section>

        {/* 8  /  exceptions */}
        <Section title="8  /  Exceptions & review flags" checkbox={false}>
          {m.exceptions.length === 0 ? (
            <p className="vempty">No exceptions raised on this takeoff.</p>
          ) : (
            <div className="vexceptions">
              {m.exceptions.map((g) => (
                <div key={g.field} className="vex-group">
                  <div className="vex-field">Review {g.field}</div>
                  {g.flags.map((f) => (
                    <div key={f} className="vex-flag">
                      {f}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* legend + sign-off */}
        <footer className="vfoot">
          <div className="vlegend">
            {SOURCE_LEGEND.map((l) => (
              <span key={l.tag}>
                <span className="vchip">{l.tag}</span> {l.meaning}
              </span>
            ))}
          </div>
          <div className="vsign">
            <div className="vsign-line">
              <span>Verified by</span>
              <div />
            </div>
            <div className="vsign-line">
              <span>Signature</span>
              <div />
            </div>
            <div className="vsign-line">
              <span>Date</span>
              <div />
            </div>
          </div>
          <div className="vfoot-note">
            Generated by Jennian IQ  /  values on this document are produced by the same composer as
            the QS export (source: {m.header.takeoffSource ?? "unknown"}). An unfilled cell beats a
            wrong cell - anything marked Review or "- not set" must be resolved before pricing.
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ print CSS */

const PRINT_CSS = `
.vroot { background:#f3f4f6; min-height:100vh; padding:24px 12px 64px; font-family: ui-sans-serif, system-ui, sans-serif; }
.vtoolbar { max-width:210mm; margin:0 auto 12px; display:flex; justify-content:space-between; align-items:center; }
.vtool-link { display:inline-flex; gap:6px; align-items:center; font-size:12px; color:#374151; text-decoration:none; }
.vtool-link:hover { text-decoration:underline; }
.vtool-print { display:inline-flex; gap:6px; align-items:center; font-size:12px; font-weight:600; color:#fff; background:#E71B23; border:none; border-radius:6px; padding:8px 14px; cursor:pointer; }
.vtool-print:hover { background:#c8161d; }
.vtool-print:disabled { background:#9ca3af; cursor:wait; }

.vdoc { max-width:210mm; margin:0 auto; background:#fff; box-shadow:0 1px 6px rgba(0,0,0,.12); padding:14mm 14mm 10mm; color:#111827; font-size:11px; line-height:1.45; }

.vbrand-bar { height:5px; background:#E71B23; margin:-14mm -14mm 10px; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vhead-row { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
.vtitle { font-size:19px; font-weight:800; letter-spacing:.04em; }
.vsub { font-size:10.5px; color:#6b7280; margin-top:2px; }
.vmeta { text-align:right; font-size:11px; }
.vmeta span { color:#6b7280; margin-right:6px; font-size:10px; text-transform:uppercase; letter-spacing:.05em; }
.vhead-grid { display:grid; grid-template-columns:1fr 1fr; gap:2px 24px; margin-top:10px; padding-top:8px; border-top:1px solid #e5e7eb; }
.vhead-grid span { display:inline-block; min-width:78px; color:#6b7280; font-size:10px; text-transform:uppercase; letter-spacing:.05em; }

.vbanner { display:flex; gap:8px; align-items:flex-start; border:2px solid #111827; background:#fef9c3; padding:8px 10px; margin:12px 0; font-size:11px; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vbanner-red { border-color:#E71B23; background:#fee2e2; }
.vbanner-compact { margin:6px 0 10px; }

.vsec { margin-top:16px; break-inside:avoid; }
.vsec-head { display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid #111827; padding-bottom:3px; margin-bottom:7px; }
.vsec-head h2 { font-size:12.5px; font-weight:800; letter-spacing:.03em; margin:0; }
.vcheck { font-size:10px; color:#374151; }
.vsec h3 { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#374151; margin:10px 0 4px; }
.vsec-plan { break-inside:auto; }
.vplan-note { margin:5px 0 0; font-size:9.5px; color:#374151; }
.vplan-detail-break { display:none; }

.vtable { width:100%; border-collapse:collapse; }
.vtable th { text-align:left; font-size:9.5px; text-transform:uppercase; letter-spacing:.05em; color:#6b7280; border-bottom:1px solid #d1d5db; padding:2px 6px 3px 0; font-weight:600; }
.vtable td { border-bottom:1px solid #f0f0f0; padding:3px 6px 3px 0; vertical-align:top; }
.vlabel { color:#111827; }
.vvalue { font-variant-numeric:tabular-nums; font-weight:600; white-space:nowrap; }
.vsrc { text-align:right; width:64px; }
.vtotal td { border-top:1.5px solid #111827; border-bottom:none; font-weight:700; }
.vcorrection-cell { min-width:158px; }
.vcorrection-state { display:inline-flex; margin-bottom:3px; border:1px solid #86efac; background:#dcfce7; color:#166534; border-radius:4px; padding:1px 5px; font-size:9px; font-weight:700; }
.vcorrection-actions { display:flex; flex-wrap:wrap; gap:3px; }
.vcorrection-btn { display:inline-flex; align-items:center; gap:3px; border:1px solid #d1d5db; background:#fff; color:#374151; border-radius:4px; padding:2px 5px; font-size:9px; font-weight:600; cursor:pointer; }
.vcorrection-btn:hover { background:#f3f4f6; }
.vcorrection-btn:disabled { opacity:.55; cursor:wait; }
.vcorrection-note { margin-top:5px; font-size:9.5px; color:#374151; }
.vcorrection-note strong { color:#b91c1c; }
.vempty { color:#9ca3af; font-style:italic; margin:2px 0 6px; }
.vunset { color:#b91c1c; font-weight:700; }

.vchip { display:inline-block; border:1px solid #9ca3af; border-radius:3px; padding:0 4px; font-size:8.5px; font-weight:700; letter-spacing:.04em; color:#374151; }
.vconf { font-weight:500; color:#6b7280; }
.vflag { color:#E71B23; font-weight:800; print-color-adjust:exact; -webkit-print-color-adjust:exact; }

.vcols { display:grid; grid-template-columns:1fr 1fr; gap:0 24px; }
.vtotals { display:flex; gap:18px; margin-top:7px; font-weight:700; }
.vtotals span { display:block; font-weight:500; font-size:9.5px; text-transform:uppercase; letter-spacing:.05em; color:#6b7280; }
.vsrcline { font-size:11px; margin-bottom:6px; }
.vhint { color:#6b7280; font-weight:400; }
.vledger-summary { display:flex; flex-wrap:wrap; gap:6px 12px; margin:6px 0 8px; font-size:10px; font-weight:700; color:#374151; }
.vledger-summary span { border:1px solid #d1d5db; border-radius:4px; padding:2px 6px; background:#f9fafb; }
.vledger-sub { color:#6b7280; font-size:9px; font-weight:500; margin-top:1px; }

.vspec-grid { display:grid; grid-template-columns:1fr 1fr; gap:2px 24px; }
.vspec-group { break-inside:avoid; }

.vexceptions { display:flex; flex-direction:column; gap:7px; }
.vex-group { border-left:3px solid #E71B23; padding-left:8px; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vex-field { font-weight:800; }
.vex-flag { color:#374151; }

.voverlay-wrap { position:relative; border:1px solid #d1d5db; background:#fff; }
.voverlay-wrap img { display:block; width:100%; height:100%; }
.voverlay-wrap svg { position:absolute; inset:0; width:100%; height:100%; }
.vov-door { fill:rgba(220,38,38,.05); stroke:#dc2626; stroke-width:2; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vov-flag { fill:rgba(180,83,9,.05); stroke:#b45309; stroke-width:2; stroke-dasharray:5 4; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vov-label { fill:#fff; font:800 10px ui-sans-serif, system-ui, sans-serif; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vov-door-leader { stroke:#dc2626; stroke-width:1; opacity:.65; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vov-door-leader-flag { stroke:#b45309; stroke-width:1; opacity:.65; stroke-dasharray:4 3; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vov-door-tag-bg { fill:#dc2626; stroke:#991b1b; stroke-width:.75; opacity:.86; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vov-door-tag-bg-flag { fill:#b45309; stroke:#92400e; stroke-width:.75; opacity:.86; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vov-opening { fill:rgba(37,99,235,.04); stroke:#2563eb; stroke-width:2; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vov-opening-low { stroke-dasharray:5 4; }
.vov-opening-garage { fill:rgba(17,24,39,.04); stroke:#111827; }
.vov-leader { stroke:#2563eb; stroke-width:1; opacity:.55; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vov-leader-low { stroke:#b45309; stroke-dasharray:4 3; }
.vov-leader-garage { stroke:#111827; }
.vov-tag-bg { fill:#2563eb; stroke:#1d4ed8; stroke-width:.75; opacity:.84; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vov-tag-bg-low { fill:#b45309; stroke:#92400e; }
.vov-tag-bg-garage { fill:#111827; stroke:#111827; }
.vov-opening-label { fill:#fff; font:800 10px ui-sans-serif, system-ui, sans-serif; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vov-ledger-extracted { stroke:#15803d; fill:#15803d; }
.vov-ledger-review { stroke:#b45309; fill:#b45309; stroke-dasharray:4 3; }
.vov-ledger-missing { stroke:#6b7280; fill:#6b7280; stroke-dasharray:3 3; }
.vov-ledger-conflict { stroke:#b91c1c; fill:#b91c1c; stroke-dasharray:5 3; }
.vov-ledger-ignored { stroke:#64748b; fill:#64748b; opacity:.7; }

.vfoot { margin-top:20px; border-top:2px solid #111827; padding-top:8px; }
.vlegend { display:flex; flex-wrap:wrap; gap:4px 14px; font-size:9px; color:#6b7280; }
.vsign { display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px; margin-top:14px; }
.vsign-line span { font-size:9.5px; text-transform:uppercase; letter-spacing:.05em; color:#6b7280; }
.vsign-line div { border-bottom:1px solid #111827; height:22px; }
.vfoot-note { margin-top:12px; font-size:9px; color:#6b7280; }

@media print {
  .no-print { display:none !important; }
  .vroot { background:#fff; padding:0; }
  .vdoc { box-shadow:none; max-width:none; padding:0; }
  .vbrand-bar { margin:0 0 10px; }
  @page { size:A4; margin:12mm; }
  @page plan-overlay { size:A4 landscape; margin:10mm; }
  .vsec, .vspec-group, .vex-group, table { break-inside:avoid; }
  .vsec-plan { break-before:page; break-inside:auto; page:plan-overlay; min-height:calc(210mm - 20mm); }
  .vsec-plan .vsec-head { break-after:avoid; }
  .vsec-plan .voverlay-wrap { width:100%; max-height:calc(210mm - 41mm); margin:0 auto; }
  .vplan-detail-break { display:block; break-before:page; height:0; }
  .voverlay-wrap { break-inside:avoid; }
  .vsec-head { break-after:avoid; }
}
`;
