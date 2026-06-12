import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IQ_MODULES, type IQModuleId } from "@/lib/iq-modules";

/**
 * Modules the user can push a measurement / opening into. IQ Margin and
 * IQ Procurement are Phase 2 — not valid push targets.
 */
const PUSH_TARGETS: IQModuleId[] = [
  "iq-core",
  "iq-cladding",
  "iq-framing",
  "iq-linings",
  "iq-roofing",
  "iq-electrical",
  "iq-plumbing",
];

export type PushSubmit = {
  moduleIds: IQModuleId[];
  label: string;
  unit: string;
  value: number;
  basis: string | null;
  notes: string | null;
};

export function PushToModuleDialog({
  open,
  onOpenChange,
  defaultLabel,
  defaultUnit,
  defaultValue,
  defaultBasis,
  suggestedModules,
  sourceSummary,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultLabel: string;
  defaultUnit: string;
  defaultValue: number;
  defaultBasis?: string | null;
  /** Modules pre-selected when the dialog opens. */
  suggestedModules: IQModuleId[];
  /** Short text shown above the form, e.g. "Internal wall · 4.2 m · page 1". */
  sourceSummary: string;
  onSubmit: (s: PushSubmit) => Promise<void> | void;
}) {
  const [selected, setSelected] = useState<Set<IQModuleId>>(new Set());
  const [label, setLabel] = useState(defaultLabel);
  const [unit, setUnit] = useState(defaultUnit);
  const [value, setValue] = useState(String(defaultValue));
  const [basis, setBasis] = useState(defaultBasis ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set(suggestedModules.filter((m) => PUSH_TARGETS.includes(m))));
      setLabel(defaultLabel);
      setUnit(defaultUnit);
      setValue(String(defaultValue));
      setBasis(defaultBasis ?? "");
      setNotes("");
      setBusy(false);
    }
  }, [open, defaultLabel, defaultUnit, defaultValue, defaultBasis, suggestedModules]);

  const numeric = useMemo(() => Number(value), [value]);
  const canSubmit =
    selected.size > 0 &&
    label.trim().length > 0 &&
    unit.trim().length > 0 &&
    Number.isFinite(numeric) &&
    numeric > 0 &&
    !busy;

  function toggle(id: IQModuleId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit({
        moduleIds: Array.from(selected),
        label: label.trim(),
        unit: unit.trim(),
        value: numeric,
        basis: basis.trim() || null,
        notes: notes.trim() || null,
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Push to module</DialogTitle>
          <DialogDescription>
            Adds this confirmed measurement to one or more module review lists. The pushed item is
            marked Review Required and stamped with the source plan page and measurement ID.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Source · </span>
          <span className="font-medium">{sourceSummary}</span>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">
              Target modules
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {PUSH_TARGETS.map((id) => {
                const m = IQ_MODULES.find((x) => x.id === id);
                if (!m) return null;
                const on = selected.has(id);
                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => toggle(id)}
                    className={`text-left rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors ${
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-accent"
                    }`}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Item label">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
            <Field label="Unit">
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
            <Field label="Quantity">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
            <Field label="Basis / source">
              <input
                value={basis}
                onChange={(e) => setBasis(e.target.value)}
                placeholder="Measured From Plan"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
          </div>

          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy
              ? "Pushing…"
              : `Push to ${selected.size || 0} module${selected.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

export const PUSH_TARGET_MODULES = PUSH_TARGETS;
