import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PageHeader, ConfidencePill } from "@/components/jennian/AppLayout";
import { sampleQuantities, type Quantity } from "@/lib/mock-data";
import { Download, FileSpreadsheet, History } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/review")({ component: ReviewPage });

function ReviewPage() {
  const [rows, setRows] = useState<Quantity[]>(sampleQuantities);
  const [audit, setAudit] = useState<{ qty: string; from: string; to: string; ts: string }[]>([]);

  function update(id: string, value: string) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        const from = String(r.value);
        if (from === value) return r;
        setAudit((a) => [{ qty: r.type, from, to: value, ts: new Date().toLocaleTimeString() }, ...a]);
        return { ...r, value, confidence: "high" };
      }),
    );
  }

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-7xl">
        <PageHeader
          title="Quantity Review"
          subtitle="JM-2451 · Hartley Family Trust · 12 Kahikatea Drive"
          actions={
            <div className="flex gap-2">
              <button className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3.5 py-2 text-sm font-medium hover:bg-accent"><Download className="h-4 w-4" /> Export CSV</button>
              <button className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><FileSpreadsheet className="h-4 w-4" /> Export Excel</button>
            </div>
          }
        />

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Quantity Type</th>
                  <th className="px-5 py-3 font-medium">Unit</th>
                  <th className="px-5 py-3 font-medium">Extracted Value</th>
                  <th className="px-5 py-3 font-medium">Confidence</th>
                  <th className="px-5 py-3 font-medium">Notes</th>
                  <th className="px-5 py-3 font-medium text-right">Override</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-5 py-3 font-medium">{r.type}</td>
                    <td className="px-5 py-3 text-muted-foreground">{r.unit}</td>
                    <td className="px-5 py-3 tabular-nums">{r.value}</td>
                    <td className="px-5 py-3"><ConfidencePill level={r.confidence} /></td>
                    <td className="px-5 py-3 text-muted-foreground text-xs max-w-xs">{r.notes || "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <input
                        defaultValue={String(r.value)}
                        onBlur={(e) => update(r.id, e.target.value)}
                        className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Confidence summary</div>
              <div className="mt-3 space-y-2 text-sm">
                <Row label="High" count={rows.filter(r => r.confidence === "high").length} cls="bg-confidence-high" />
                <Row label="Review" count={rows.filter(r => r.confidence === "mid").length} cls="bg-confidence-mid" />
                <Row label="Low" count={rows.filter(r => r.confidence === "low").length} cls="bg-confidence-low" />
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                <History className="h-3 w-3" /> Audit log
              </div>
              <div className="mt-3 space-y-3 max-h-72 overflow-auto">
                {audit.length === 0 && <div className="text-xs text-muted-foreground">No overrides yet.</div>}
                {audit.map((a, i) => (
                  <div key={i} className="text-xs">
                    <div className="font-medium">{a.qty}</div>
                    <div className="text-muted-foreground">{a.from} → <span className="text-foreground">{a.to}</span> · {a.ts}</div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}

function Row({ label, count, cls }: { label: string; count: number; cls: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${cls}`} /><span>{label}</span></div>
      <span className="tabular-nums font-medium">{count}</span>
    </div>
  );
}
