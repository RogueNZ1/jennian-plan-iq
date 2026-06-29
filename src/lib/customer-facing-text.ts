export const REVIEW_FLAGS_LABEL = "Review flags";

export const OPENING_RECONCILIATION_BLOCKED = "Opening reconciliation blocked";

export const OPENING_RECONCILIATION_BLOCKED_DETAIL =
  "Floor-plan and elevation opening counts disagree. Use Extracted Quantities Review; do not price openings or cladding from this run.";

export const EXTERNAL_WALL_AREA_BLOCKED =
  "Not calculated - opening reconciliation required";

function c(...codes: number[]): string {
  return String.fromCharCode(...codes);
}

const REPLACEMENTS: Array<[string | RegExp, string]> = [
  [new RegExp(`m(?:${c(0x00c2)})?${c(0x00b2)}`, "g"), "m2"],
  [new RegExp(`${c(0x00c3)}${c(0x0097)}|${c(0x00d7)}`, "g"), "x"],
  [new RegExp(`${c(0x00c2)}?${c(0x00b0)}`, "g"), "deg"],
  [new RegExp(`${c(0x00c2)}?${c(0x00b7)}`, "g"), " / "],
  [new RegExp(`${c(0x2014)}|${c(0x2013)}|${c(0x2212)}`, "g"), "-"],
  [new RegExp(`${c(0x2192)}`, "g"), "->"],
  [new RegExp(`${c(0x2190)}`, "g"), "<-"],
  [new RegExp(`${c(0x2022)}`, "g"), "-"],
  [new RegExp(`${c(0x2026)}`, "g"), "..."],
  [new RegExp(`${c(0x2264)}`, "g"), "<="],
  [new RegExp(`${c(0x2265)}`, "g"), ">="],
  [new RegExp(`${c(0x2691)}|${c(0x26a0)}`, "g"), "Review"],
  [new RegExp(`${c(0x2713)}`, "g"), "OK"],
  [new RegExp(`${c(0x2460)}|${c(0x2461)}|${c(0x2462)}|${c(0x2463)}|${c(0x2464)}`, "g"), ""],
  [new RegExp(`${c(0x201c)}|${c(0x201d)}`, "g"), '"'],
  [new RegExp(`${c(0x2018)}|${c(0x2019)}`, "g"), "'"],
  [new RegExp(`${c(0x00a0)}`, "g"), " "],
  [new RegExp(`${c(0x00e2)}${c(0x20ac)}${c(0x201d)}`, "g"), "-"],
  [new RegExp(`${c(0x00e2)}${c(0x20ac)}${c(0x0022)}`, "g"), "-"],
  [new RegExp(`${c(0x00e2)}${c(0x20ac)}${c(0x2013)}`, "g"), "-"],
  [new RegExp(`${c(0x00e2)}${c(0x20ac)}${c(0x00a6)}`, "g"), "..."],
  [new RegExp(`${c(0x00e2)}${c(0x2020)}${c(0x0090)}`, "g"), "<-"],
  [new RegExp(`${c(0x00e2)}${c(0x0161)}${c(0x2018)}|${c(0x00e2)}${c(0x0161)}${c(0x00a0)}`, "g"), "Review"],
  [new RegExp(`${c(0x00e2)}${c(0x0161)}${c(0x0027)}`, "g"), "Review"],
  [new RegExp(`${c(0x00e2)}${c(0x0153)}${c(0x201c)}`, "g"), "OK"],
  [new RegExp(`${c(0x00e2)}${c(0x02dc)}${c(0x0090)}`, "g"), "[ ]"],
  [new RegExp(`${c(0x00e2)}${c(0x20ac)}${c(0x0153)}|${c(0x00e2)}${c(0x20ac)}${c(0x009d)}`, "g"), '"'],
  [new RegExp(`${c(0x00e2)}${c(0x20ac)}${c(0x02dc)}|${c(0x00e2)}${c(0x20ac)}${c(0x2122)}`, "g"), "'"],
  [new RegExp(`${c(0x00c2)}`, "g"), ""],
];

const MOJIBAKE_GUARD = new RegExp(
  `${c(0x00c3)}|${c(0x00c2)}|${c(0x00e2)}${c(0x20ac)}|m${c(0x00c2)}?${c(0x00b2)}`,
);

export function customerSafeText(value: string): string {
  let text = value;
  for (const [pattern, replacement] of REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+\/\s+/g, " / ").replace(/\s{2,}/g, " ").trim();
}

export function hasCustomerVisibleMojibake(value: string): boolean {
  return MOJIBAKE_GUARD.test(value);
}

function rawCountDetail(raw: string): string | null {
  const match = raw.match(/floor plan:\s*(\d+).*?elevations:\s*(\d+)/i);
  if (!match) return null;
  return `Detail: floor plan ${match[1]}, elevations ${match[2]}.`;
}

export function formatOpeningMismatchWarning(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === "") return null;
  const safe = customerSafeText(raw);
  if (/window mismatch|external opening mismatch|external glazed opening mismatch/i.test(safe)) {
    return [
      OPENING_RECONCILIATION_BLOCKED,
      OPENING_RECONCILIATION_BLOCKED_DETAIL,
      rawCountDetail(safe),
    ]
      .filter((part): part is string => !!part)
      .join(" ");
  }
  return safe;
}

export function openingReconciliationBlockedFlags(details: string[] = []): string[] {
  return [
    OPENING_RECONCILIATION_BLOCKED,
    OPENING_RECONCILIATION_BLOCKED_DETAIL,
    ...details.map(customerSafeText),
  ];
}
