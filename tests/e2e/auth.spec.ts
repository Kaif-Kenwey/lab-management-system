import { test, expect, type Page } from "@playwright/test";

/**
 * E2E — authentication shell: landing page, sign-in, sign-out.
 *
 * Uses the seeded demo admin account (admin@labvault.io / Password@123).
 */

const ADMIN = {
  email: "admin@labvault.io",
  password: "Password@123",
};

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("Authentication", () => {
  test("landing page renders the LabVault brand", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("LabVault").first()).toBeVisible();
  });

  test("admin signs in and lands on the Operations dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    // Full-page navigation after a successful login (cookie handoff).
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Operations Center" })).toBeVisible();

    // The authenticated shell renders the role-filtered sidebar.
    await expect(page.getByText("Operations", { exact: true }).first()).toBeVisible();
  });

  test("signing out from the avatar menu returns to the login page", async ({ page }) => {
    await loginAsAdmin(page);

    // Topbar avatar trigger carries the user's name (seeded: Aarav Sharma).
    await page.getByRole("button", { name: /Aarav Sharma/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});
