import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { StatusBadge } from "@/components/jennian/StatusBadge";
import { PlanThumbnail } from "@/components/jennian/PlanThumbnail";
import { PlanViewer } from "@/components/jennian/PlanViewer";
import { listJobs, type Job } from "@/lib/jennian-data";
import {
  Upload,
  FileSpreadsheet,
  ClipboardCheck,
  Eye,
  AlertTriangle,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRoles } from "@/hooks/use-roles";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/jobs/")({ component: JobsPage });

function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<{ id: string; number: string } | null>(null);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { isOwner } = useRoles();

  useEffect(() => {
    listJobs()
      .then(setJobs)
      .finally(() => setLoading(false));
  }, []);

  const { duplicateIds, duplicateCount } = useMemo(() => {
    const numCount: Record<string, number> = {};
    const caCount: Record<string, number> = {};
    for (const j of jobs) {
      numCount[j.job_number] = (numCount[j.job_number] ?? 0) + 1;
      const ca = `${j.client_name}||${j.address}`;
      caCount[ca] = (caCount[ca] ?? 0) + 1;
    }
    const ids = new Set(
      jobs
        .filter((j) => numCount[j.job_number] > 1 || caCount[`${j.client_name}||${j.address}`] > 1)
        .map((j) => j.id),
    );
    return { duplicateIds: ids, duplicateCount: ids.size };
  }, [jobs]);

  const displayJobs = useMemo(
    () => (showDuplicatesOnly ? jobs.filter((j) => duplicateIds.has(j.id)) : jobs),
    [jobs, showDuplicatesOnly, duplicateIds],
  );

  async function handleDelete(job: Job) {
    setDeleting(true);
    try {
      await Promise.all([
        supabase.from("module_items").delete().eq("job_id", job.id),
        supabase.from("module_runs").delete().eq("job_id", job.id),
        supabase.from("extracted_quantities").delete().eq("job_id", job.id),
        supabase.from("opening_schedule").delete().eq("job_id", job.id),
        supabase.from("plan_measurements").delete().eq("job_id", job.id),
        supabase.from("takeoff_runs").delete().eq("job_id", job.id),
        supabase.from("export_logs").delete().eq("job_id", job.id),
        supabase.from("uploaded_files").delete().eq("job_id", job.id),
        supabase.from("vision_takeoff_pages").delete().eq("job_id", job.id),
      ]);
      const { error } = await supabase.from("jobs").delete().eq("id", job.id);
      if (error) throw error;
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      toast.success(`${job.job_number} deleted`);
    } catch (err) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-7xl">
        <PageHeader
          title="Jobs"
          subtitle="All jobs across the workspace."
          actions={
            <Link
              to="/upload"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 shadow-sm"
            >
              <Upload className="h-4 w-4" />
              Upload New Plan
            </Link>
          }
        />

        {duplicateCount > 0 && (
          <button
            type="button"
            onClick={() => setShowDuplicatesOnly((v) => !v)}
            className="mb-4 w-full flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 hover:bg-amber-500/15 transition-colors text-left"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">
              {duplicateCount} duplicate job{duplicateCount !== 1 ? "s" : ""} detected — review and
              delete
            </span>
            {showDuplicatesOnly ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium">
                Showing duplicates · <X className="h-3 w-3" /> Clear
              </span>
            ) : (
              <span className="text-xs font-medium">Click to filter</span>
            )}
          </button>
        )}

        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          {loading ? (
            <div className="p-10 text-sm text-muted-foreground text-center">Loading…</div>
          ) : displayJobs.length === 0 ? (
            <div className="p-10 text-sm text-muted-foreground text-center">
              {showDuplicatesOnly ? "No duplicates found." : "No jobs yet."}
            </div>
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
                {displayJobs.map((j) => {
                  const isDuplicate = duplicateIds.has(j.id);
                  return (
                    <tr
                      key={j.id}
                      className="border-t border-border hover:bg-muted/25 transition-colors"
                    >
                      <td className="pl-6 py-3">
                        <button
                          type="button"
                          onClick={() => setViewer({ id: j.id, number: j.job_number })}
                          aria-label={`Open plan for ${j.job_number}`}
                          className="block"
                        >
                          <PlanThumbnail
                            storagePath={j.plan_thumbnail_url}
                            size="sm"
                            className="hover:border-primary/40 cursor-pointer transition-colors"
                          />
                        </button>
                      </td>
                      <td className="px-2 py-3 font-medium">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {j.job_number}
                          {isDuplicate && (
                            <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[9.5px] font-medium text-amber-700 dark:text-amber-400 border border-amber-500/30">
                              Duplicate
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">{j.client_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{j.address}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {j.template ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={j.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {new Date(j.created_at).toLocaleDateString()}
                      </td>
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
                            to="/jobs/$jobId"
                            params={{ jobId: j.id }}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] font-medium hover:bg-accent hover:border-primary/30 transition"
                            title="Open Job"
                          >
                            <ClipboardCheck className="h-3 w-3" /> Open Job
                          </Link>
                          <Link
                            to="/review"
                            search={{ job: j.id }}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90"
                            title="Export"
                          >
                            <FileSpreadsheet className="h-3 w-3" /> Export
                          </Link>
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(j)}
                              className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-card px-2 py-1.5 text-[11px] font-medium text-destructive hover:bg-destructive/10 transition"
                              title="Delete Job"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.job_number}</strong> (
              {deleteTarget?.client_name}) and all related quantities, openings, module items, and
              takeoff data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete Job"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
