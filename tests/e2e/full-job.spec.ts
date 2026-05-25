/**
 * End-to-end test: concept upload pipeline for two known plans.
 *
 * Validates that the geometry API + AI extraction pipeline produces
 * measurements within 2% of the surveyed values for:
 *   - McAlevey  (Jennian,  136.3 m²,  54.8 m perimeter)
 *   - Dixon & Bean (Jennian, 234.92 m², 81.48 m perimeter)
 *
 * Prerequisites:
 *   PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD must be set
 *   (see .env.local).  The test user must exist in Supabase with the
 *   "estimator" role.
 *
 * The test navigates the full concept pipeline (upload → select page →
 * scale → plan check → takeoffs) and asserts on the displayed values.
 * Long timeouts reflect the AI + geometry processing time (~2–4 min).
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL ?? "";
const PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD ?? "";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, "fixtures");

type PlanSpec = {
  file: string;
  label: string;
  floorAreaM2: number;
  perimeterM: number;
  tolerancePct: number;
  builderContains: string;
};

const PLANS: PlanSpec[] = [
  {
    file: "mcalevey.pdf",
    label: "McAlevey",
    floorAreaM2: 136.3,
    perimeterM: 54.8,
    tolerancePct: 2,
    builderContains: "Jennian",
  },
  {
    file: "dixon_bean.pdf",
    label: "Dixon & Bean",
    floorAreaM2: 234.92,
    perimeterM: 81.48,
    tolerancePct: 2,
    builderContains: "Jennian",
  },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function withinTolerance(actual: number, expected: number, pct: number): boolean {
  return Math.abs(actual - expected) / expected * 100 <= pct;
}

/** Parse the first number from a cell text (e.g. "136.3" → 136.3). */
function parseCell(text: string): number | null {
  const m = text.match(/([\d]+\.[\d]+|[\d]+)/);
  return m ? parseFloat(m[1]) : null;
}

/** Get the displayed value for a labelled row in the takeoff table. */
async function getTakeoffValue(page: Page, label: string): Promise<number | null> {
  const row = page.locator("table tr").filter({ hasText: label }).first();
  // The second td holds the editable cell (a button or input showing the value)
  const cell = row.locator("td").nth(1);
  const text = await cell.innerText();
  if (text.includes("Not found")) return null;
  return parseCell(text);
}

// ── auth ─────────────────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto("/login");
  // Wait for React to fully hydrate the page before interacting.
  // Without this, Playwright can click the submit button before React attaches
  // the onSubmit handler, causing a native GET form submission to /login? instead
  // of calling supabase.auth.signInWithPassword.
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  // Wait for redirect — auth state propagation takes a moment
  await page.waitForURL(/\/jobs/, { timeout: 30_000 });
}

// ── concept pipeline ─────────────────────────────────────────────────────────

async function runConceptPipeline(page: Page, spec: PlanSpec) {
  const pdfPath = path.join(FIXTURES, spec.file);
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Fixture not found: ${pdfPath}`);
  }

  // ── 1. Navigate to Upload ──────────────────────────────────────────────────
  await page.goto("/upload");
  await expect(page.getByRole("heading", { name: "Upload Plan" })).toBeVisible({ timeout: 15_000 });

  // ── 2. Ensure Concept plan type is selected (it's the default) ────────────
  const conceptBtn = page.getByRole("button", { name: "Concept (Quick)" });
  if (!(await conceptBtn.evaluate((el) => el.className.includes("text-primary")))) {
    await conceptBtn.click();
  }

  // ── 3. Upload the PDF ─────────────────────────────────────────────────────
  // The Dropzone renders a hidden <input type="file">. Playwright can interact
  // with it directly even though it has class="sr-only".
  const fileInput = page.locator('input[type="file"][accept="application/pdf"]').first();
  await fileInput.setInputFiles(pdfPath);
  // Confirm the file name appears in the dropzone
  await expect(page.getByText(spec.file)).toBeVisible({ timeout: 10_000 });

  // ── 4. Fill job details ───────────────────────────────────────────────────
  // Job number is auto-filled; override with a recognisable E2E name
  const jobNumInput = page.getByPlaceholder(/JM-/i);
  await jobNumInput.clear();
  await jobNumInput.fill(`E2E-${spec.label.replace(/\s+/g, "-")}-${Date.now()}`);
  await page.getByPlaceholder("Full client name").fill(`E2E ${spec.label}`);
  await page.getByPlaceholder("Street, Suburb, City").fill("123 Test Street, Palmerston North");

  // ── 5. Submit form → page selection ───────────────────────────────────────
  // Wait for SSR hydration before submitting — same race condition as login.
  // Without this the click fires before React attaches the onSubmit handler.
  await page.waitForLoadState("networkidle");
  await page.locator('button[type="submit"]').click();
  // Wait for page analysis to complete — up to 180 s (Anthropic response is
  // variable; 90 s was too tight on slower API days).
  const confirmBtn = page.getByRole("button", { name: /Confirm Selection/i });
  const continueBtn = page.getByRole("button", { name: /^Continue/i });
  await expect(
    confirmBtn.or(continueBtn),
  ).toBeVisible({ timeout: 180_000 });

  // ── 6. Confirm page selection ─────────────────────────────────────────────
  // When certainty === "high" the app auto-sets confirmed=true and may advance
  // before we click.  Try clicking the Confirm button only if it is enabled;
  // if it is already disabled (auto-confirming) or gone, fall through to
  // clicking Continue directly.
  const confirmEnabled = await confirmBtn.isEnabled().catch(() => false);
  if (confirmEnabled) {
    await confirmBtn.click();
  }
  // Now click Continue (enabled once confirmed — or immediately if auto-advanced)
  await expect(continueBtn).toBeEnabled({ timeout: 15_000 });
  await continueBtn.click();

  // ── 7. Scale step (may auto-advance for some plans) ──────────────────────
  // Wait up to 120 s for EITHER the "Continue to Plan Check" button (scale step)
  // OR the "Continue to Takeoffs" button (if plan check auto-started).
  // Use or() so we don't hard-code which step comes first.
  const scaleContinueBtn = page.getByRole("button", { name: /Continue to Plan Check/i });
  const continueToTakeoffsBtn = page.getByRole("button", { name: /Continue to Takeoffs/i });
  const planCheckHeading = page.getByRole("heading", { name: /Plan Check/i });

  await expect(
    scaleContinueBtn.or(planCheckHeading).or(continueToTakeoffsBtn),
  ).toBeVisible({ timeout: 120_000 });

  if (await scaleContinueBtn.isVisible().catch(() => false)) {
    await scaleContinueBtn.click();
  }

  // ── 8. Plan check step ───────────────────────────────────────────────────
  // Wait for plan check heading (if not already there) and then for it to finish.
  await expect(planCheckHeading).toBeVisible({ timeout: 60_000 });
  // Wait for "Checking plan…" spinner to disappear (it may already be gone)
  await expect(page.getByText("Checking plan…")).toBeHidden({ timeout: 90_000 });

  // If there are blocking errors, acknowledge them
  const acknowledgeBtn = page.getByRole("button", { name: /I understand/i });
  if (await acknowledgeBtn.isVisible().catch(() => false)) {
    await acknowledgeBtn.click();
  }

  // Wait for Continue to Takeoffs to appear — plan check can take ~1–2 min
  await expect(continueToTakeoffsBtn).toBeVisible({ timeout: 180_000 });
  await continueToTakeoffsBtn.click();

  // ── 9. Takeoff extraction ────────────────────────────────────────────────
  // This is the longest step: AI (claude-opus-4-5) + geometry API run in
  // parallel. Allow 5 minutes for both to complete.
  await expect(page.getByText("Extracting quantities…")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Extracting quantities…")).toBeHidden({ timeout: 300_000 });

  // The results table must now be visible
  await expect(page.getByText("Floor area")).toBeVisible({ timeout: 30_000 });
}

// ── assertions ────────────────────────────────────────────────────────────────

async function assertResults(page: Page, spec: PlanSpec) {
  // Floor area
  const floorArea = await getTakeoffValue(page, "Floor area");
  expect(floorArea, "Floor area should be a number").not.toBeNull();
  expect(
    withinTolerance(floorArea!, spec.floorAreaM2, spec.tolerancePct),
    `Floor area ${floorArea} should be within ${spec.tolerancePct}% of ${spec.floorAreaM2}`,
  ).toBe(true);

  // Perimeter → mapped to "External wall" in the UI (perimeter_m → external_wall_lm)
  const perimeter = await getTakeoffValue(page, "External wall");
  expect(perimeter, "External wall (perimeter) should be a number").not.toBeNull();
  expect(
    withinTolerance(perimeter!, spec.perimeterM, spec.tolerancePct),
    `Perimeter ${perimeter} should be within ${spec.tolerancePct}% of ${spec.perimeterM}`,
  ).toBe(true);

  // Builder badge chip — contains "Builder:" prefix and the builder name
  await expect(
    page.getByText(new RegExp(`Builder:.*${spec.builderContains}`, "i")),
  ).toBeVisible({ timeout: 5_000 });

  // No error-state banners
  await expect(page.getByText("Extraction failed")).not.toBeVisible();
  await expect(page.getByText("could not run")).not.toBeVisible();

  // Geometry confidence badge must be visible (green or amber)
  await expect(
    page.getByText(/Geometry: (high|medium) confidence/i),
  ).toBeVisible({ timeout: 5_000 });
}

async function assertExport(page: Page) {
  const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
  await page.getByRole("button", { name: /Export to QS/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
  // Clean up the download
  await download.delete();
}

// ── test suite ────────────────────────────────────────────────────────────────

test.describe("Concept upload pipeline", () => {
  test.beforeAll(() => {
    if (!EMAIL || !PASSWORD) {
      throw new Error(
        "PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD must be set. " +
          "Add them to .env.local and re-run.",
      );
    }
  });

  // Shared auth state — log in once, reuse the session for both plan tests
  let authCtx: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    authCtx = await browser.newContext();
    const page = await authCtx.newPage();
    await login(page);
    await page.close();
  });

  test.afterAll(async () => {
    await authCtx.close();
  });

  for (const spec of PLANS) {
    test(`${spec.label} — floor area, perimeter, builder, export`, async () => {
      const page = await authCtx.newPage();
      try {
        await runConceptPipeline(page, spec);
        await assertResults(page, spec);
        await assertExport(page);
        console.log(`✓ ${spec.label}: passed all assertions`);
      } finally {
        await page.close();
      }
    });
  }
});
