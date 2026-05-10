import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Wand2, ScanEye, Ruler } from "lucide-react";

export function StartTakeoffDialog({
  open, onOpenChange, onAutomatic, onVision, onWorkingPlan,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAutomatic: () => void;
  onVision: () => void;
  onWorkingPlan: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose Takeoff Method</DialogTitle>
          <DialogDescription>
            Pick how Jennian IQ should prepare the first draft quantities.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <button
            type="button"
            onClick={onAutomatic}
            className="w-full text-left rounded-md border border-border bg-card hover:bg-accent transition-colors p-4"
          >
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              <div className="text-[13px] font-semibold tracking-tight">Automatic Takeoff</div>
            </div>
            <div className="mt-1 text-[11.5px] text-muted-foreground">
              For readable plan/specification text.
            </div>
          </button>
          <button
            type="button"
            onClick={onVision}
            className="w-full text-left rounded-md border border-border bg-card hover:bg-accent transition-colors p-4"
          >
            <div className="flex items-center gap-2">
              <ScanEye className="h-4 w-4 text-primary" />
              <div className="text-[13px] font-semibold tracking-tight">Vision Takeoff</div>
            </div>
            <div className="mt-1 text-[11.5px] text-muted-foreground">
              For flattened plan drawings.
            </div>
          </button>
          <button
            type="button"
            onClick={onWorkingPlan}
            className="w-full text-left rounded-md border border-border bg-card hover:bg-accent transition-colors p-4"
          >
            <div className="flex items-center gap-2">
              <Ruler className="h-4 w-4 text-primary" />
              <div className="text-[13px] font-semibold tracking-tight">Manual Working Plan</div>
            </div>
            <div className="mt-1 text-[11.5px] text-muted-foreground">
              Measure quantities yourself from the plan.
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}