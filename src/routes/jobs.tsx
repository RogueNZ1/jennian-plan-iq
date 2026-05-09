import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { jobs } from "@/lib/mock-data";
import { Upload } from "lucide-react";

export const Route = createFileRoute("/jobs")({ component: JobsPage });

function JobsPage() {
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
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-6 py-3 font-medium">Job #</th>
                <th className="px-6 py-3 font-medium">Client</th>
                <th className="px-6 py-3 font-medium">Address</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Confidence</th>
                <th className="px-6 py-3 font-medium">Uploaded</th>
                <th className="px-6 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-6 py-4 font-medium">{j.number}</td>
                  <td className="px-6 py-4">{j.client}</td>
                  <td className="px-6 py-4 text-muted-foreground">{j.address}</td>
                  <td className="px-6 py-4"><span className="text-xs">{j.status}</span></td>
                  <td className="px-6 py-4 tabular-nums">{Math.round(j.confidence * 100)}%</td>
                  <td className="px-6 py-4 text-muted-foreground tabular-nums">{j.uploaded}</td>
                  <td className="px-6 py-4 text-right"><Link to="/review" className="text-primary text-xs font-medium hover:underline">Review →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
