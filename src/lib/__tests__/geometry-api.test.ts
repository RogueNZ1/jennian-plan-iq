/**
 * Geometry client contract tests (audit finding M2, 13 Jun 2026).
 *
 * This is the integration whose silent 401 ran for TWO DAYS during demo week —
 * `catch → null` made a dead service indistinguishable from "plan has no geometry".
 * The compose seam is already loud (pipeline-safety-guards.test.ts pins
 * geometry_status: unavailable); these tests pin the CLIENT's side of the contract:
 *
 *   1. every failure class returns null (never throws, never partial data)
 *   2. every failure class names its REASON on the console — 401/403 name the key fix
 *   3. the pinned-page fallback retries auto-detect exactly once, observably
 *   4. the happy path passes the payload through untouched
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { measurePlanGeometry, type GeometryApiResult } from "../takeoff/geometry-api";

const okPayload = (page_used = 0): GeometryApiResult =>
  ({
    success: true,
    page_used,
    total_pages: 3,
    measurements: { floor_area_m2: 165 },
    confidence: { floor_area: "high", perimeter: "high" },
  }) as unknown as GeometryApiResult;

const blob = new Blob(["%PDF-fake"], { type: "application/pdf" });

let fetchMock: ReturnType<typeof vi.fn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  warnSpy.mockRestore();
});

describe("measurePlanGeometry — failure contract", () => {
  it("HTTP 401 → null, and the warning NAMES the auth fix (the demo-week scenario)", async () => {
    fetchMock.mockResolvedValue(new Response("unauthorized", { status: 401 }));
    const out = await measurePlanGeometry(blob, "plan.pdf");
    expect(out).toBeNull();
    const warned = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(warned).toContain("401");
    expect(warned).toContain("GEOMETRY_API_KEY");
  });

  it("HTTP 403 also names the auth fix", async () => {
    fetchMock.mockResolvedValue(new Response("forbidden", { status: 403 }));
    expect(await measurePlanGeometry(blob)).toBeNull();
    expect(warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n")).toContain(
      "GEOMETRY_API_KEY",
    );
  });

  it("HTTP 500 → null with a status-bearing warning (no auth hint)", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    expect(await measurePlanGeometry(blob)).toBeNull();
    const warned = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(warned).toContain("500");
    expect(warned).not.toContain("GEOMETRY_API_KEY");
  });

  it("network throw → null, reason logged, never propagates", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(measurePlanGeometry(blob)).resolves.toBeNull();
    expect(warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n")).toContain(
      "network/parse",
    );
  });

  it("success:false body → null with a warning (engine-side rejection is not silent)", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await measurePlanGeometry(blob)).toBeNull();
    expect(warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n")).toContain(
      "success:false",
    );
  });

  it("malformed JSON → null (parse failure is a failure, not a crash)", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>gateway timeout</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    expect(await measurePlanGeometry(blob)).toBeNull();
  });
});

describe("measurePlanGeometry — pinned-page fallback", () => {
  it("pinned page fails → exactly one auto-detect retry, second URL has NO page param", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("no scale on that sheet", { status: 422 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(okPayload(2)), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const out = await measurePlanGeometry(blob, "plan.pdf", 1);
    expect(out?.page_used).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("page=1");
    expect(String(fetchMock.mock.calls[1][0])).not.toContain("page=");
  });

  it("no pinned page → a failure does NOT retry (one attempt only)", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    expect(await measurePlanGeometry(blob)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("pinned page succeeds → no retry, payload passes through untouched", async () => {
    const payload = okPayload(1);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const out = await measurePlanGeometry(blob, "plan.pdf", 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out).toEqual(payload);
  });
});
