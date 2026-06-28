import { describe, it, expect } from "vitest";
import {
  adapterToUser,
  buildDoorMarkers,
  buildLedgerPlanOverlayModel,
  buildVisualOpeningMarkers,
  findOpeningTextAnchor,
  isWindowCode,
  summariseMarkers,
} from "../verification/plan-overlay";
import { buildExtractedQuantityReadModel } from "../takeoff/extracted-quantity-read-model";
import type { ExtractedQuantity } from "../takeoff/extracted-quantity-ledger";

/** The pdf-adapter's forward transform, reproduced verbatim for the inverse proof. */
function toPage(ux: number, uy: number, view: number[]): [number, number] {
  const [x0, y0, , y1] = view;
  const height = y1 - y0;
  return [ux - x0, height - (uy - y0)];
}

const RUN_ID = "4ba50d23-5764-41e4-bda5-0fdace588a6c";

function quantity(overrides: Partial<ExtractedQuantity> = {}): ExtractedQuantity {
  return {
    id: "ledger-row",
    jobId: "job-1",
    runId: RUN_ID,
    category: "window",
    label: "Window row",
    count: 1,
    widthMm: 1200,
    heightMm: 1000,
    lengthMm: null,
    areaM2: 1.2,
    source: "visual_detection",
    evidence: [{ page: 1, bbox: [10, 20, 30, 40], text: "W01 1200x1000" }],
    status: "extracted",
    confidence: 95,
    warnings: [],
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
    ...overrides,
  };
}

describe("plan-overlay", () => {
  it("adapterToUser is the exact inverse of the adapter's toPage (zero-origin view)", () => {
    const view = [0, 0, 841.9, 595.3]; // A1 landscape-ish points
    for (const [ux, uy] of [
      [0, 0],
      [100, 50],
      [841.9, 595.3],
      [607, 387],
    ]) {
      const [px, py] = toPage(ux, uy, view);
      const back = adapterToUser(px, py, view);
      expect(back.ux).toBeCloseTo(ux, 9);
      expect(back.uy).toBeCloseTo(uy, 9);
    }
  });

  it("adapterToUser survives a non-zero view origin (cropped media box)", () => {
    const view = [12, 34, 853.9, 629.3];
    const [px, py] = toPage(200, 300, view);
    const back = adapterToUser(px, py, view);
    expect(back.ux).toBeCloseTo(200, 9);
    expect(back.uy).toBeCloseTo(300, 9);
  });

  it("buildDoorMarkers numbers in reading order: top→bottom, then left→right within a row", () => {
    const markers = buildDoorMarkers([
      { type: "hinged", widthMm: 810, x: 500, y: 400, confidence: "confirmed" },
      { type: "hinged", widthMm: 710, x: 100, y: 100, confidence: "confirmed" },
      { type: "double", widthMm: 1620, x: 90, y: 405, confidence: "confirmed" }, // same row as first (within tolerance)
      { type: "cavity", widthMm: 760, x: 300, y: 100, confidence: "flag", note: "ambiguous arc" },
    ]);
    expect(markers.map((m) => m.label)).toEqual(["D1", "D2", "D3", "D4"]);
    // row 1 (y≈100): x=100 then x=300 · row 2 (y≈400±tol): x=90 then x=500
    expect(markers[0]).toMatchObject({ x: 100, y: 100 });
    expect(markers[1]).toMatchObject({ x: 300, y: 100, confidence: "flag", note: "ambiguous arc" });
    expect(markers[2]).toMatchObject({ x: 90, y: 405, type: "double" });
    expect(markers[3]).toMatchObject({ x: 500, y: 400 });
  });

  it("buildDoorMarkers is empty-safe", () => {
    expect(buildDoorMarkers(null)).toEqual([]);
    expect(buildDoorMarkers(undefined)).toEqual([]);
    expect(buildDoorMarkers([])).toEqual([]);
  });

  it("isWindowCode matches plan window codes and rejects lookalikes", () => {
    for (const ok of ["W1", "W12", "W3a", " W7 ", "w2"]) expect(isWindowCode(ok), ok).toBe(true);
    for (const no of ["WC", "W", "SW1", "W1234", "WALL", "D1", "W1.2"]) {
      expect(isWindowCode(no), no).toBe(false);
    }
  });

  it("summariseMarkers tallies confidence and type", () => {
    const s = summariseMarkers(
      buildDoorMarkers([
        { type: "hinged", widthMm: 810, x: 1, y: 1, confidence: "confirmed" },
        { type: "hinged", widthMm: 760, x: 2, y: 1, confidence: "confirmed" },
        { type: "double", widthMm: 1620, x: 3, y: 1, confidence: "confirmed" },
        { type: "cavity", widthMm: 760, x: 4, y: 1, confidence: "flag" },
      ]),
    );
    expect(s).toEqual({ confirmed: 3, flagged: 1, byType: { hinged: 2, double: 1, cavity: 1 } });
  });

  it("builds ledger overlay rows from active extracted quantity read model", () => {
    const readModel = buildExtractedQuantityReadModel([quantity()], { activeRunId: RUN_ID });
    const overlay = buildLedgerPlanOverlayModel(readModel, {
      authoritySource: "persisted_current_run",
      runId: RUN_ID,
    });

    expect(overlay.authoritySource).toBe("persisted_current_run");
    expect(overlay.runId).toBe(RUN_ID);
    expect(overlay.totalLedgerRows).toBe(1);
    expect(overlay.markedRows).toHaveLength(1);
    expect(overlay.markedRows[0]).toMatchObject({
      extractedQuantityId: "ledger-row",
      visualAnchor: {
        extractedQuantityId: "ledger-row",
        runId: RUN_ID,
        source: "visual_detection",
        page: 1,
        bbox: [10, 20, 30, 40],
        coordinateSpace: "adapter_page",
      },
      markerState: "drawable",
    });
    expect(overlay.markedRows[0].visualAnchorId).toMatch(/^va_/);
  });

  it("sets extractedQuantityId from the ledger row id", () => {
    const readModel = buildExtractedQuantityReadModel(
      [quantity({ id: "opening-visual-opening-7" })],
      { activeRunId: RUN_ID },
    );
    const overlay = buildLedgerPlanOverlayModel(readModel);

    expect(overlay.markedRows[0].extractedQuantityId).toBe("opening-visual-opening-7");
  });

  it("derives a runtime visual anchor from ledger row evidence with page and bbox", () => {
    const readModel = buildExtractedQuantityReadModel(
      [quantity({ evidence: [{ page: 4, bbox: [11, 22, 33, 44], text: "W04" }] })],
      { activeRunId: RUN_ID },
    );
    const overlay = buildLedgerPlanOverlayModel(readModel);

    expect(overlay.markedRows[0].visualAnchor).toMatchObject({
      extractedQuantityId: "ledger-row",
      jobId: "job-1",
      runId: RUN_ID,
      source: "visual_detection",
      page: 4,
      bbox: [11, 22, 33, 44],
      confidence: 95,
      warnings: [],
      evidenceText: "W04",
    });
  });

  it("sets visualAnchorId deterministically from runId row id source page and bbox", () => {
    const row = quantity({
      id: "deterministic-row",
      source: "pdf_text",
      evidence: [{ page: 2, bbox: [1, 2, 3, 4], text: "W02" }],
    });
    const first = buildLedgerPlanOverlayModel(
      buildExtractedQuantityReadModel([row], { activeRunId: RUN_ID }),
    );
    const second = buildLedgerPlanOverlayModel(
      buildExtractedQuantityReadModel([row], { activeRunId: RUN_ID }),
    );
    const changed = buildLedgerPlanOverlayModel(
      buildExtractedQuantityReadModel(
        [quantity({ ...row, evidence: [{ page: 2, bbox: [1, 2, 3, 5], text: "W02" }] })],
        { activeRunId: RUN_ID },
      ),
    );

    expect(first.markedRows[0].visualAnchorId).toEqual(second.markedRows[0].visualAnchorId);
    expect(first.markedRows[0].visualAnchorId).toMatch(/^va_/);
    expect(changed.markedRows[0].visualAnchorId).not.toEqual(first.markedRows[0].visualAnchorId);
  });

  it("splits rows with bbox into markedRows and keeps rows without bbox visible", () => {
    const readModel = buildExtractedQuantityReadModel(
      [
        quantity({ id: "with-bbox" }),
        quantity({ id: "without-bbox", evidence: [{ text: "text evidence only" }] }),
      ],
      { activeRunId: RUN_ID },
    );
    const overlay = buildLedgerPlanOverlayModel(readModel);

    expect(overlay.markedRows.map((row) => row.extractedQuantityId)).toEqual(["with-bbox"]);
    expect(overlay.unmarkedRows.map((row) => row.extractedQuantityId)).toEqual(["without-bbox"]);
    expect(overlay.totalLedgerRows).toBe(2);
  });

  it("does not derive anchors from rows without bbox", () => {
    const readModel = buildExtractedQuantityReadModel(
      [quantity({ id: "without-bbox", evidence: [{ page: 1, text: "page only" }] })],
      { activeRunId: RUN_ID },
    );
    const overlay = buildLedgerPlanOverlayModel(readModel);

    expect(overlay.markedRows).toHaveLength(0);
    expect(overlay.unmarkedRows[0]).toMatchObject({
      extractedQuantityId: "without-bbox",
      visualAnchorId: null,
      visualAnchor: null,
      markerState: "no_marker",
    });
  });

  it("does not derive anchors from bbox evidence without page", () => {
    const readModel = buildExtractedQuantityReadModel(
      [quantity({ id: "bbox-no-page", evidence: [{ bbox: [1, 2, 3, 4], text: "bbox only" }] })],
      { activeRunId: RUN_ID },
    );
    const overlay = buildLedgerPlanOverlayModel(readModel);

    expect(overlay.markedRows).toHaveLength(0);
    expect(overlay.unmarkedRows[0]).toMatchObject({
      extractedQuantityId: "bbox-no-page",
      bbox: null,
      visualAnchorId: null,
    });
  });

  it("does not derive active anchors from visual_opening_audit", () => {
    const overlay = buildLedgerPlanOverlayModel(null, {
      legacyVisualOpeningCount: 20,
    });

    expect(overlay.markedRows).toHaveLength(0);
    expect(overlay.legacyEvidence.visualOpeningCount).toBe(20);
  });

  it("does not derive active anchors from door_hits", () => {
    const overlay = buildLedgerPlanOverlayModel(null, {
      legacyDoorHitCount: 20,
    });

    expect(overlay.markedRows).toHaveLength(0);
    expect(overlay.legacyEvidence.doorHitCount).toBe(20);
  });

  it("does not use legacy correction marker IDs as visualAnchorId", () => {
    const readModel = buildExtractedQuantityReadModel(
      [quantity({ id: "opening-O7", evidence: [{ page: 1, bbox: [1, 2, 3, 4], text: "O7" }] })],
      { activeRunId: RUN_ID },
    );
    const overlay = buildLedgerPlanOverlayModel(readModel);

    expect(overlay.markedRows[0].visualAnchorId).not.toBe("O7");
    expect(overlay.markedRows[0].visualAnchorId).not.toBe("opening-O7");
    expect(overlay.markedRows[0].visualAnchorId).toMatch(/^va_/);
  });

  it("preserves unknown dimensions as null", () => {
    const readModel = buildExtractedQuantityReadModel(
      [
        quantity({
          id: "unknown-dims",
          widthMm: null,
          heightMm: null,
          areaM2: null,
          evidence: [{ text: "no dimensions" }],
        }),
      ],
      { activeRunId: RUN_ID },
    );
    const overlay = buildLedgerPlanOverlayModel(readModel);

    expect(overlay.unmarkedRows[0]).toMatchObject({
      widthMm: null,
      heightMm: null,
      areaM2: null,
    });
  });

  it("preserves assumed-height rows as needs_review with null height and null area", () => {
    const readModel = buildExtractedQuantityReadModel(
      [
        quantity({
          id: "assumed-height",
          status: "needs_review",
          heightMm: null,
          areaM2: null,
          warnings: ["assumed_height_rejected"],
          evidence: [{ text: "height 2100mm was assumed and rejected" }],
        }),
      ],
      { activeRunId: RUN_ID },
    );
    const overlay = buildLedgerPlanOverlayModel(readModel);

    expect(overlay.unmarkedRows[0]).toMatchObject({
      status: "needs_review",
      heightMm: null,
      areaM2: null,
      warnings: ["assumed_height_rejected"],
    });
  });

  it("does not promote needs_review rows when bbox exists", () => {
    const readModel = buildExtractedQuantityReadModel(
      [
        quantity({
          id: "review-with-bbox",
          status: "needs_review",
          evidence: [{ page: 1, bbox: [1, 2, 3, 4], text: "review bbox" }],
        }),
      ],
      { activeRunId: RUN_ID },
    );
    const overlay = buildLedgerPlanOverlayModel(readModel);

    expect(overlay.markedRows[0]).toMatchObject({
      status: "needs_review",
      visualAnchor: expect.objectContaining({ extractedQuantityId: "review-with-bbox" }),
    });
  });

  it("does not promote missing_evidence rows when bbox exists", () => {
    const readModel = buildExtractedQuantityReadModel(
      [
        quantity({
          id: "missing-with-bbox",
          status: "missing_evidence",
          evidence: [{ page: 1, bbox: [1, 2, 3, 4], text: "missing bbox" }],
        }),
      ],
      { activeRunId: RUN_ID },
    );
    const overlay = buildLedgerPlanOverlayModel(readModel);

    expect(overlay.markedRows[0].status).toBe("missing_evidence");
  });

  it("does not promote conflict rows when bbox exists", () => {
    const readModel = buildExtractedQuantityReadModel(
      [
        quantity({
          id: "conflict-with-bbox",
          status: "conflict",
          evidence: [{ page: 1, bbox: [1, 2, 3, 4], text: "conflict bbox" }],
        }),
      ],
      { activeRunId: RUN_ID },
    );
    const overlay = buildLedgerPlanOverlayModel(readModel);

    expect(overlay.markedRows[0].status).toBe("conflict");
  });

  it("preserves evidence page, bbox, and text where available", () => {
    const readModel = buildExtractedQuantityReadModel(
      [quantity({ evidence: [{ page: 3, bbox: [1, 2, 3, 4], text: "W03" }] })],
      { activeRunId: RUN_ID },
    );
    const overlay = buildLedgerPlanOverlayModel(readModel);

    expect(overlay.markedRows[0]).toMatchObject({
      evidencePage: 3,
      bbox: [1, 2, 3, 4],
      evidenceText: "W03",
    });
  });

  it("reports marker coverage counts", () => {
    const readModel = buildExtractedQuantityReadModel(
      [quantity({ id: "marked" }), quantity({ id: "unmarked", evidence: [{ text: "no marker" }] })],
      { activeRunId: RUN_ID },
    );
    const overlay = buildLedgerPlanOverlayModel(readModel);

    expect(overlay.totalLedgerRows).toBe(2);
    expect(overlay.markedRows).toHaveLength(1);
    expect(overlay.unmarkedRows).toHaveLength(1);
  });

  it("labels legacy door_hits and visual_opening_audit as evidence-only", () => {
    const overlay = buildLedgerPlanOverlayModel(null, {
      legacyDoorHitCount: 20,
      legacyVisualOpeningCount: 20,
    });

    expect(overlay.legacyEvidence).toMatchObject({
      doorHitCount: 20,
      visualOpeningCount: 20,
    });
    expect(overlay.legacyEvidence.warning).toContain("not active extracted quantity authority");
  });

  it("does not compute active overlay totals from legacy visual evidence", () => {
    const overlay = buildLedgerPlanOverlayModel(null, {
      legacyDoorHitCount: 20,
      legacyVisualOpeningCount: 20,
    });

    expect(overlay.totalLedgerRows).toBe(0);
    expect(overlay.markedRows).toHaveLength(0);
    expect(overlay.unmarkedRows).toHaveLength(0);
  });

  it("does not use opening_schedule as active overlay authority", () => {
    const overlay = buildLedgerPlanOverlayModel(null);

    expect(overlay.authoritySource).toBe("unavailable");
    expect(overlay.totalLedgerRows).toBe(0);
  });

  it("JM-0060-shaped model with 67 no-bbox rows reports 0 marked and 67 unmarked", () => {
    const rows = Array.from({ length: 67 }, (_, index) =>
      quantity({
        id: `jm-0060-row-${index + 1}`,
        evidence: [{ text: `JM-0060 text evidence ${index + 1}` }],
      }),
    );
    const readModel = buildExtractedQuantityReadModel(rows, { activeRunId: RUN_ID });
    const overlay = buildLedgerPlanOverlayModel(readModel, {
      authoritySource: "persisted_current_run",
      legacyDoorHitCount: 20,
      legacyVisualOpeningCount: 20,
    });

    expect(overlay.totalLedgerRows).toBe(67);
    expect(overlay.markedRows).toHaveLength(0);
    expect(overlay.unmarkedRows).toHaveLength(67);
    expect(overlay.legacyEvidence.doorHitCount).toBe(20);
    expect(overlay.legacyEvidence.visualOpeningCount).toBe(20);
  });

  it("buildVisualOpeningMarkers preserves visual QS order and marker ids", () => {
    const markers = buildVisualOpeningMarkers([
      {
        id: "O7",
        type: "window",
        room: "Bed 2",
        label: "1300x1500",
        height_m: 1.3,
        width_m: 1.5,
        x: 0.25,
        y: 0.4,
        confidence: "high",
        evidence: "printed 1300x1500 on external wall",
        flags: [],
      },
      {
        id: "",
        type: "garage_door",
        room: "Garage",
        label: null,
        height_m: null,
        width_m: null,
        x: 0.75,
        y: 0.8,
        confidence: "medium",
        evidence: "sectional door symbol",
        flags: ["size unreadable"],
      },
    ]);
    expect(markers.map((m) => m.markerLabel)).toEqual(["O7", "O2"]);
    expect(markers[1]).toMatchObject({ type: "garage_door", x: 0.75, y: 0.8 });
  });

  it("findOpeningTextAnchor prefers a printed W-code over broad visual coordinates", () => {
    const anchor = findOpeningTextAnchor(
      {
        label: "1800x600 W141",
        evidence: "printed 1800x600 W141 on Garage east wall",
      },
      [
        { text: "1800x600", vx: 1200, vy: 180 },
        { text: "W141", vx: 940, vy: 220 },
      ],
      1230,
      210,
    );
    expect(anchor).toMatchObject({ text: "W141", vx: 940, vy: 220 });
  });

  it("findOpeningTextAnchor picks the nearest duplicate dimension label", () => {
    const anchor = findOpeningTextAnchor(
      {
        label: "2110x2400",
        evidence: "printed 2110x2400 slider on Bed 1 north wall",
      },
      [
        { text: "2110x2400", vx: 250, vy: 120 },
        { text: "2110x2400", vx: 900, vy: 230 },
      ],
      280,
      150,
    );
    expect(anchor).toMatchObject({ vx: 250, vy: 120 });
  });
});

import { stitchTextItems } from "../verification/plan-overlay";

describe("stitchTextItems", () => {
  const g = (s: string, x: number, y: number, w = 5, fs = 8) => ({
    str: s,
    transform: [fs, 0, 0, fs, x, y],
    width: w,
  });

  it("stitches one-glyph-per-item runs (Qt plans) into whole labels", () => {
    const labels = stitchTextItems([g("W", 100, 50), g("1", 105.5, 50), g("2", 110.8, 50)]);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ text: "W12", ux: 100, uy: 50 });
  });

  it("keeps separate labels separate (big gap, different baselines)", () => {
    const labels = stitchTextItems([
      g("W", 100, 50),
      g("1", 105.5, 50),
      g("W", 300, 50),
      g("2", 305.5, 50), // far along same row
      g("W", 100, 200),
      g("3", 105.5, 200), // different row
    ]);
    expect(labels.map((l) => l.text).sort()).toEqual(["W1", "W2", "W3"]);
  });

  it("passes through already-whole items unchanged", () => {
    const labels = stitchTextItems([g("KITCHEN", 10, 10, 40), g("W7", 400, 10)]);
    expect(labels.map((l) => l.text).sort()).toEqual(["KITCHEN", "W7"]);
  });

  it("ignores empty/whitespace items", () => {
    expect(stitchTextItems([g(" ", 1, 1), g("", 2, 1)])).toEqual([]);
  });
});
