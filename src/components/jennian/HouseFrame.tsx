import { cn } from "@/lib/utils";

/** Subtle architectural line-art used across sidebar footer, login, empty states. */
export function HouseFrame({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 140"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("opacity-70", className)}
      aria-hidden
    >
      {/* Ground line */}
      <line x1="8" y1="128" x2="232" y2="128" />
      {/* Outer frame */}
      <path d="M28 128 V62 L120 18 L212 62 V128" />
      {/* Roof beams */}
      <line x1="28" y1="62" x2="212" y2="62" />
      <line x1="120" y1="18" x2="120" y2="62" />
      {/* Wall studs */}
      <line x1="60" y1="62" x2="60" y2="128" />
      <line x1="92" y1="62" x2="92" y2="128" />
      <line x1="148" y1="62" x2="148" y2="128" />
      <line x1="180" y1="62" x2="180" y2="128" />
      {/* Door */}
      <path d="M108 128 V94 H132 V128" />
      {/* Window */}
      <rect x="40" y="78" width="14" height="14" />
      <rect x="186" y="78" width="14" height="14" />
      {/* Roof pitch indicator */}
      <path d="M48 62 L120 28 L192 62" strokeOpacity="0.5" />
    </svg>
  );
}