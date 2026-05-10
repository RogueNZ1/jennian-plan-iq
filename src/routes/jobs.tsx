import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { StatusBadge } from "@/components/jennian/StatusBadge";
import { PlanThumbnail } from "@/components/jennian/PlanThumbnail";
import { PlanViewer } from "@/components/jennian/PlanViewer";
import { listJobs, type Job } from "@/lib/jennian-data";
import { Upload, FileSpreadsheet, ClipboardCheck, Eye } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/jobs")({ component: JobsPage });

function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<{ id: string; number: string } | null>(null);

  useEffect(() => {
    listJobs().then(setJobs).finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-7xl">
        <PageHeader
          title="Jobs"
          subtitle="All extraction jobs across the workspace."
          actions={
            <Link to="/upload" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 shadow-sm">
              <Upload className="h-4 w-4" />Upload New Plan
            </Link>
          }
        />

        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          {loading ? (
            <div className="p-10 text-sm text-muted-foreground text-center">Loading…</div>
          ) : jobs.length === 0 ? (
            <div className="p-10 text-sm text-muted-foreground text-center">No jobs yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Plan</th>
                  <th className="px-2 py-3 font-medium">Job #</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Address</th>
                  <th className="px-4 py-3 font-medium">Template</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
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
                    <td className="px-2 py-3 font-medium">{j.job_number}</td>
                    <td className="px-4 py-3">{j.client_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{j.address}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{j.template ?? "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{new Date(j.created_at).toLocaleDateString()}</td>
                    <td className="pr-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setViewer({ id: j.id, number: j.job_number })}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] font-medium hover:bg-accent hover:border-primary/30 transition"
                          title="View Plan"
                        >
                          <Eye className="h-3 w-3" /> Plan
                        </button>
                        <Link
                          to="/review"
                          search={{ job: j.id }}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] font-medium hover:bg-accent hover:border-primary/30 transition"
                          title="Quantity Review"
                        >
                          <ClipboardCheck className="h-3 w-3" /> Review
                        </Link>
                        <Link
                          to="/review"
                          search={{ job: j.id }}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90"
                          title="Export"
                        >
                          <FileSpreadsheet className="h-3 w-3" /> Export
                        </Link>
                      </div>
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
