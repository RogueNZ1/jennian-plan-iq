import { cn } from "@/lib/utils";

/**
 * Premium architectural line-art residential frame.
 * Used in sidebar footer, login and empty states.
 * Style: thin technical drawing, faint grid, single red accent line.
 */
export function HouseFrame({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 280 170"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(className)}
      aria-hidden
    >
      {/* Faint technical grid */}
      <g stroke="currentColor" strokeWidth="0.4" opacity="0.18">
        {Array.from({ length: 14 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 20} y1="0" x2={i * 20} y2="170" />
        ))}
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 20} x2="280" y2={i * 20} />
        ))}
      </g>

      {/* Section markers (drafting cues) */}
      <g stroke="currentColor" strokeWidth="0.5" opacity="0.5">
        <line x1="10" y1="148" x2="20" y2="148" />
        <line x1="260" y1="148" x2="270" y2="148" />
        <line x1="20" y1="156" x2="260" y2="156" strokeDasharray="2 3" />
      </g>

      {/* Foundation / ground */}
      <line x1="14" y1="148" x2="266" y2="148" stroke="currentColor" strokeWidth="0.9" />

      {/* House silhouette — two-storey residential, gable + lean-to */}
      <g stroke="currentColor" strokeWidth="1" opacity="0.92">
        {/* Main mass */}
        <path d="M30 148 V78 L98 36 L166 78 V148" />
        {/* Garage / lean-to wing */}
        <path d="M166 148 V96 L250 96 V148" />
        {/* Lean-to roof */}
        <line x1="166" y1="96" x2="250" y2="80" />
        <line x1="250" y1="80" x2="250" y2="96" />
        {/* Eaves overhang */}
        <line x1="22" y1="82" x2="174" y2="82" strokeWidth="0.7" />
        <line x1="160" y1="100" x2="258" y2="100" strokeWidth="0.7" />
        {/* Ridge */}
        <line x1="98" y1="36" x2="98" y2="78" strokeOpacity="0.5" strokeDasharray="2 2" />
      </g>

      {/* Stud / framing lines */}
      <g stroke="currentColor" strokeWidth="0.55" opacity="0.45">
        <line x1="54" y1="78" x2="54" y2="148" />
        <line x1="78" y1="78" x2="78" y2="148" />
        <line x1="118" y1="78" x2="118" y2="148" />
        <line x1="142" y1="78" x2="142" y2="148" />
        <line x1="190" y1="96" x2="190" y2="148" />
        <line x1="218" y1="96" x2="218" y2="148" />
      </g>

      {/* Window openings */}
      <g stroke="currentColor" strokeWidth="0.9" opacity="0.85">
        <rect x="40" y="100" width="22" height="18" />
        <line x1="51" y1="100" x2="51" y2="118" strokeWidth="0.5" />
        <rect x="124" y="100" width="22" height="18" />
        <line x1="135" y1="100" x2="135" y2="118" strokeWidth="0.5" />
        <rect x="196" y="112" width="46" height="22" />
        <line x1="219" y1="112" x2="219" y2="134" strokeWidth="0.5" />
      </g>

      {/* Front door */}
      <g stroke="currentColor" strokeWidth="0.9" opacity="0.85">
        <path d="M86 148 V120 H106 V148" />
        <line x1="96" y1="148" x2="96" y2="120" strokeWidth="0.4" />
      </g>

      {/* Red accent — pitch dimension line */}
      <g stroke="oklch(0.6 0.22 27)" strokeWidth="0.9" opacity="0.95">
        <line x1="98" y1="36" x2="166" y2="78" />
        <circle cx="98" cy="36" r="1.6" fill="oklch(0.6 0.22 27)" />
        <circle cx="166" cy="78" r="1.4" fill="oklch(0.6 0.22 27)" />
      </g>

      {/* Drafting tick — scale */}
      <g stroke="currentColor" strokeWidth="0.5" opacity="0.4">
        <line x1="14" y1="160" x2="14" y2="164" />
        <line x1="80" y1="160" x2="80" y2="164" />
        <line x1="146" y1="160" x2="146" y2="164" />
        <line x1="212" y1="160" x2="212" y2="164" />
        <line x1="266" y1="160" x2="266" y2="164" />
        <line x1="14" y1="162" x2="266" y2="162" strokeWidth="0.4" />
      </g>
    </svg>
  );
}