import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout, PageHeader, ConfidencePill } from "@/components/jennian/AppLayout";
import { jobs } from "@/lib/mock-data";
import { Upload, TrendingUp, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/")({ component: Dashboard });

function Stat({ label, value, delta, accent }: { label: string; value: string; delta?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="text-[12px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className={`text-3xl font-semibold tracking-tight ${accent ? "text-primary" : ""}`}>{value}</div>
        {delta && <div className="text-[11px] font-medium text-confidence-high inline-flex items-center gap-0.5"><TrendingUp className="h-3 w-3" />{delta}</div>}
      </div>
    </div>
  );
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    "Approved": "bg-confidence-high-bg text-confidence-high",
    "Pending Review": "bg-confidence-mid-bg text-confidence-mid",
    "Extracting": "bg-secondary text-secondary-foreground",
    "Draft": "bg-secondary text-secondary-foreground",
    "Exported": "bg-accent text-accent-foreground",
  };
  return map[s] ?? "bg-secondary text-secondary-foreground";
}

function Dashboard() {
  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-7xl">
        <PageHeader
          title="Dashboard"
          subtitle="Overview of extraction activity across the Manawatū team."
          actions={
            <Link to="/upload" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 shadow-sm">
              <Upload className="h-4 w-4" /> Upload New Plan
            </Link>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Jobs uploaded" value="148" delta="+12 this month" />
          <Stat label="Pending review" value="9" />
          <Stat label="Approved jobs" value="124" />
          <Stat label="Extraction accuracy" value="96.4%" delta="+0.8%" accent />
        </div>

        <div className="mt-10 rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">Recent jobs</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Latest plans processed by Jennian IQ.</p>
            </div>
            <Link to="/jobs" className="text-xs font-medium text-primary inline-flex items-center gap-1 hover:underline">View all <ArrowUpRight className="h-3 w-3" /></Link>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-6 py-3 font-medium">Job #</th>
                <th className="px-6 py-3 font-medium">Client</th>
                <th className="px-6 py-3 font-medium">Address</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Confidence</th>
                <th className="px-6 py-3 font-medium">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-medium">{j.number}</td>
                  <td className="px-6 py-4">{j.client}</td>
                  <td className="px-6 py-4 text-muted-foreground">{j.address}</td>
                  <td className="px-6 py-4"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusBadge(j.status)}`}>{j.status}</span></td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${j.confidence * 100}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">{Math.round(j.confidence * 100)}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground tabular-nums">{j.uploaded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
