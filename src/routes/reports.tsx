import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/reports")({ component: Page });

function Page() {
  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-6xl">
        <PageHeader title="Reports" subtitle="Workspace performance and exports across jobs." />
        <div className="rounded-lg border border-dashed border-border bg-card p-12 grid place-items-center text-center">
          <div className="h-12 w-12 rounded-full bg-muted grid place-items-center">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="mt-4 text-[15px] font-semibold tracking-tight">Coming in Phase 2</div>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">
            Workspace-level reporting — job throughput, review cycle time, override rates and export history —
            will become available once enough live job data has been processed.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
