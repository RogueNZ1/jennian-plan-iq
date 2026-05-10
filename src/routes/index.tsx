import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { StatusBadge } from "@/components/jennian/StatusBadge";
import { listJobs, type Job } from "@/lib/jennian-data";
import { Upload, ArrowUpRight, Briefcase, ClipboardCheck, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { HouseFrame } from "@/components/jennian/HouseFrame";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({ component: Dashboard });

function Stat({
  label, value, accent, Icon,
}: { label: string; value: string | number; accent?: boolean; Icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="group rounded-lg border border-border bg-card p-5 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
        <div className={`h-7 w-7 rounded-md grid place-items-center ${accent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <div className={`text-[32px] font-semibold tracking-tight leading-none ${accent ? "text-primary" : ""}`}>{value}</div>
      </div>
    </div>
  );
}

function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listJobs().then((j) => setJobs(j)).finally(() => setLoading(false));
  }, []);

  const total = jobs.length;
  const review = jobs.filter((j) => j.status === "extracted" || j.status === "review_required").length;
  const approved = jobs.filter((j) => j.status === "approved").length;
  const exported = jobs.filter((j) => j.status === "exported").length;
  const recent = jobs.slice(0, 8);

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
          <Stat label="Jobs uploaded" value={total} Icon={Briefcase} />
          <Stat label="Pending review" value={review} Icon={ClipboardCheck} />
          <Stat label="Approved jobs" value={approved} Icon={CheckCircle2} />
          <Stat label="Exported" value={exported} accent Icon={FileSpreadsheet} />
        </div>

        <div className="mt-10 rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">Recent jobs</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Latest plans processed by Jennian IQ.</p>
            </div>
            <Link to="/jobs" className="text-xs font-medium text-primary inline-flex items-center gap-1 hover:underline">View all <ArrowUpRight className="h-3 w-3" /></Link>
          </div>
          {loading ? (
            <div className="p-10 text-sm text-muted-foreground text-center">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="p-12 grid place-items-center text-center">
              <HouseFrame className="w-44 text-muted-foreground/40" />
              <div className="mt-4 text-sm font-medium">No jobs yet</div>
              <p className="mt-1 text-xs text-muted-foreground">
                <Link to="/upload" className="text-primary font-medium hover:underline">Upload your first plan</Link> to begin extraction.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Job #</th>
                  <th className="px-6 py-3 font-medium">Client</th>
                  <th className="px-6 py-3 font-medium">Address</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((j) => (
                  <tr key={j.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium">
                      <Link to="/review" search={{ job: j.id }} className="hover:text-primary">{j.job_number}</Link>
                    </td>
                    <td className="px-6 py-4">{j.client_name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{j.address}</td>
                    <td className="px-6 py-4"><StatusBadge status={j.status} /></td>
                    <td className="px-6 py-4 text-muted-foreground tabular-nums">{new Date(j.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}