import { cn } from "@/lib/utils";
import { STATUS_LABEL, type JobStatus } from "@/lib/jennian-data";

const STYLES: Record<JobStatus, string> = {
  draft: "bg-secondary text-secondary-foreground",
  uploaded: "bg-secondary text-secondary-foreground",
  extracted: "bg-confidence-mid-bg text-confidence-mid",
  review_required: "bg-confidence-low-bg text-confidence-low",
  approved: "bg-confidence-high-bg text-confidence-high",
  exported: "bg-primary/10 text-primary",
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium",
        STYLES[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
