/**
 * TAKEOFF VERIFICATION PRINTOUT — /jobs/$jobId/verification
 *
 * The human twin of the QS export: an A4 print-first document the estimator holds next to
 * the plans. Values come from buildQSExportData (the SAME composer the spreadsheet uses);
 * provenance, confidence and flags come from the persisted enriched takeoff, selected with
 * the SAME run-scan rule the export uses — so paper and sheet can never tell two stories.
 *
 * Acceptance criterion (12 Jun STATE): a verification page ships with EVERY takeoff.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Printer, ArrowLeft, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildQSExportData, type QSExportData } from "@/lib/iq-qs-export";
import type { EnrichedTakeoff } from "@/lib/takeoff/enriched-takeoff";
import {
  buildVerificationModel,
  SOURCE_LEGEND,
  type VerificationModel,
  type MeasureRow,
  type CountRow,
} from "@/lib/verification/verification-model";
import { VerificationPlanOverlay } from "@/components/jennian/VerificationPlanOverlay";

export const Route = createFileRoute("/jobs/$jobId_/verification")({
  component: VerificationPrintout,
});

/* ------------------------------------------------------------------ data */

/**
 * Mirror of loadEnrichedTakeoffJson's run-scan (most recent run carrying a real payload
 * wins), but returns the run's identity too — the header must name the run the data
 * actually came from, not merely the latest row.
 */
async function loadEnrichedWithRun(
  jobId: string,
): Promise<{ enriched: EnrichedTakeoff | null; run: { id: string; started_at: string } | null }> {
  try {
    const res = await supabase
      .from("takeoff_runs")
      .select("*")
      .eq("job_id", jobId)
      .order("started_at", { ascending: false })
      .limit(5);
    for (const row of (res.data ?? []) as Array<Record<string, unknown>>) {
      const tj = row["takeoff_json"];
      if (tj && typeof tj === "object") {
        return {
          enriched: tj as EnrichedTakeoff,
          run: { id: row["id"] as string, started_at: row["started_at"] as string },
        };
      }
    }
    // No payload in the window — fall back to naming the latest run (relational path).
    const first = (res.data ?? [])[0] as Record<string, unknown> | undefined;
    return {
      enriched: null,
      run: first ? { id: first["id"] as string, started_at: first["started_at"] as string } : null,
    };
  } catch {
    return { enriched: null, run: null };
  }
}

/* ------------------------------------------------------------------ atoms */

function SourceChip({ row }: { row: MeasureRow }) {
  if (!row.source) return null;
  return (
    <span className="vchip">
      {row.source}
      {row.confidence ? <span className="vconf">·{row.confidence}</span> : null}
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
              {r.flagged ? <span className="vflag">⚑ </span> : null}
              {r.label}
            </td>
            <td className="vvalue">
              {r.value}
              {r.value !== "—" && r.unit ? ` ${r.unit}` : ""}
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

function Section({
  title,
  children,
  checkbox = true,
}: {
  title: string;
  children: React.ReactNode;
  checkbox?: boolean;
}) {
  return (
    <section className="vsec">
      <div className="vsec-head">
        <h2>{title}</h2>
        {checkbox ? <span className="vcheck">Checked against plan&nbsp;☐</span> : null}
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, er] = await Promise.all([
          buildQSExportData(jobId) as Promise<QSExportData>,
          loadEnrichedWithRun(jobId),
        ]);
        if (cancelled) return;
        setModel(buildVerificationModel(data, er.enriched, er.run));
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

  if (loading) {
    return (
      <div className="p-10 text-sm text-muted-foreground">Building verification document…</div>
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
          ← Back to job
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
        <button type="button" className="vtool-print" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Print / Save as PDF
        </button>
      </div>

      <div className="vdoc">
        {/* header */}
        <header className="vhead">
          <div className="vbrand-bar" />
          <div className="vhead-row">
            <div>
              <div className="vtitle">TAKEOFF VERIFICATION</div>
              <div className="vsub">Jennian IQ · hold this document against the plans</div>
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
              {m.header.runIdShort ?? "—"}
              {m.header.runStartedNzt ? ` · ${m.header.runStartedNzt} NZT` : ""}
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
              <strong>DO NOT USE — printout/export divergence detected.</strong>
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
              <strong>⚑⚑ GEOMETRY LAYER OFFLINE</strong> — vision-only takeoff; deterministic
              measurement and cross-checks did not run. Verify all measurements against the plan
              before pricing.
            </div>
          </div>
        )}

        {/* 1 · key measures */}
        <Section title="1 · Key measures">
          <MeasureTable rows={m.measures} />
        </Section>

        {/* 2 · windows */}
        <Section title="2 · Windows & glazed openings">
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
                        <td>{[r.source, ...r.flags].filter(Boolean).join(" · ")}</td>
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
                        <td className="vvalue">{s.height_m ?? "—"}</td>
                        <td className="vvalue">{s.width_m ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="vtotals">
                <div>
                  <span>
                    {m.windows.totals.qsGlazedOpeningCount != null ? "QS openings" : "Window count"}
                  </span>
                  {m.windows.totals.qsGlazedOpeningCount ?? m.windows.totals.windowCount ?? "—"}
                </div>
                {m.windows.totals.garageDoorCount != null && (
                  <div>
                    <span>Garage doors</span>
                    {m.windows.totals.garageDoorCount}
                  </div>
                )}
                <div>
                  <span>Glazed</span>
                  {m.windows.totals.glazedSqm ?? "—"} m²
                </div>
                <div>
                  <span>Total openings</span>
                  {m.windows.totals.totalOpeningSqm ?? "—"} m²
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

        {/* 3 · doors */}
        <Section title="3 · Doors">
          <div className="vsrcline">
            Interior counts source: <strong>{m.doors.sourceLabel}</strong>
            {m.doors.visionHint != null ? (
              <span className="vhint"> · vision hint: {m.doors.visionHint} (never exported)</span>
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
                    <td className="vsrc" />
                  </tr>
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

        {/* 4 · plan overlay */}
        <Section title="4 · Plan overlay — Visual QS, door hits & window codes">
          <VerificationPlanOverlay
            jobId={jobId}
            markers={m.planOverlay.markers}
            visualOpenings={m.planOverlay.visualOpenings}
            page={m.planOverlay.page}
          />
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
                Visual QS external openings:{" "}
                <strong>{m.planOverlay.visualSummary?.totalOpenings ?? "—"}</strong> total ·{" "}
                <strong>{m.planOverlay.visualSummary?.qsGlazedOpenings ?? "—"}</strong> QS
                glazed/opening items ·{" "}
                <strong>{m.planOverlay.visualSummary?.garageDoors ?? "—"}</strong> garage door
                excluded from glazing ·{" "}
                <strong>{m.planOverlay.visualSummary?.uncertain ?? "—"}</strong> uncertain/low. Blue
                = visual external opening; black = garage door exception.
              </div>
              <table className="vtable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Type</th>
                    <th>Room</th>
                    <th>Size</th>
                    <th>Conf.</th>
                    <th>Evidence / flags</th>
                  </tr>
                </thead>
                <tbody>
                  {m.planOverlay.visualOpenings.map((o) => (
                    <tr key={o.markerLabel}>
                      <td className="vlabel">{o.markerLabel}</td>
                      <td>{o.type}</td>
                      <td>{o.room ?? "—"}</td>
                      <td className="vvalue">
                        {o.height_m != null && o.width_m != null
                          ? `${Math.round(o.height_m * 1000)} × ${Math.round(o.width_m * 1000)}`
                          : (o.label ?? "—")}
                      </td>
                      <td>{o.confidence}</td>
                      <td>{[o.evidence, ...o.flags].filter(Boolean).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {m.planOverlay.markers.length > 0 && (
            <>
              <div className="vsrcline" style={{ marginTop: 8 }}>
                {m.planOverlay.summary.confirmed} confirmed · {m.planOverlay.summary.flagged}{" "}
                flagged &nbsp;(hinged {m.planOverlay.summary.byType.hinged} · double{" "}
                {m.planOverlay.summary.byType.double}
                &nbsp;· cavity {m.planOverlay.summary.byType.cavity}) — solid red = confirmed by the
                deterministic engine; dashed amber = flagged for review (never counted). Green boxes
                are the plan's own printed window codes.
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
                      <td>{d.confidence === "flag" ? "⚑ flag — review" : "confirmed"}</td>
                      <td>{d.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Section>

        {/* 5 · roof / cladding / elevations */}
        <Section title="5 · Roof, cladding & elevations">
          {m.elevationWarning && (
            <div className="vbanner vbanner-compact">
              <strong>⚑ {m.elevationWarning}</strong>
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

        {/* 6 · services & extras */}
        <Section title="6 · Services & extras">
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

        {/* 7 · specifications */}
        <Section title="7 · Specifications (meeting answers)">
          <div className="vspec-grid">
            {m.specs.map((g) => (
              <div key={g.group} className="vspec-group">
                <h3>{g.group}</h3>
                <table className="vtable">
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.label}>
                        <td className="vlabel">{r.label}</td>
                        <td className={r.answer === "— not set" ? "vvalue vunset" : "vvalue"}>
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

        {/* 8 · exceptions */}
        <Section title="8 · Exceptions & review flags" checkbox={false}>
          {m.exceptions.length === 0 ? (
            <p className="vempty">No exceptions raised on this takeoff.</p>
          ) : (
            <div className="vexceptions">
              {m.exceptions.map((g) => (
                <div key={g.field} className="vex-group">
                  <div className="vex-field">⚑ {g.field}</div>
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
            Generated by Jennian IQ · values on this document are produced by the same composer as
            the QS export (source: {m.header.takeoffSource ?? "unknown"}). An unfilled cell beats a
            wrong cell — anything marked ⚑ or “— not set” must be resolved before pricing.
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

.vtable { width:100%; border-collapse:collapse; }
.vtable th { text-align:left; font-size:9.5px; text-transform:uppercase; letter-spacing:.05em; color:#6b7280; border-bottom:1px solid #d1d5db; padding:2px 6px 3px 0; font-weight:600; }
.vtable td { border-bottom:1px solid #f0f0f0; padding:3px 6px 3px 0; vertical-align:top; }
.vlabel { color:#111827; }
.vvalue { font-variant-numeric:tabular-nums; font-weight:600; white-space:nowrap; }
.vsrc { text-align:right; width:64px; }
.vtotal td { border-top:1.5px solid #111827; border-bottom:none; font-weight:700; }
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

.vspec-grid { display:grid; grid-template-columns:1fr 1fr; gap:2px 24px; }
.vspec-group { break-inside:avoid; }

.vexceptions { display:flex; flex-direction:column; gap:7px; }
.vex-group { border-left:3px solid #E71B23; padding-left:8px; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vex-field { font-weight:800; }
.vex-flag { color:#374151; }

.voverlay-wrap { position:relative; border:1px solid #d1d5db; }
.voverlay-wrap img { display:block; width:100%; height:auto; }
.voverlay-wrap svg { position:absolute; inset:0; width:100%; height:100%; }
.vov-door { fill:none; stroke:#dc2626; stroke-width:3; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vov-flag { fill:none; stroke:#b45309; stroke-width:3; stroke-dasharray:6 4; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vov-label { fill:#dc2626; font:700 15px ui-sans-serif, system-ui, sans-serif; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vov-wcode { fill:none; stroke:#16a34a; stroke-width:2.5; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vov-opening { fill:rgba(37,99,235,.10); stroke:#2563eb; stroke-width:3; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.vov-opening-low { stroke-dasharray:7 4; }
.vov-opening-garage { fill:rgba(17,24,39,.10); stroke:#111827; }
.vov-opening-label { fill:#1d4ed8; font:800 15px ui-sans-serif, system-ui, sans-serif; print-color-adjust:exact; -webkit-print-color-adjust:exact; }

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
  .vsec, .vspec-group, .vex-group, table { break-inside:avoid; }
  .voverlay-wrap { break-inside:avoid; }
  .vsec-head { break-after:avoid; }
}
`;
