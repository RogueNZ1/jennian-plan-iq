import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { TEMPLATES, RUSSELL_STREET_QUANTITIES } from "@/lib/jennian-data";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { UploadCloud, FileText, Sparkles, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/upload")({ component: UploadPage });

function UploadPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [jobNumber, setJobNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [address, setAddress] = useState("");
  const [template, setTemplate] = useState(TEMPLATES[0].code + " — " + TEMPLATES[0].name);
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [specFile, setSpecFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<null | "draft" | "extract">(null);

  async function persist(asExtraction: boolean) {
    if (!user) return;
    if (!jobNumber || !clientName || !address) {
      toast.error("Job number, client and address are required.");
      return;
    }
    if (asExtraction && (!planFile || !specFile)) {
      toast.error("Plan and Specification PDFs are required to run extraction.");
      return;
    }
    setBusy(asExtraction ? "extract" : "draft");
    try {
      // 1. Create job
      const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .insert({
          job_number: jobNumber,
          client_name: clientName,
          address,
          template,
          status: "draft",
          created_by: user.id,
        })
        .select()
        .single();
      if (jobErr) throw jobErr;

      // 2. Upload files
      const uploads: Array<{ file: File; type: "plan" | "specification" }> = [];
      if (planFile) uploads.push({ file: planFile, type: "plan" });
      if (specFile) uploads.push({ file: specFile, type: "specification" });

      for (const u of uploads) {
        const path = `${user.id}/${job.id}/${u.type}-${Date.now()}-${u.file.name}`;
        const { error: upErr } = await supabase.storage.from("job-files").upload(path, u.file);
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from("uploaded_files").insert({
          job_id: job.id,
          file_type: u.type,
          file_name: u.file.name,
          storage_url: path,
        });
        if (insErr) throw insErr;
      }

      if (asExtraction) {
        // 3. Insert mock extracted quantities
        const rows = RUSSELL_STREET_QUANTITIES.map((q) => ({ ...q, job_id: job.id }));
        const { error: qErr } = await supabase.from("extracted_quantities").insert(rows);
        if (qErr) throw qErr;

        await supabase
          .from("jobs")
          .update({ status: "extracted", uploaded_at: new Date().toISOString() })
          .eq("id", job.id);

        toast.success("Extraction complete — review quantities.");
        navigate({ to: "/review", search: { job: job.id } });
      } else {
        await supabase
          .from("jobs")
          .update({ uploaded_at: uploads.length ? new Date().toISOString() : null })
          .eq("id", job.id);
        toast.success("Draft saved.");
        navigate({ to: "/jobs" });
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  if (busy === "extract") {
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

        <form onSubmit={(e) => { e.preventDefault(); persist(true); }} className="space-y-8">
          <div className="grid md:grid-cols-2 gap-4">
            <Dropzone label="Plan PDF" sub="Architectural drawings" file={planFile} onFile={setPlanFile} />
            <Dropzone label="Schedule of Materials & Works" sub="Specification PDF" file={specFile} onFile={setSpecFile} />
          </div>

          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <h3 className="text-sm font-semibold tracking-tight">Job details</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Job Number" placeholder="JM-2452" value={jobNumber} onChange={setJobNumber} />
              <Field label="Client Name" placeholder="Full client name" value={clientName} onChange={setClientName} />
              <div className="md:col-span-2">
                <Field label="Address" placeholder="Street, Suburb, City" value={address} onChange={setAddress} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Select Template</label>
                <select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={`${t.code} — ${t.name}`}>{t.code} — {t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => persist(false)}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-60"
            >
              {busy === "draft" ? "Saving…" : "Save Draft"}
            </button>
            <button
              type="submit"
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 shadow-sm disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" /> Run Jennian IQ Extraction
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}

function Field({ label, placeholder, value, onChange }: { label: string; placeholder?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

function Dropzone({ label, sub, file, onFile }: { label: string; sub: string; file: File | null; onFile: (f: File | null) => void }) {
  return (
    <label className={`block rounded-lg border-2 border-dashed bg-card p-8 text-center cursor-pointer transition-colors ${file ? "border-primary/50 bg-accent/30" : "border-border hover:border-primary/40 hover:bg-accent/40"}`}>
      {file ? (
        <CheckCircle2 className="h-7 w-7 text-primary mx-auto" />
      ) : (
        <UploadCloud className="h-7 w-7 text-muted-foreground mx-auto" />
      )}
      <div className="mt-3 text-sm font-medium">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5 truncate">{file ? file.name : sub}</div>
      <div className="mt-4 inline-flex items-center gap-2 text-xs text-primary font-medium">
        <FileText className="h-3.5 w-3.5" /> {file ? "Replace file" : "Choose file or drag & drop"}
      </div>
      <input
        type="file"
        accept="application/pdf"
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}