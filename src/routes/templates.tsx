import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { templates } from "@/lib/mock-data";
import { LayoutTemplate } from "lucide-react";

export const Route = createFileRoute("/templates")({ component: Page });

function Page() {
  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-5xl">
        <PageHeader title="Templates" subtitle="Extraction templates mapped to Jennian's pricing workbook." />
        <div className="grid md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="rounded-lg border border-border bg-card p-5 hover:shadow-sm transition">
              <div className="flex items-center justify-between">
                <div className="h-9 w-9 rounded-md bg-primary/10 grid place-items-center"><LayoutTemplate className="h-4 w-4 text-primary" /></div>
                <span className="text-[11px] font-medium text-muted-foreground">{t.code}</span>
              </div>
              <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{t.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">12 quantity rules · 4 specification ties</p>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
