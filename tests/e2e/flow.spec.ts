import { test, expect, type Page } from "@playwright/test";

/**
 * E2E — core user flow: create a lab through the UI, then use the global
 * (Cmd/Ctrl+K) search.
 *
 * Runs against the seeded demo database; this spec writes one fixture
 * (lab "E2E Test Lab", code "E2E-01"), which is why the database is reset
 * by global setup on every run.
 */

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@labvault.io");
  await page.getByLabel("Password").fill("Password@123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("Lab creation and global search", () => {
  test("admin creates a lab and finds equipment via global search", async ({ page }) => {
    await loginAsAdmin(page);

    // --- Navigate to Labs through the sidebar link -------------------------
    await page.getByRole("link", { name: "Labs", exact: true }).first().click();
    await expect(page).toHaveURL(/\/labs$/);
    await expect(page.getByRole("heading", { name: "Labs", exact: true })).toBeVisible();

    // --- Create the lab ----------------------------------------------------
    await page.getByRole("button", { name: "New Lab" }).click();
    await page.getByLabel("Name").fill("E2E Test Lab");
    await page.getByLabel("Code").fill("E2E-01");
    await page.getByRole("button", { name: "Create lab" }).click();

    const labCard = page.getByText("E2E Test Lab").first();
    await expect(labCard).toBeVisible();

    // --- Global search via Cmd/Ctrl+K --------------------------------------
    await page.keyboard.press("Control+K");
    const dialog = page.getByRole("dialog");
    // Meta+K fallback for platforms where the Ctrl modifier is remapped.
    if (!(await dialog.isVisible().catch(() => false))) {
      await page.keyboard.press("Meta+K");
    }
    await expect(dialog).toBeVisible();

    await dialog.locator("input").first().fill("osc");

    // "osc" matches seeded equipment (Digital Storage Oscilloscope 200MHz) —
    // the results render grouped, with the group header above the hits.
    await expect(dialog.getByText("Equipment", { exact: true })).toBeVisible();

    // Escape closes the palette.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
