import { test, expect, type Page } from "@playwright/test";

/**
 * E2E — Operations Center (dashboard).
 *
 * The dashboard is action-first: a live "Attention required" section driven
 * by /api/operations/attention plus distribution charts fed by /api/dashboard.
 */

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@labvault.io");
  await page.getByLabel("Password").fill("Password@123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("Operations Center", () => {
  test("shows the attention section with cards or the all-clear state", async ({ page }) => {
    await loginAsAdmin(page);

    await expect(page.getByRole("heading", { name: "Operations Center" })).toBeVisible();

    const attention = page.getByRole("region", { name: "Attention required" });
    const attentionCard = attention.getByRole("link").first();
    const allClear = attention.getByText("All clear");
    await expect(allClear.or(attentionCard)).toBeVisible();
  });

  test("renders the equipment-by-category chart section", async ({ page }) => {
    await loginAsAdmin(page);

    await expect(page.getByText("Equipment by category")).toBeVisible();

    // Distribution section hosts both charts once /api/dashboard responds.
    const distribution = page.getByRole("region", { name: "Distribution" });
    await expect(distribution.getByText("Equipment per lab")).toBeVisible();
  });
});
