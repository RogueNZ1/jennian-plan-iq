import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";

export const Route = createFileRoute("/settings")({ component: Page });

function Page() {
  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-3xl">
        <PageHeader title="Settings" subtitle="Workspace and review defaults." />
        <div className="space-y-4">
          {[
            { title: "Workspace", desc: "Jennian Homes Manawatū", actionLabel: "Edit" },
            { title: "Default template", desc: "SS-BW — Single Storey Brick & Weatherboard", actionLabel: "Change" },
            { title: "Confidence thresholds", desc: "High ≥ 90% · Review 70–89% · Low < 70%", actionLabel: "Adjust" },
            { title: "Pricing workbook integration", desc: "Mapped fields synced with proprietary Excel", actionLabel: "Manage" },
          ].map((s) => (
            <div key={s.title} className="rounded-lg border border-border bg-card p-5 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{s.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.desc}</div>
              </div>
              <span className="text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">Phase 2</span>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Editable workspace settings will be enabled in a future release. Reach out to your administrator if a value
          needs to be changed in the meantime.
        </p>
      </div>
    </AppLayout>
  );
}
