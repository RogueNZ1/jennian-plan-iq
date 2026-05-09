import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { templates } from "@/lib/mock-data";
import { UploadCloud, FileText, Sparkles } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/upload")({ component: UploadPage });

function UploadPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => navigate({ to: "/review" }), 2400);
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-center max-w-md">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 grid place-items-center">
              <Sparkles className="h-6 w-6 text-primary animate-pulse" />
            </div>
            <h2 className="mt-6 text-xl font-semibold tracking-tight">Jennian IQ analysing plans…</h2>
            <p className="mt-2 text-sm text-muted-foreground">Reading dimensions, schedules and material callouts.</p>
            <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full w-1/3 bg-primary animate-[loading_1.4s_ease-in-out_infinite]" />
            </div>
          </div>
        </div>
        <style>{`@keyframes loading { 0%{transform:translateX(-100%)} 100%{transform:translateX(300%)} }`}</style>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-4xl">
        <PageHeader title="Upload Plan" subtitle="Provide the plan set and specification documents to begin extraction." />

        <form onSubmit={run} className="space-y-8">
          <div className="grid md:grid-cols-2 gap-4">
            <Dropzone label="Plan PDF" sub="Architectural drawings" />
            <Dropzone label="Schedule of Materials & Works" sub="Specification PDF" />
          </div>

          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <h3 className="text-sm font-semibold tracking-tight">Job details</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Job Name" placeholder="e.g. Hartley Residence" />
              <Field label="Job Number" placeholder="JM-2452" />
              <Field label="Client Name" placeholder="Full client name" />
              <Field label="Address" placeholder="Street, Suburb, City" />
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Select Template</label>
                <select className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {templates.map(t => <option key={t.id}>{t.code} — {t.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 shadow-sm">
              <Sparkles className="h-4 w-4" /> Run Jennian IQ Extraction
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}

function Field({ label, placeholder }: { label: string; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input placeholder={placeholder} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
    </div>
  );
}

function Dropzone({ label, sub }: { label: string; sub: string }) {
  return (
    <label className="block rounded-lg border-2 border-dashed border-border bg-card hover:border-primary/40 hover:bg-accent/40 transition-colors p-8 text-center cursor-pointer">
      <UploadCloud className="h-7 w-7 text-muted-foreground mx-auto" />
      <div className="mt-3 text-sm font-medium">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
      <div className="mt-4 inline-flex items-center gap-2 text-xs text-primary font-medium">
        <FileText className="h-3.5 w-3.5" /> Choose file or drag & drop
      </div>
      <input type="file" accept="application/pdf" className="sr-only" />
    </label>
  );
}
