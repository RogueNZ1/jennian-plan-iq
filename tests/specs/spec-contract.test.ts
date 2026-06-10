// @vitest-environment node
/**
 * SPEC CONTRACT FREEZE — the load-bearing test.
 *
 * Haydon builds QS formulas against 'IQ Import'!B{row} for every spec. That
 * makes id→row→codes PERMANENT: existing rows never move, codes never
 * renumber. Option LABELS are correctable (several came from truncated form
 * text) — the projection deliberately excludes them.
 *
 * To extend the contract (append-only — new specs at new rows):
 *   UPDATE_SPEC_CONTRACT=1 npx vitest run tests/specs/spec-contract.test.ts
 * which regenerates BOTH the golden and docs/SPEC_CONTRACT.md in one motion,
 * so the handover doc can never drift from the code.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import {
  SPECS,
  SPEC_GROUPS,
  SPEC_BLOCK_HEADER_ROW,
  SPEC_CONTRACT_VERSION,
} from "../../src/lib/specs/spec-schema";

const GOLDEN = resolve(__dirname, "spec-contract.golden.json");
const DOC = resolve(__dirname, "../../docs/SPEC_CONTRACT.md");

type ContractProjection = {
  version: number;
  headerRow: number;
  specs: Array<{ id: string; row: number; codes: number[] }>;
};

function projection(): ContractProjection {
  return {
    version: SPEC_CONTRACT_VERSION,
    headerRow: SPEC_BLOCK_HEADER_ROW,
    specs: SPECS.map((s) => ({
      id: s.id,
      row: s.row,
      codes: s.options.map((o) => o.code).sort((a, b) => a - b),
    })),
  };
}

function renderDoc(): string {
  const lines: string[] = [];
  lines.push("# Jennian IQ — Specifications Contract (v" + SPEC_CONTRACT_VERSION + ")");
  lines.push("");
  lines.push("_Generated from `src/lib/specs/spec-schema.ts` — do not edit by hand._");
  lines.push(
    "_Regenerate: `UPDATE_SPEC_CONTRACT=1 npx vitest run tests/specs/spec-contract.test.ts`_",
  );
  lines.push("");
  lines.push("## How the QS reads it");
  lines.push("");
  lines.push("The IQ Import paste lands at `'IQ Import'!A1`. The SPECIFICATIONS block header");
  lines.push(
    "sits at row " +
      SPEC_BLOCK_HEADER_ROW +
      "; every spec owns a fixed row below it, forever (append-only).",
  );
  lines.push("Read the **code from column B at that absolute row** — e.g. heating is");
  lines.push(
    "`='IQ Import'!B" +
      (SPECS.find((s) => s.id === "heating")?.row ?? "—") +
      "`. Column C carries the human-readable selection,",
  );
  lines.push("column D the group.");
  lines.push("");
  lines.push("**Code semantics:** blank = not answered (the export never invents a selection),");
  lines.push("`0` = explicitly N/A, `1+` = a real selection. Codes follow the meeting form's");
  lines.push("printed order, except HEATING which follows Haydon's brief (1 = Fully Ducted,");
  lines.push("2 = High Wall). Option *labels* marked (verify) came from truncated form text —");
  lines.push("labels may be corrected later; **codes and rows are permanent**.");
  lines.push("");
  lines.push("Note: distinct from `specItems` (text values extracted from spec PDFs) — this");
  lines.push("block is the coded client selections made in the app at job load.");
  lines.push("");
  for (const g of SPEC_GROUPS) {
    const specs = SPECS.filter((s) => s.group === g.id);
    if (specs.length === 0) continue;
    lines.push("## " + g.label);
    lines.push("");
    lines.push("| Spec | QS cell | Codes |");
    lines.push("|---|---|---|");
    for (const s of specs) {
      const codes = s.options.map((o) => `**${o.code}** ${o.label}`).join(" · ");
      lines.push(`| ${s.label} (\`${s.id}\`) | \`'IQ Import'!B${s.row}\` | ${codes} |`);
    }
    const notes = specs.filter((s) => s.note);
    if (notes.length > 0) {
      lines.push("");
      for (const s of notes) lines.push(`- _${s.label}: ${s.note}_`);
    }
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

describe("specifications contract", () => {
  it("matches the frozen golden (rows and codes are permanent)", () => {
    const current = projection();
    if (process.env.UPDATE_SPEC_CONTRACT || !existsSync(GOLDEN)) {
      mkdirSync(dirname(GOLDEN), { recursive: true });
      mkdirSync(dirname(DOC), { recursive: true });
      writeFileSync(GOLDEN, JSON.stringify(current, null, 2) + "\n");
      writeFileSync(DOC, renderDoc());
      console.log("[spec-contract] golden + doc (re)generated — commit both deliberately");
      return;
    }
    const golden = JSON.parse(readFileSync(GOLDEN, "utf-8")) as ContractProjection;

    expect(current.version).toBe(golden.version);
    expect(current.headerRow).toBe(golden.headerRow);

    // every frozen spec must still exist with identical row + codes
    const byId = new Map(current.specs.map((s) => [s.id, s]));
    for (const frozen of golden.specs) {
      const live = byId.get(frozen.id);
      expect(live, `spec '${frozen.id}' removed — the contract is append-only`).toBeTruthy();
      expect(
        live!.row,
        `spec '${frozen.id}' moved row ${frozen.row}→${live!.row} — rows are permanent`,
      ).toBe(frozen.row);
      expect(live!.codes, `spec '${frozen.id}' codes changed — codes are permanent`).toEqual(
        frozen.codes,
      );
    }
    // additions allowed only at NEW rows beyond the frozen block
    const frozenRows = new Set(golden.specs.map((s) => s.row));
    const frozenIds = new Set(golden.specs.map((s) => s.id));
    for (const s of current.specs) {
      if (frozenIds.has(s.id)) continue;
      expect(frozenRows.has(s.row), `new spec '${s.id}' reuses frozen row ${s.row}`).toBe(false);
    }
  });

  it("the handover doc carries every spec's QS cell", () => {
    if (process.env.UPDATE_SPEC_CONTRACT || !existsSync(DOC)) return; // generated above
    const doc = readFileSync(DOC, "utf-8");
    for (const s of SPECS) {
      expect(
        doc,
        `docs/SPEC_CONTRACT.md missing 'IQ Import'!B${s.row} for ${s.id} — regenerate`,
      ).toContain(`'IQ Import'!B${s.row}`);
      expect(doc).toContain("`" + s.id + "`");
    }
  });
});
