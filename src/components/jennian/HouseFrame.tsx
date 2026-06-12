import { cn } from "@/lib/utils";

/**
 * Subtle architectural elevation line-art.
 * Decorative only — thin grey lines, single Jennian-red accent, drafting feel.
 */
export function HouseFrame({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 280 140"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(className)}
      aria-hidden
    >
      {/* faint baseline grid */}
      <g stroke="currentColor" strokeWidth="0.35" opacity="0.12">
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 20} x2="280" y2={i * 20} />
        ))}
      </g>

      {/* ground line */}
      <line
        x1="14"
        y1="118"
        x2="266"
        y2="118"
        stroke="currentColor"
        strokeWidth="0.9"
        opacity="0.85"
      />

      {/* main residential elevation — single storey with gable + lean-to */}
      <g stroke="currentColor" strokeWidth="0.9" opacity="0.85">
        <path d="M40 118 V70 L100 42 L160 70 V118" />
        <path d="M160 118 V82 L240 82 V118" />
        {/* eaves */}
        <line x1="34" y1="74" x2="166" y2="74" strokeWidth="0.5" opacity="0.7" />
        <line x1="156" y1="86" x2="246" y2="86" strokeWidth="0.5" opacity="0.7" />
      </g>

      {/* window + door openings — minimal */}
      <g stroke="currentColor" strokeWidth="0.7" opacity="0.7">
        <rect x="54" y="86" width="22" height="16" />
        <rect x="124" y="86" width="22" height="16" />
        <rect x="186" y="96" width="40" height="18" />
        <path d="M92 118 V96 H106 V118" />
      </g>

      {/* drafting tick marks */}
      <g stroke="currentColor" strokeWidth="0.4" opacity="0.35">
        <line x1="14" y1="124" x2="14" y2="128" />
        <line x1="100" y1="124" x2="100" y2="128" />
        <line x1="200" y1="124" x2="200" y2="128" />
        <line x1="266" y1="124" x2="266" y2="128" />
        <line x1="14" y1="126" x2="266" y2="126" />
      </g>

      {/* single red accent — roof pitch dimension */}
      <g stroke="oklch(0.6 0.22 27)" strokeWidth="0.9" opacity="0.95">
        <line x1="100" y1="42" x2="160" y2="70" />
        <circle cx="100" cy="42" r="1.5" fill="oklch(0.6 0.22 27)" />
        <circle cx="160" cy="70" r="1.3" fill="oklch(0.6 0.22 27)" />
      </g>
    </svg>
  );
}
