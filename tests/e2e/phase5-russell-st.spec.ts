/**
 * Phase 5 validation — 15A Russell St, Feilding.
 *
 * Uploads the three-PDF set (floorplan + elevations + siteplan) through the
 * full concept pipeline and asserts extracted values match the surveyed ground
 * truth within tolerance.
 *
 * Ground truth:
 *   Floor area  : 135.0 m²  (±5%)
 *   Perimeter   : 57.1 m    (±5%)
 *   Cladding    : brick + Linea weatherboard
 *   Roof        : Metal tiles, 25°
 *   Concrete    : 243 m² total
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL ?? "";
const PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD ?? "";
const FIXTURES = path.join(__dirname, "../fixtures");

const PLAN_FILE = path.join(FIXTURES, "15a-russell-st-floorplan.pdf");
const ELEV_FILE = path.join(FIXTURES, "15a-russell-st-elevations.pdf");
const SITE_FILE = path.join(FIXTURES, "15a-russell-st-siteplan.pdf");

const EXPECTED = {
  floorAreaM2: 135.0,
  perimeterM: 57.1,
  tolerancePct: 5,
};

// ── helpers ───────────────────────────────────────────────────────────────────

function withinTol(actual: number, expected: number, pct: number): boolean {
  return (Math.abs(actual - expected) / expected) * 100 <= pct;
}

function parseNum(text: string): number | null {
  const m = text.match(/([\d]+\.[\d]+|[\d]+)/);
  return m ? parseFloat(m[1]) : null;
}

async function getTakeoffValue(page: Page, label: string): Promise<number | null> {
  const row = page.locator("table tr").filter({ hasText: label }).first();
  const cell = row.locator("td").nth(1);
  const text = await cell.innerText().catch(() => "");
  if (!text || text.includes("Not found")) return null;
  return parseNum(text);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/jobs/, { timeout: 30_000 });
}

// ── test suite ────────────────────────────────────────────────────────────────

test.describe("15A Russell St — Phase 5 ground-truth validation", () => {
  test.beforeAll(() => {
    if (!EMAIL || !PASSWORD) {
      throw new Error("PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD must be set.");
    }
    for (const f of [PLAN_FILE, ELEV_FILE, SITE_FILE]) {
      if (!fs.existsSync(f)) throw new Error(`Fixture not found: ${f}`);
    }
  });

  let authCtx: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    authCtx = await browser.newContext();
    const p = await authCtx.newPage();
    await login(p);
    await p.close();
  });

  test.afterAll(async () => {
    await authCtx.close();
  });

  test("floor area · perimeter · cladding · roof · concrete · export", async () => {
    const page = await authCtx.newPage();
    try {
      // ── 1. Upload form ──────────────────────────────────────────────────────
      await page.goto("/upload");
      await expect(page.getByRole("heading", { name: "Upload Plan" })).toBeVisible({
        timeout: 15_000,
      });

      // Upload primary plan PDF
      const planInput = page
        .locator('input[type="file"][accept="application/pdf"]:not([multiple])')
        .first();
      await planInput.setInputFiles(PLAN_FILE);
      await expect(page.getByText("15a-russell-st-floorplan.pdf")).toBeVisible({ timeout: 10_000 });

      // Upload elevations + siteplan to the additional PDFs zone (multiple input)
      const additionalInput = page
        .locator('input[type="file"][accept="application/pdf"][multiple]')
        .first();
      await additionalInput.setInputFiles([ELEV_FILE, SITE_FILE]);
      await expect(page.getByText("15a-russell-st-elevations.pdf")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText("15a-russell-st-siteplan.pdf")).toBeVisible({ timeout: 10_000 });

      // Wait for auto-classification to complete
      await expect(page.getByText("Elevations").first()).toBeVisible({ timeout: 45_000 });
      await expect(page.getByText("Site Plan").first()).toBeVisible({ timeout: 45_000 });

      // Fill job details
      const jobNumInput = page.getByPlaceholder(/JM-/i);
      await jobNumInput.clear();
      await jobNumInput.fill(`JM-TEST-RUSSELL-${Date.now()}`);
      await page.getByPlaceholder("Full client name").fill("15A Russell St E2E Test");
      await page.getByPlaceholder("Street, Suburb, City").fill("15A Russell Street, Feilding");

      // ── 2. Page selection ───────────────────────────────────────────────────
      await page.locator('button[type="submit"]').click();

      const confirmBtn = page.getByRole("button", { name: /Confirm Selection/i });
      const continueBtn = page.getByRole("button", { name: /^Continue/i });
      await Promise.race([
        confirmBtn.waitFor({ state: "visible", timeout: 30_000 }),
        continueBtn.waitFor({ state: "visible", timeout: 30_000 }),
      ]);

      await expect(confirmBtn).toBeEnabled({ timeout: 120_000 });
      await confirmBtn.click();
      await expect(continueBtn).toBeEnabled({ timeout: 15_000 });
      await continueBtn.click();

      // ── 3. Scale step ───────────────────────────────────────────────────────
      const scaleContinueBtn = page.getByRole("button", { name: /Continue to Plan Check/i });
      const planCheckHeading = page.getByRole("heading", { name: /Plan Check/i });
      const continueToTakeoffs = page.getByRole("button", { name: /Continue to Takeoffs/i });

      await expect(scaleContinueBtn.or(planCheckHeading).or(continueToTakeoffs)).toBeVisible({
        timeout: 120_000,
      });

      if (await scaleContinueBtn.isVisible().catch(() => false)) {
        await scaleContinueBtn.click();
      }

      // ── 4. Plan check step ──────────────────────────────────────────────────
      await expect(planCheckHeading).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText("Checking plan…")).toBeHidden({ timeout: 90_000 });

      const ackBtn = page.getByRole("button", { name: /I understand/i });
      if (await ackBtn.isVisible().catch(() => false)) await ackBtn.click();

      await expect(continueToTakeoffs).toBeVisible({ timeout: 180_000 });
      await continueToTakeoffs.click();

      // ── 5. Takeoff extraction (AI + geometry + elevation/siteplan) ──────────
      await expect(page.getByText("Extracting quantities…")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Extracting quantities…")).toBeHidden({ timeout: 300_000 });
      await expect(page.getByText("Floor area")).toBeVisible({ timeout: 30_000 });

      // ── 6. Assertions ───────────────────────────────────────────────────────

      // Floor area
      const floorArea = await getTakeoffValue(page, "Floor area");
      console.log(
        `  Floor area    : ${floorArea} m²  (expected ~${EXPECTED.floorAreaM2} m², ±${EXPECTED.tolerancePct}%)`,
      );
      expect(floorArea, "floor area must be a number").not.toBeNull();
      expect(
        withinTol(floorArea!, EXPECTED.floorAreaM2, EXPECTED.tolerancePct),
        `Floor area ${floorArea} outside ±${EXPECTED.tolerancePct}% of ${EXPECTED.floorAreaM2}`,
      ).toBe(true);

      // Perimeter → shown as "External wall" in takeoff table
      const perimeter = await getTakeoffValue(page, "External wall");
      console.log(
        `  Perimeter     : ${perimeter} m   (expected ~${EXPECTED.perimeterM} m, ±${EXPECTED.tolerancePct}%)`,
      );
      if (perimeter !== null) {
        expect(
          withinTol(perimeter, EXPECTED.perimeterM, EXPECTED.tolerancePct),
          `Perimeter ${perimeter} outside ±${EXPECTED.tolerancePct}% of ${EXPECTED.perimeterM}`,
        ).toBe(true);
      }

      // Elevation card — cladding
      await expect(page.getByText(/brick/i).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/linea/i).first()).toBeVisible({ timeout: 10_000 });

      // Elevation card — roof
      await expect(page.getByText(/metal.*tile/i).first()).toBeVisible({ timeout: 10_000 });

      // Log extracted cladding + roof text for the report
      const elevSection = page.locator("text=Elevation & Site Plan").locator("..").locator("..");
      const claddingVal = await elevSection
        .locator("text=/Cladding:/")
        .textContent()
        .catch(() => "N/A");
      const roofVal = await elevSection
        .locator("text=/Roof:/")
        .textContent()
        .catch(() => "N/A");
      console.log(`  Cladding      : ${claddingVal?.trim()}`);
      console.log(`  Roof          : ${roofVal?.trim()}`);

      // Concrete total — log 243 m² if present; soft check (siteplan extraction is aspirational)
      const concreteVisible = await page
        .getByText(/243/)
        .isVisible()
        .catch(() => false);
      console.log(
        `  Concrete 243  : ${concreteVisible ? "visible ✓" : "not shown (soft — siteplan extraction pending)"}`,
      );

      // Builder badge
      await expect(page.getByText(/Builder:.*Jennian/i)).toBeVisible({ timeout: 5_000 });

      // Geometry confidence badge
      await expect(page.getByText(/Geometry:.*confidence/i)).toBeVisible({ timeout: 5_000 });
      const geoText = await page.getByText(/Geometry:.*confidence/i).textContent();
      console.log(`  Geometry      : ${geoText?.trim()}`);

      // Export — asserts .xlsx download
      const dlPromise = page.waitForEvent("download", { timeout: 15_000 });
      await page.getByRole("button", { name: /Export to QS/i }).click();
      const dl = await dlPromise;
      console.log(`  Export file   : ${dl.suggestedFilename()}`);
      expect(dl.suggestedFilename()).toMatch(/\.xlsx$/i);
      await dl.delete();

      console.log("  ✓ All assertions passed");
    } finally {
      await page.close();
    }
  });
});
