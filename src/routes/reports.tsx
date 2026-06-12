import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, FileSpreadsheet, CheckCircle2, Activity } from "lucide-react";

export const Route = createFileRoute("/reports")({ component: Page });

type StatusCount = { status: string; count: number };
type MonthCount = { month: string; count: number };

function Page() {
  const [statusCounts, setStatusCounts] = useState<StatusCount[]>([]);
  const [monthCounts, setMonthCounts] = useState<MonthCount[]>([]);
  const [avgConfidence, setAvgConfidence] = useState(0);
  const [exportsThisMonth, setExportsThisMonth] = useState(0);
  const [totalJobs, setTotalJobs] = useState(0);
  const [approvedJobs, setApprovedJobs] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: jobs }, { data: runs }, { count: exportCount }] = await Promise.all([
        supabase.from("jobs").select("id, status, created_at"),
        supabase.from("module_runs").select("confidence_avg").not("confidence_avg", "is", null),
        supabase
          .from("export_logs")
          .select("id", { count: "exact", head: true })
          .gte(
            "created_at",
            new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
          ),
      ]);

      if (jobs) {
        setTotalJobs(jobs.length);
        setApprovedJobs(jobs.filter((j) => j.status === "approved").length);

        const statusMap: Record<string, number> = {};
        for (const j of jobs) {
          statusMap[j.status] = (statusMap[j.status] ?? 0) + 1;
        }
        setStatusCounts(
          Object.entries(statusMap).map(([s, count]) => ({ status: prettyStatus(s), count })),
        );

        const now = new Date();
        const monthMap: Record<string, number> = {};
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = d.toLocaleDateString("en-NZ", { month: "short", year: "2-digit" });
          monthMap[key] = 0;
        }
        for (const j of jobs) {
          const key = new Date(j.created_at).toLocaleDateString("en-NZ", {
            month: "short",
            year: "2-digit",
          });
          if (key in monthMap) monthMap[key]++;
        }
        setMonthCounts(Object.entries(monthMap).map(([month, count]) => ({ month, count })));
      }

      if (runs && runs.length > 0) {
        const sum = runs.reduce((s, r) => s + (r.confidence_avg ?? 0), 0);
        setAvgConfidence(Math.round(sum / runs.length));
      }

      setExportsThisMonth(exportCount ?? 0);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <AppLayout>
        <div className="px-8 py-8 max-w-6xl">
          <PageHeader title="Reports" subtitle="Workspace performance and exports across jobs." />
          <div className="p-10 text-center text-sm text-muted-foreground">Loading reports…</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-6xl">
        <PageHeader title="Reports" subtitle="Workspace performance and exports across jobs." />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Jobs" value={totalJobs} Icon={Activity} />
          <StatCard label="Avg Confidence" value={`${avgConfidence}%`} Icon={TrendingUp} />
          <StatCard label="Exports This Month" value={exportsThisMonth} Icon={FileSpreadsheet} />
          <StatCard label="Approved" value={approvedJobs} Icon={CheckCircle2} />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-[13px] font-semibold tracking-tight mb-4">Jobs by Status</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusCounts} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="count" name="Jobs" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-[13px] font-semibold tracking-tight mb-4">
              Jobs Uploaded — Last 6 Months
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthCounts} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="count" name="Jobs" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function prettyStatus(s: string) {
  const map: Record<string, string> = {
    uploaded: "Uploaded",
    processing: "Processing",
    extracted: "Extracted",
    review_required: "Review",
    approved: "Approved",
    exported: "Exported",
  };
  return map[s] ?? s;
}

function StatCard({
  label,
  value,
  Icon,
}: {
  label: string;
  value: string | number;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </div>
        <div className="h-8 w-8 rounded-md bg-muted grid place-items-center text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-5 text-[34px] font-semibold tracking-tight leading-none tabular-nums">
        {value}
      </div>
    </div>
  );
}
