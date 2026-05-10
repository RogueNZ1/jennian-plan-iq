import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, FileWarning, CheckCircle2, XCircle } from "lucide-react";
import type { TakeoffDiagnostics } from "@/lib/takeoff/diagnostics";

/**
 * Owner/Admin-only Takeoff Diagnostics panel.
 * Renders raw transparency for: included/excluded files, per-page text
 * extraction, classification signals, quantity regex hit/miss, and opening
 * extraction candidates. The component is read-only.
 */
export function TakeoffDiagnosticsPanel({ d }: { d: TakeoffDiagnostics }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="px-5 py-3 border-t border-border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Takeoff Diagnostics (Admin)
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          <Overview d={d} />
          <FilesSection d={d} />
          <QuantitiesSection d={d} />
          <OpeningsSection d={d} />
          <PagesSection d={d} />
        </div>
      )}
    </div>
  );
}

function Overview({ d }: { d: TakeoffDiagnostics }) {
  const items: Array<[string, string]> = [
    ["Job ID", d.jobId],
    ["Uploaded files", String(d.uploadedFileCount)],
    ["Files included in takeoff", String(d.includedFileCount)],
    ["Pages scanned", String(d.files.reduce((s, f) => s + f.pageCount, 0))],
    ["Pages with text", String(d.pagesWithText)],
    ["Pages without text", String(d.pagesWithoutText)],
    ["Total chars extracted", String(d.totalCharsExtracted)],
    ["Quantity matches", String(d.quantityChecks.filter((q) => q.found).length)],
    ["Opening matches", String(d.openings.candidates.filter((c) => c.included).length)],
    ["Module rows created", String(d.openings.rowsCreated /* rowsCreated from openings only — module total below */)],
    ["Outcome", d.outcome],
  ];
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="bg-muted/40 px-2.5 py-1.5 text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
        Overview
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 text-[11px]">
        {items.map(([k, v]) => (
          <div key={k} className="px-2.5 py-1.5 border-t border-border min-w-0">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-mono break-all">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="px-2.5 py-1.5 border-t border-border text-[11px] text-muted-foreground">
        {d.outcomeMessage}
      </div>
    </div>
  );
}

function FilesSection({ d }: { d: TakeoffDiagnostics }) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="bg-muted/40 px-2.5 py-1.5 text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
        Files
      </div>
      {d.files.length === 0 ? (
        <div className="px-2.5 py-2 text-[11px] text-muted-foreground">No files.</div>
      ) : (
        <table className="w-full text-[11px]">
          <thead className="text-muted-foreground">
            <tr className="border-t border-border">
              <th className="text-left font-medium px-2.5 py-1.5">File name</th>
              <th className="text-left font-medium px-2.5 py-1.5">Type</th>
              <th className="text-left font-medium px-2.5 py-1.5">Storage</th>
              <th className="text-left font-medium px-2.5 py-1.5">Pages</th>
              <th className="text-left font-medium px-2.5 py-1.5">Included</th>
              <th className="text-left font-medium px-2.5 py-1.5">Reason</th>
            </tr>
          </thead>
          <tbody>
            {d.files.map((f) => (
              <tr key={f.fileId} className="border-t border-border align-top">
                <td className="px-2.5 py-1.5 max-w-[200px] truncate" title={f.fileName}>{f.fileName}</td>
                <td className="px-2.5 py-1.5">{f.fileType}</td>
                <td className="px-2.5 py-1.5">
                  {f.storageStatus === "ok" ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> ok
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-600" title={f.storageError ?? ""}>
                      <FileWarning className="h-3 w-3" /> error
                    </span>
                  )}
                </td>
                <td className="px-2.5 py-1.5 tabular-nums">{f.pageCount}</td>
                <td className="px-2.5 py-1.5">
                  {f.included ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> yes
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <XCircle className="h-3 w-3" /> no
                    </span>
                  )}
                </td>
                <td className="px-2.5 py-1.5 text-muted-foreground">{f.inclusionReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function QuantitiesSection({ d }: { d: TakeoffDiagnostics }) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="bg-muted/40 px-2.5 py-1.5 text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
        Quantity Regex Checks
      </div>
      <table className="w-full text-[11px]">
        <thead className="text-muted-foreground">
          <tr className="border-t border-border">
            <th className="text-left font-medium px-2.5 py-1.5">Quantity</th>
            <th className="text-left font-medium px-2.5 py-1.5">Found</th>
            <th className="text-left font-medium px-2.5 py-1.5">Matched text</th>
            <th className="text-left font-medium px-2.5 py-1.5">Parsed</th>
            <th className="text-left font-medium px-2.5 py-1.5">Source</th>
          </tr>
        </thead>
        <tbody>
          {d.quantityChecks.map((q) => (
            <tr key={q.kind} className="border-t border-border align-top">
              <td className="px-2.5 py-1.5">{q.label}</td>
              <td className="px-2.5 py-1.5">
                {q.found ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="h-3 w-3" /> yes
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <XCircle className="h-3 w-3" /> no
                  </span>
                )}
              </td>
              <td className="px-2.5 py-1.5 max-w-[260px] truncate" title={q.matchedText ?? ""}>
                {q.matchedText ?? "—"}
              </td>
              <td className="px-2.5 py-1.5 tabular-nums">
                {q.parsedValue == null
                  ? "—"
                  : q.parsedSecondary != null
                  ? `${q.parsedValue} × ${q.parsedSecondary} ${q.unit}`
                  : `${q.parsedValue} ${q.unit}`}
              </td>
              <td className="px-2.5 py-1.5 text-muted-foreground">
                {q.fileName ? `${q.fileName} p${q.pageNumber}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OpeningsSection({ d }: { d: TakeoffDiagnostics }) {
  const o = d.openings;
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="bg-muted/40 px-2.5 py-1.5 text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
        Opening Extraction
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 text-[11px]">
        {[
          ["Pairs found", o.pairsFound],
          ["Bare doors found", o.bareDoorsFound],
          ["Ignored", o.ignored],
          ["Duplicates removed", o.duplicatesRemoved],
          ["Rows created", o.rowsCreated],
        ].map(([k, v]) => (
          <div key={k} className="px-2.5 py-1.5 border-t border-border">
            <div className="text-muted-foreground">{k}</div>
            <div className="tabular-nums font-mono">{v}</div>
          </div>
        ))}
      </div>
      {o.candidates.length > 0 && (
        <table className="w-full text-[11px]">
          <thead className="text-muted-foreground">
            <tr className="border-t border-border">
              <th className="text-left font-medium px-2.5 py-1.5">Raw text</th>
              <th className="text-left font-medium px-2.5 py-1.5">W</th>
              <th className="text-left font-medium px-2.5 py-1.5">H</th>
              <th className="text-left font-medium px-2.5 py-1.5">Kind</th>
              <th className="text-left font-medium px-2.5 py-1.5">Conf</th>
              <th className="text-left font-medium px-2.5 py-1.5">Result</th>
              <th className="text-left font-medium px-2.5 py-1.5">Source</th>
            </tr>
          </thead>
          <tbody>
            {o.candidates.map((c, i) => (
              <tr key={`${c.fileName}-${c.pageNumber}-${i}`} className="border-t border-border align-top">
                <td className="px-2.5 py-1.5 max-w-[260px] truncate" title={c.rawText}>{c.rawText}</td>
                <td className="px-2.5 py-1.5 tabular-nums">{c.parsedWidth ?? "—"}</td>
                <td className="px-2.5 py-1.5 tabular-nums">{c.parsedHeight ?? "—"}</td>
                <td className="px-2.5 py-1.5">{c.kindGuess}</td>
                <td className="px-2.5 py-1.5">{c.confidence ?? "—"}</td>
                <td className="px-2.5 py-1.5 text-muted-foreground">
                  {c.included ? "included" : "excluded"} — {c.reason}
                </td>
                <td className="px-2.5 py-1.5 text-muted-foreground">{c.fileName} p{c.pageNumber}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PagesSection({ d }: { d: TakeoffDiagnostics }) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="bg-muted/40 px-2.5 py-1.5 text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
        Per-Page Text & Classification
      </div>
      {d.files.filter((f) => f.included).length === 0 ? (
        <div className="px-2.5 py-2 text-[11px] text-muted-foreground">No included files.</div>
      ) : (
        d.files
          .filter((f) => f.included)
          .map((f) => (
            <div key={f.fileId} className="border-t border-border">
              <div className="px-2.5 py-1.5 text-[11px] font-semibold flex items-center gap-1.5">
                <FileText className="h-3 w-3" /> {f.fileName}
              </div>
              {f.pages.map((p) => (
                <PageRow key={p.pageNumber} fileName={f.fileName} p={p} />
              ))}
            </div>
          ))
      )}
    </div>
  );
}

function PageRow({
  fileName,
  p,
}: {
  fileName: string;
  p: TakeoffDiagnostics["files"][number]["pages"][number];
}) {
  const [show, setShow] = useState(false);
  const noText = p.charCount === 0;
  return (
    <div className="border-t border-border px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="font-mono text-muted-foreground">p{p.pageNumber}</span>
        <span>
          <span className="text-muted-foreground">type:</span>{" "}
          <span className="font-medium">{p.pageType}</span>
        </span>
        <span>
          <span className="text-muted-foreground">conf:</span> {p.confidence}
        </span>
        <span>
          <span className="text-muted-foreground">size:</span> {p.pageSize}
        </span>
        <span>
          <span className="text-muted-foreground">chars:</span>{" "}
          <span className={noText ? "text-amber-600 font-medium" : "tabular-nums"}>{p.charCount}</span>
        </span>
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 text-[11px] hover:underline"
        >
          {show ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          details
        </button>
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{p.reason}</div>
      {show && (
        <div className="mt-2 space-y-2">
          <SignalRow label="Detected room names" values={p.signals.roomNames} />
          <SignalRow label="Detected dimensions" values={p.signals.dimensions} mono />
          <SignalRow
            label="Detected scale text"
            values={p.signals.scaleText ? [p.signals.scaleText] : []}
          />
          <SignalRow label="Area / perimeter words" values={p.signals.areaWords} />
          <SignalRow label="Title words" values={p.signals.titleWords} />
          <SignalRow label="Specification / prose words" values={p.signals.specWords} />
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-1">
              Raw text preview ({p.charCount} chars)
            </div>
            {p.textStatus === "extraction_error" ? (
              <div className="text-[11px] text-amber-700">
                Text extraction failed: {p.textError ?? "unknown error"}
              </div>
            ) : noText ? (
              <div className="text-[11px] text-amber-700">
                No text layer detected on this page.{" "}
                <span className="text-muted-foreground">
                  ({fileName} page {p.pageNumber})
                </span>
              </div>
            ) : (
              <pre className="text-[10.5px] whitespace-pre-wrap break-words bg-muted/30 border border-border rounded-md p-2 max-h-48 overflow-auto">
                {p.textPreview}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SignalRow({ label, values, mono }: { label: string; values: string[]; mono?: boolean }) {
  return (
    <div className="text-[11px]">
      <span className="text-muted-foreground">{label}: </span>
      {values.length === 0 ? (
        <span className="text-muted-foreground/70">none</span>
      ) : (
        <span className={mono ? "font-mono" : ""}>{values.join(", ")}</span>
      )}
    </div>
  );
}