/**
 * SpecificationsPanel — the meeting-spec picker.
 *
 * Tap-through coded selections captured when a job is loaded. Selections
 * persist to jobs.specifications and surface as the fixed-row
 * SPECIFICATIONS block on the IQ Import paste sheet (see spec-schema.ts
 * for the contract). Doctrine: nothing defaults silently — "All standard"
 * is an explicit, visible action; unanswered specs export as blank.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  SPECS,
  SPEC_GROUPS,
  type SpecAnswers,
  type SpecDef,
  answeredCount,
  autoNaTargets,
  specsInGroup,
} from "@/lib/specs/spec-schema";
import { loadJobSpecifications, saveJobSpecifications } from "@/lib/specs/spec-store";

function OptionButton({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors " +
        (selected
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/5")
      }
    >
      {label}
    </button>
  );
}

function SpecRow({
  spec,
  value,
  onSelect,
}: {
  spec: SpecDef;
  value: number | undefined;
  onSelect: (code: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border/60 last:border-b-0">
      <div className="text-[12.5px] min-w-[180px]">
        {spec.label}
        {value == null && (
          <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600">not set</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {spec.options.map((o) => (
          <OptionButton
            key={o.code}
            selected={value === o.code}
            label={o.label}
            onClick={() => onSelect(o.code)}
          />
        ))}
      </div>
    </div>
  );
}

export function SpecificationsPanel({ jobId }: { jobId: string }) {
  const [answers, setAnswers] = useState<SpecAnswers>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [notProvisioned, setNotProvisioned] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<SpecAnswers>({});

  useEffect(() => {
    let cancelled = false;
    loadJobSpecifications(jobId)
      .then((s) => {
        if (cancelled) return;
        setAnswers(s.answers);
        latest.current = s.answers;
        const { answered, total } = answeredCount(s.answers);
        setCollapsed(answered === total && total > 0);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (/does not exist|42703/i.test(msg)) setNotProvisioned(true);
        else toast.error("Couldn't load specifications");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  function queueSave(next: SpecAnswers) {
    latest.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await saveJobSpecifications(jobId, latest.current);
      } catch {
        toast.error("Specification save failed — selections not persisted");
      } finally {
        setSaving(false);
      }
    }, 600);
  }

  function select(spec: SpecDef, code: number) {
    setAnswers((prev) => {
      const next = { ...prev, [spec.id]: code };
      // Branching: answers can make dependent specs N/A (visible, overridable).
      for (const id of autoNaTargets(next)) next[id] = 0;
      queueSave(next);
      return next;
    });
  }

  function confirmGroupStandard(groupId: (typeof SPEC_GROUPS)[number]["id"]) {
    setAnswers((prev) => {
      const next = { ...prev };
      for (const s of specsInGroup(groupId)) {
        if (next[s.id] != null) continue; // never overwrite a made choice
        const std = s.options.find((o) => o.code === 1);
        if (std) next[s.id] = 1;
      }
      for (const id of autoNaTargets(next)) next[id] = 0;
      queueSave(next);
      return next;
    });
  }

  const progress = useMemo(() => answeredCount(answers), [answers]);
  const complete = progress.answered === progress.total;

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card px-5 py-4 flex items-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading specifications…
      </div>
    );
  }

  if (notProvisioned) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-[12px] text-amber-900">
        <div className="font-semibold mb-1">Client Specifications — storage not provisioned</div>
        Run this once in the Supabase SQL editor, then reload:
        <code className="block mt-1.5 rounded bg-amber-100 px-2 py-1 text-[11px]">
          alter table jobs add column if not exists specifications jsonb;
        </code>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full px-5 py-4 border-b border-border flex items-start gap-3 text-left"
      >
        <div className="h-9 w-9 rounded-md bg-primary/10 grid place-items-center flex-shrink-0">
          <ClipboardList className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-semibold tracking-tight flex items-center gap-2">
            Client Specifications
            {complete && <CheckCircle2 className="h-4 w-4 text-green-600" />}
            {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            {progress.answered} of {progress.total} confirmed · coded selections feed the IQ Import
            sheet — unanswered specs export blank, never assumed
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground mt-1">
          {collapsed ? "Expand" : "Collapse"}
        </span>
      </button>

      {!collapsed && (
        <div className="px-5 py-3 space-y-4">
          {SPEC_GROUPS.map((g) => {
            const specs = specsInGroup(g.id);
            if (specs.length === 0) return null;
            const unanswered = specs.filter((s) => answers[s.id] == null).length;
            const hasStd = specs.some(
              (s) => answers[s.id] == null && s.options.some((o) => o.code === 1),
            );
            return (
              <div key={g.id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.label}
                    {unanswered > 0 && (
                      <span className="ml-2 normal-case font-normal text-amber-600">
                        {unanswered} not set
                      </span>
                    )}
                  </div>
                  {hasStd && (
                    <button
                      type="button"
                      onClick={() => confirmGroupStandard(g.id)}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Confirm rest as standard
                    </button>
                  )}
                </div>
                <div>
                  {specs.map((s) => (
                    <SpecRow
                      key={s.id}
                      spec={s}
                      value={answers[s.id]}
                      onSelect={(c) => select(s, c)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          <div className="text-[11px] text-muted-foreground pb-1">
            {SPECS.length} specifications · contract v1 · rows 101–{100 + SPECS.length} on the IQ
            Import sheet
          </div>
        </div>
      )}
    </div>
  );
}
