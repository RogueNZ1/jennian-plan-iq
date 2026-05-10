import { cn } from "@/lib/utils";

/**
 * Architectural floorplan thumbnail (placeholder).
 * Deterministic per-job by `seed` so each job shows a slightly different plan.
 * Future: swap inner SVG for an extracted PDF page snapshot.
 */
export function PlanThumbnail({
  seed = "jmw",
  className,
  size = "sm",
}: {
  seed?: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  // Deterministic small variations from seed
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const v = (n: number) => ((Math.abs(h >> n) % 7) - 3); // -3..3

  const dims = {
    xs: "w-12 h-9",
    sm: "w-16 h-12",
    md: "w-24 h-16",
    lg: "w-40 h-28",
  }[size];

  return (
    <div
      className={cn(
        "relative shrink-0 rounded-md border border-border bg-[oklch(0.985_0.003_260)] overflow-hidden",
        dims,
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 160 100" className="absolute inset-0 w-full h-full text-foreground/45">
        {/* Grid */}
        <g stroke="currentColor" strokeWidth="0.3" opacity="0.18">
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 20} y1="0" x2={i * 20} y2="100" />
          ))}
          {Array.from({ length: 6 }).map((_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 20} x2="160" y2={i * 20} />
          ))}
        </g>
        {/* Outer wall */}
        <rect
          x={10 + v(0)}
          y={14 + v(2)}
          width={140 + v(4)}
          height={72 + v(6)}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        {/* Internal partitions */}
        <line x1={70 + v(1)} y1={14} x2={70 + v(1)} y2={86} stroke="currentColor" strokeWidth="0.8" />
        <line x1={10} y1={50 + v(3)} x2={70 + v(1)} y2={50 + v(3)} stroke="currentColor" strokeWidth="0.8" />
        <line x1={70 + v(1)} y1={56 + v(5)} x2={150} y2={56 + v(5)} stroke="currentColor" strokeWidth="0.8" />
        <line x1={110 + v(2)} y1={56 + v(5)} x2={110 + v(2)} y2={86} stroke="currentColor" strokeWidth="0.8" />
        {/* Door swing */}
        <path
          d={`M${40 + v(4)} 86 a14 14 0 0 1 14 -14`}
          stroke="currentColor"
          strokeWidth="0.6"
          fill="none"
          opacity="0.7"
        />
        {/* Window ticks */}
        <g stroke="currentColor" strokeWidth="0.6" opacity="0.6">
          <line x1={24} y1={14} x2={42} y2={14} />
          <line x1={92} y1={14} x2={120} y2={14} />
          <line x1={150} y1={32} x2={150} y2={48} />
          <line x1={20} y1={86} x2={36} y2={86} />
        </g>
        {/* Red accent — north / orientation marker */}
        <g>
          <circle cx="146" cy="20" r="3.6" fill="none" stroke="oklch(0.6 0.22 27)" strokeWidth="0.8" />
          <line x1="146" y1="16.4" x2="146" y2="23.6" stroke="oklch(0.6 0.22 27)" strokeWidth="0.8" />
        </g>
      </svg>
    </div>
  );
}
