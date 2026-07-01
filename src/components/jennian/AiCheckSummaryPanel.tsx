import type { AiCheckSummary } from "@/lib/ai-check-summary";

export function AiCheckSummaryPanel({ summary }: { summary: AiCheckSummary | null }) {
  if (!summary) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="text-[15px] font-semibold tracking-tight">{summary.title}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {summary.jobNumber}
            {summary.clientName ? ` / ${summary.clientName}` : ""}
            {summary.runIdShort ? ` / run ${summary.runIdShort}` : ""}
          </div>
        </div>
        <div
          className={
            summary.status === "review_required"
              ? "rounded-md border border-confidence-mid/35 bg-confidence-mid/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-confidence-mid"
              : "rounded-md border border-confidence-high/35 bg-confidence-high/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-confidence-high"
          }
        >
          {summary.statusLabel}
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Safe to use
          </div>
          <div className="mt-2 space-y-2 text-[13px]">
            {summary.safeToUse.map((item) => (
              <div key={item.label} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium tabular-nums text-foreground">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Blocked
          </div>
          <div className="mt-2 space-y-2 text-[13px]">
            {summary.blocked.length === 0 ? (
              <div className="text-muted-foreground">No blocked scopes in the active summary.</div>
            ) : (
              summary.blocked.map((item) => (
                <div key={item.label} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-right font-medium text-foreground">{item.value}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-[12.5px] text-muted-foreground">
        <div>
          <span className="font-medium text-foreground">Vision check:</span> {summary.vision.line}
        </div>
        <div>
          <span className="font-medium text-foreground">Garage:</span> {summary.garage.line}
        </div>
        <div>
          <span className="font-medium text-foreground">Next action:</span> {summary.nextAction}
        </div>
        {summary.mustNotPrice.length > 0 && (
          <div>
            <span className="font-medium text-foreground">Do not price:</span>{" "}
            {summary.mustNotPrice.join(", ")} from this run until reconciliation is resolved.
          </div>
        )}
      </div>
    </div>
  );
}
