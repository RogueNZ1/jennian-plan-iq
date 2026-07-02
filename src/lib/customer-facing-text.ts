export const REVIEW_FLAGS_LABEL = "Review flags";

export const OPENING_RECONCILIATION_BLOCKED = "Opening reconciliation blocked";

export const OPENING_RECONCILIATION_BLOCKED_DETAIL =
  "Floor-plan and elevation opening counts disagree. Use Extracted Quantities Review; do not price openings or cladding from this run.";

export const EXTERNAL_WALL_AREA_BLOCKED =
  "Not calculated - opening reconciliation required";

export const GEOMETRY_STATUS_UNAVAILABLE = "unavailable";
export const GEOMETRY_STATUS_MEASUREMENT_SERVICE_UNREACHABLE =
  "measurement_service_unreachable";
export const GEOMETRY_STATUS_FILE_COULD_NOT_BE_MEASURED = "file_could_not_be_measured";

export type CustomerGeometryStatus =
  | typeof GEOMETRY_STATUS_UNAVAILABLE
  | typeof GEOMETRY_STATUS_MEASUREMENT_SERVICE_UNREACHABLE
  | typeof GEOMETRY_STATUS_FILE_COULD_NOT_BE_MEASURED
  | string
  | null
  | undefined;

export function isGeometryUnavailableStatus(status: CustomerGeometryStatus): boolean {
  return (
    status === GEOMETRY_STATUS_UNAVAILABLE ||
    status === GEOMETRY_STATUS_MEASUREMENT_SERVICE_UNREACHABLE ||
    status === GEOMETRY_STATUS_FILE_COULD_NOT_BE_MEASURED
  );
}

export function geometryStatusReviewMessage(status: CustomerGeometryStatus): string {
  if (status === GEOMETRY_STATUS_MEASUREMENT_SERVICE_UNREACHABLE) {
    return "Measurement service unreachable - automatic plan measurement did not run because Jennian IQ could not reach the measurement service. Next step: retry the takeoff later, or ask the office/admin to check the measurement service before using measured quantities.";
  }
  if (status === GEOMETRY_STATUS_FILE_COULD_NOT_BE_MEASURED) {
    return "This file could not be measured - Jennian IQ reached the measurement service, but this PDF could not be measured automatically (file size, pages, or no vector content). Next step: upload a clean vector PDF/working drawing, or have the plan measured manually before pricing.";
  }
  return "Geometry layer unavailable - automatic plan measurement and cross-checks did not run. Next step: retry the takeoff later; if it fails again, ask the office/admin to check the measurement service and verify measurements manually before pricing.";
}

export function geometryStatusReviewLine(status: CustomerGeometryStatus): string {
  return `Review ${geometryStatusReviewMessage(status)}`;
}

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
  `${c(0x00c3)}|${c(0x00c2)}|${c(0x00e2)}|m${c(0x00c2)}?${c(0x00b2)}`,
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

function openingReviewCountDetail(raw: string): string | null {
  const match = raw.match(
    /found\s*(\d+)\s*QS-glazed external openings.*?composed opening set has\s*(\d+)/i,
  );
  if (!match) return null;
  return `Detail: review found ${match[1]} QS-glazed external openings; composed opening set has ${match[2]}.`;
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

export function customerReviewFlagText(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === "") return null;
  const safe = customerSafeText(raw);
  if (
    /^Opening pricing blocked:/i.test(safe) ||
    /AI opening check/i.test(safe) ||
    /Visual QS reconciliation error/i.test(safe)
  ) {
    return [
      OPENING_RECONCILIATION_BLOCKED,
      OPENING_RECONCILIATION_BLOCKED_DETAIL,
      openingReviewCountDetail(safe),
    ]
      .filter((part): part is string => !!part)
      .join(" ");
  }
  return safe;
}

export function openingReconciliationBlockedFlags(details: string[] = []): string[] {
  const normalizedDetails = details
    .map(customerReviewFlagText)
    .filter((detail): detail is string => !!detail)
    .map((detail) =>
      detail
        .replace(OPENING_RECONCILIATION_BLOCKED, "")
        .replace(OPENING_RECONCILIATION_BLOCKED_DETAIL, "")
        .trim(),
    )
    .filter((detail) => detail !== "");
  return [
    OPENING_RECONCILIATION_BLOCKED,
    OPENING_RECONCILIATION_BLOCKED_DETAIL,
    ...normalizedDetails,
  ];
}

export function customerOpeningEvidenceNoteText(raw: string | null | undefined): string {
  if (!raw || raw.trim() === "") return "-";
  const seen = new Set<string>();
  const parts = raw
    .split("|")
    .map((part) => customerSafeText(part))
    .map((part) => {
      if (part.trim() === "") return null;
      if (/^REVIEW ONLY\s*-\s*opening pricing blocked/i.test(part)) {
        return null;
      }
      if (
        /^Opening pricing blocked:/i.test(part) ||
        /AI opening check/i.test(part) ||
        /Visual QS reconciliation error/i.test(part)
      ) {
        return null;
      }
      if (/^Conflicts:\s*visual_reconciliation_error/i.test(part)) {
        return "Conflict: opening reconciliation.";
      }
      return part;
    })
    .filter((part): part is string => !!part)
    .filter((part) => {
      if (seen.has(part)) return false;
      seen.add(part);
      return true;
    });
  return parts.length > 0 ? parts.join(" | ") : "-";
}
