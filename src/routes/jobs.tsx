import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { StatusBadge } from "@/components/jennian/StatusBadge";
import { listJobs, type Job } from "@/lib/jennian-data";
import { Upload } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/jobs")({ component: JobsPage });

function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

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
            <Link to="/upload" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Upload className="h-4 w-4" />Upload New Plan</Link>
          }
        />

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {loading ? (
            <div className="p-10 text-sm text-muted-foreground text-center">Loading…</div>
          ) : jobs.length === 0 ? (
            <div className="p-10 text-sm text-muted-foreground text-center">No jobs yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Job #</th>
                  <th className="px-6 py-3 font-medium">Client</th>
                  <th className="px-6 py-3 font-medium">Address</th>
                  <th className="px-6 py-3 font-medium">Template</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Created</th>
                  <th className="px-6 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-6 py-4 font-medium">{j.job_number}</td>
                    <td className="px-6 py-4">{j.client_name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{j.address}</td>
                    <td className="px-6 py-4 text-muted-foreground">{j.template ?? "—"}</td>
                    <td className="px-6 py-4"><StatusBadge status={j.status} /></td>
                    <td className="px-6 py-4 text-muted-foreground tabular-nums">{new Date(j.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">
                      <Link to="/review" search={{ job: j.id }} className="text-primary text-xs font-medium hover:underline">Review →</Link>
                    </td>
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