import * as XLSX from "xlsx";
import type { ExtractedQuantityReadModel } from "./extracted-quantity-read-model";

type ExtractedQuantityEvidenceList = ExtractedQuantityReadModel["rows"][number]["evidence"];

function evidencePages(evidence: ExtractedQuantityEvidenceList): string {
  return evidence
    .map((item) => item.page)
    .filter((page): page is number => page != null)
    .join("; ");
}

function evidenceBboxes(evidence: ExtractedQuantityEvidenceList): string {
  return evidence
    .map((item) => item.bbox?.join(","))
    .filter((bbox): bbox is string => !!bbox)
    .join("; ");
}

function evidenceTexts(evidence: ExtractedQuantityEvidenceList): string {
  return evidence
    .map((item) => item.text)
    .filter((text): text is string => !!text)
    .join("; ");
}

function valueOrNullCell(value: string | number | null | undefined): string | number | null {
  return value ?? null;
}

function areaOrNullCell(value: number | null | undefined): number | null {
  return value == null ? null : Math.round(value * 100) / 100;
}

function cellAddress(row: number, col: number): string {
  let n = col + 1;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return `${letters}${row + 1}`;
}

export function buildExtractedQuantitiesSheet(
  readModel: ExtractedQuantityReadModel | null | undefined,
): XLSX.WorkSheet | null {
  if (!readModel) return null;

  const header = [
    "id",
    "jobId",
    "category",
    "label",
    "count",
    "widthMm",
    "heightMm",
    "lengthMm",
    "areaM2",
    "status",
    "confidence",
    "warnings",
    "source",
    "runId",
    "evidence page",
    "evidence bbox",
    "evidence text",
  ];
  const rows: (string | number | null)[][] = [
    ["Extracted Quantities"],
    ["Active run", readModel.activeRunId ?? readModel.runIds.join(", ")],
    [],
  ];

  const appendSection = (title: string, sectionRows: ExtractedQuantityReadModel["rows"]) => {
    rows.push([title], header);
    for (const row of sectionRows) {
      rows.push([
        row.id,
        row.jobId,
        row.category,
        valueOrNullCell(row.label),
        valueOrNullCell(row.count),
        valueOrNullCell(row.widthMm),
        valueOrNullCell(row.heightMm),
        valueOrNullCell(row.lengthMm),
        areaOrNullCell(row.areaM2),
        row.status,
        row.confidence,
        row.warnings.join("; "),
        row.source,
        valueOrNullCell(row.runId),
        evidencePages(row.evidence),
        evidenceBboxes(row.evidence),
        evidenceTexts(row.evidence),
      ]);
    }
    rows.push([]);
  };

  appendSection("Clean extracted", readModel.groups.extracted);
  appendSection("Needs review", readModel.groups.needs_review);
  appendSection("Missing evidence", readModel.groups.missing_evidence);
  appendSection("Conflict", readModel.groups.conflict);
  appendSection("Ignored", readModel.groups.ignored);

  rows.push(["Clean totals"], ["category", "count", "lengthMm", "areaM2"]);
  for (const [category, total] of Object.entries(readModel.cleanTotalsByCategory)) {
    rows.push([category, total.count, total.lengthMm, areaOrNullCell(total.areaM2)]);
  }
  rows.push([
    "ALL",
    readModel.cleanTotals.count,
    readModel.cleanTotals.lengthMm,
    areaOrNullCell(readModel.cleanTotals.areaM2),
  ]);

  const ws: XLSX.WorkSheet = {};
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const value = rows[r][c];
      if (value == null) continue;
      const address = cellAddress(r, c);
      ws[address] = { v: value, t: typeof value === "number" ? "n" : "s" };
    }
  }
  ws["!ref"] = `A1:Q${rows.length}`;
  ws["!cols"] = [
    { wch: 28 },
    { wch: 28 },
    { wch: 22 },
    { wch: 34 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 16 },
    { wch: 12 },
    { wch: 32 },
    { wch: 20 },
    { wch: 18 },
    { wch: 14 },
    { wch: 24 },
    { wch: 90 },
  ];
  return ws;
}
