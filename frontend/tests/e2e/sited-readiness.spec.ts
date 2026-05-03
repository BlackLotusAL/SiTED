import { expect, type Locator, type Page, test } from "@playwright/test";

type TestRole = "learner" | "content_admin" | "system_admin";

test.describe("SiTED local readiness", () => {
  test("learner dashboard loads", async ({ page }) => {
    await mockIdentity(page, "learner");
    await page.goto("/");

    await expect(page.locator(".dashboard-grid")).toBeVisible();
    await expect(page.locator(".training-calendar")).toBeVisible();
    await expect(page.locator(".calendar-grid [role='columnheader']")).toHaveCount(7);
    await expect(page.locator(".calendar-grid .day-cell")).toHaveCount(42);
  });

  test("question browser filter and preview work", async ({ page }) => {
    await mockIdentity(page, "learner");
    await page.goto("/questions");

    await page.locator(".filter-bar select").nth(1).selectOption("java");
    await page.locator(".filter-bar select").nth(3).selectOption("single");
    await page.locator(".search-field input").fill("ConcurrentHashMap");

    await expect(page.locator(".question-card.selected")).toBeVisible();
    await expect(page.locator(".question-preview-card")).toContainText("ConcurrentHashMap");
    await expect(page.locator(".question-preview-card pre code")).toContainText("ConcurrentHashMap");
    await expect(page.locator(".question-preview-card .preview-option.correct")).toContainText("ConcurrentHashMap");
  });

  test("practice submit updates feedback", async ({ page }) => {
    await mockIdentity(page, "learner");
    await page.goto("/practice");

    await page.locator(".options .option").filter({ hasText: "ArrayList" }).click();
    await page.locator(".practice-actions .primary-button").click();

    await expect(page.locator(".answer-panel[role='status']")).toBeVisible();
    await expect(page.locator(".option.is-wrong")).toContainText("ArrayList");
    await expect(page.locator(".option.is-correct")).toContainText("ConcurrentHashMap");
  });

  test("review tabs switch", async ({ page }) => {
    await mockIdentity(page, "learner");
    await page.goto("/review");

    const tabs = page.getByRole("tab");
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");

    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".table-head.bookmarks")).toBeVisible();

    await tabs.nth(2).click();
    await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".table-head.records")).toBeVisible();
  });

  test("exam create-save-submit works", async ({ page }) => {
    await mockIdentity(page, "learner");
    await page.goto("/exam");

    await page.locator(".options.multi .option").nth(1).click();
    await expect(page.locator(".options.multi .option").nth(1)).toHaveClass(/selected/);

    await page.locator(".exam-paper .practice-actions .primary-button").click();
    await expect(page.locator(".autosave-state")).toBeVisible();

    await page.locator(".answer-sheet > .danger-button").click();
    await expect(page.locator(".submit-confirmation[role='alert']")).toBeVisible();
    await page.locator(".submit-confirmation .danger-button").click();

    await expect(page.locator(".answer-panel.review-state")).toBeVisible();
    await expect(page.locator(".answer-sheet > .danger-button")).toBeDisabled();
  });

  test("admin question editor preview renders highlighted code", async ({ page }) => {
    await mockIdentity(page, "system_admin");
    await page.goto("/admin/questions");

    const preview = page.locator(".admin-preview-panel");
    await expect(preview.locator(".code-block.language-java")).toBeVisible();
    await expect(preview.locator(".token.keyword").first()).toBeVisible();
    await expect(preview.locator(".token.type").filter({ hasText: "ConcurrentHashMap" })).toBeVisible();
  });

  test("admin stats charts render with aligned axes", async ({ page }) => {
    await mockIdentity(page, "system_admin");
    await page.goto("/admin/stats");

    const charts = page.locator(".mini-chart");
    await expect(charts).toHaveCount(3);

    for (let chartIndex = 0; chartIndex < 3; chartIndex += 1) {
      const chart = charts.nth(chartIndex);
      const bars = chart.locator("[data-testid='trend-chart-bar']");
      const labels = chart.locator("[data-testid='trend-chart-x-label']");
      await expect(bars).toHaveCount(7);
      await expect(labels).toHaveCount(7);
      await expect(chart.locator(".mini-y-axis span")).toHaveCount(3);

      for (let pointIndex = 0; pointIndex < 7; pointIndex += 1) {
        const barBox = await requiredBox(bars.nth(pointIndex));
        const labelBox = await requiredBox(labels.nth(pointIndex));
        expect(Math.abs(centerX(barBox) - centerX(labelBox))).toBeLessThanOrEqual(8);
      }
    }
  });

  test("admin settings table headers and permissions render", async ({ page }) => {
    await mockIdentity(page, "system_admin");
    await page.goto("/admin/settings");

    const table = page.locator(".role-binding-table");
    await expect(table).toBeVisible();
    await expect(table.locator("thead th")).toHaveCount(5);
    await expect(table).toContainText("10.42.18.36");
    await expect(table.locator(".permission-list span").first()).toBeVisible();
    await expect(table.locator(".permission-list span")).toHaveCount(10);
  });
});

async function mockIdentity(page: Page, role: TestRole) {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ip: role === "learner" ? "10.42.11.10" : "10.42.18.36",
        role,
        roleLabel: role,
        permissions: []
      })
    });
  });
}

async function requiredBox(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("Expected element to have a bounding box");
  }
  return box;
}

function centerX(box: { x: number; width: number }) {
  return box.x + box.width / 2;
}
