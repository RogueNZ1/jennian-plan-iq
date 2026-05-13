import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function OverrideReasonDialog({
  open, label, currentValue, newValue, onCancel, onConfirm,
}: {
  open: boolean;
  label?: string;
  currentValue?: string | number | null;
  newValue?: string | number | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  useEffect(() => { if (open) { setReason(""); setAttempted(false); } }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reason for override</DialogTitle>
          <DialogDescription>
            Recorded against the audit trail for this quantity.
          </DialogDescription>
        </DialogHeader>
        {label && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
            <div className="font-medium">{label}</div>
            {(currentValue !== undefined || newValue !== undefined) && (
              <div className="mt-0.5 text-muted-foreground tabular-nums">
                {String(currentValue ?? "—")} → <span className="text-foreground">{String(newValue ?? "—")}</span>
              </div>
            )}
          </div>
        )}
        <div>
          <textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Plan dimension corrected after site walk."
            rows={3}
            className={`w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
              attempted && !reason.trim() ? "border-destructive focus:ring-destructive/40" : "border-input"
            }`}
          />
          {attempted && !reason.trim() && (
            <p className="mt-1.5 text-xs text-destructive">Please enter a reason before saving.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => {
            setAttempted(true);
            if (!reason.trim()) return;
            onConfirm(reason.trim());
          }}>
            Save override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
