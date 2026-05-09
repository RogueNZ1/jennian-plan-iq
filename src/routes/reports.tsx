import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";

export const Route = createFileRoute("/reports")({ component: Page });

function Page() {
  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-6xl">
        <PageHeader title="Reports" subtitle="Extraction trends and review performance." />
        <div className="grid lg:grid-cols-3 gap-4">
          {[
            { label: "Avg. extraction time", value: "1m 42s" },
            { label: "Override rate", value: "6.2%" },
            { label: "Jobs this quarter", value: "47" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card p-5">
              <div className="text-[12px] font-medium text-muted-foreground">{s.label}</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight">{s.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-lg border border-border bg-card p-8">
          <h3 className="text-[15px] font-semibold tracking-tight">Confidence trend (12 weeks)</h3>
          <div className="mt-6 flex items-end gap-2 h-44">
            {[78,82,80,85,88,86,89,91,93,94,95,96].map((v, i) => (
              <div key={i} className="flex-1 rounded-t-sm bg-primary/80 hover:bg-primary transition-colors" style={{ height: `${v}%` }} title={`${v}%`} />
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
