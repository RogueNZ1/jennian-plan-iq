import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { StatusBadge } from "@/components/jennian/StatusBadge";
import { PlanThumbnail } from "@/components/jennian/PlanThumbnail";
import { PlanViewer } from "@/components/jennian/PlanViewer";
import { listJobs, type Job } from "@/lib/jennian-data";
import { Upload, ArrowUpRight, Briefcase, ClipboardCheck, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { HouseFrame } from "@/components/jennian/HouseFrame";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({ component: Dashboard });

function Stat({
  label, value, hint, accent, Icon,
}: {
  label: string; value: string | number; hint?: string;
  accent?: boolean;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="group relative rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      {accent && <span className="absolute left-0 top-4 bottom-4 w-[2px] rounded-r bg-primary/80" />}
      <div className="flex items-start justify-between">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
        <div className={`h-8 w-8 rounded-md grid place-items-center ${accent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-5 flex items-baseline gap-2">
        <div className={`text-[34px] font-semibold tracking-tight leading-none tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>
      </div>
      {hint && <div className="mt-2 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<{ id: string; number: string } | null>(null);

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
          title="Project Overview"
          subtitle="Current activity across Jennian Homes Manawatū projects."
          actions={
            <Link to="/upload" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 shadow-sm">
              <Upload className="h-4 w-4" /> Upload New Plan
            </Link>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Jobs uploaded"  value={total}    hint="Total uploaded"  Icon={Briefcase} />
          <Stat label="Pending review" value={review}   hint="Awaiting review" Icon={ClipboardCheck} />
          <Stat label="Approved jobs"  value={approved} hint="Approved"        Icon={CheckCircle2} />
          <Stat label="Exported"       value={exported} hint="Ready for use"         Icon={FileSpreadsheet} />
        </div>

        <div className="mt-10 rounded-xl border border-border bg-card overflow-hidden shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">Recent jobs</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Latest plans reviewed in Jennian IQ.</p>
            </div>
            <Link to="/jobs" className="text-xs font-medium text-primary inline-flex items-center gap-1 hover:underline">View all <ArrowUpRight className="h-3 w-3" /></Link>
          </div>
          {loading ? (
            <div className="p-10 text-sm text-muted-foreground text-center">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="p-12 grid place-items-center text-center">
              <HouseFrame className="w-56 text-muted-foreground/40" />
              <div className="mt-4 text-sm font-medium">No jobs yet</div>
              <p className="mt-1 text-xs text-muted-foreground">
                <Link to="/upload" className="text-primary font-medium hover:underline">Upload your first plan</Link> to begin a review.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Plan</th>
                  <th className="px-2 py-3 font-medium">Job #</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Address</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Uploaded</th>
                  <th className="px-6 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((j) => (
                  <tr key={j.id} className="border-t border-border hover:bg-muted/25 transition-colors">
                    <td className="pl-6 py-3">
                      <button
                        type="button"
                        onClick={() => setViewer({ id: j.id, number: j.job_number })}
                        aria-label={`Open plan for ${j.job_number}`}
                        className="block"
                      >
                        <PlanThumbnail storagePath={j.plan_thumbnail_url} size="sm" className="hover:border-primary/40 cursor-pointer transition-colors" />
                      </button>
                    </td>
                    <td className="px-2 py-3 font-medium">
                      <Link to="/review" search={{ job: j.id }} className="hover:text-primary">{j.job_number}</Link>
                    </td>
                    <td className="px-4 py-3">{j.client_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{j.address}</td>
                    <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{new Date(j.created_at).toLocaleDateString()}</td>
                    <td className="pr-6 py-3 text-right">
                      <Link to="/review" search={{ job: j.id }} className="text-primary text-xs font-medium hover:underline">Review →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <PlanViewer
        open={!!viewer}
        jobId={viewer?.id ?? null}
        jobNumber={viewer?.number}
        onClose={() => setViewer(null)}
      />
    </AppLayout>
  );
}
