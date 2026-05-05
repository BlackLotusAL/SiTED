import { expect, type APIRequestContext, type Locator, type Page, test } from "@playwright/test";

type TestRole = "learner" | "content_admin" | "system_admin";
type QuestionType = "single" | "multiple" | "judgment";

interface QuestionListItem {
  id: string;
  sourceCode: string | null;
}

interface QuestionListResponse {
  items: QuestionListItem[];
  total: number;
}

interface QuestionDetailResponse {
  stemHtml: string;
  correctAnswers?: string[];
}

interface ReciteQuestionDetailResponse extends QuestionDetailResponse {
  correctAnswers: string[];
}

interface AdminStatsResponse {
  questions: {
    total: number;
    published: number;
    bySubject: Array<{ subject: string; count: number }>;
  };
}

const API_BASE_URL = "http://127.0.0.1:3000";

test.describe("SiTED local readiness", () => {
  test("seeded backend questions and admin stats are API-ready", async ({ request }) => {
    const [single, multiple, judgment] = await Promise.all([
      getQuestionList(request, "single"),
      getQuestionList(request, "multiple"),
      getQuestionList(request, "judgment")
    ]);

    expect(single.total).toBeGreaterThanOrEqual(22);
    expect(multiple.total).toBeGreaterThanOrEqual(10);
    expect(judgment.total).toBeGreaterThanOrEqual(8);
    expect(single.items.some((item) => item.sourceCode === "SITED-SEED-EXAM-JAVA-WORKING-SINGLE-01")).toBe(true);
    expect(multiple.items.some((item) => item.sourceCode === "SITED-SEED-EXAM-JAVA-WORKING-MULTIPLE-01")).toBe(true);
    expect(judgment.items.some((item) => item.sourceCode === "SITED-SEED-EXAM-JAVA-WORKING-JUDGMENT-01")).toBe(true);

    const detailResponse = await request.get(`${API_BASE_URL}/api/questions/${single.items[0].id}`);
    expect(detailResponse.ok()).toBe(true);
    const detail = (await detailResponse.json()) as QuestionDetailResponse;
    expect(detail.stemHtml).toContain("<pre");
    expect(detail.stemHtml).toContain("ConcurrentHashMap");
    expect(detail.correctAnswers).toBeUndefined();

    const reciteResponse = await request.get(`${API_BASE_URL}/api/questions/${single.items[0].id}/recite`);
    expect(reciteResponse.ok()).toBe(true);
    const reciteDetail = (await reciteResponse.json()) as ReciteQuestionDetailResponse;
    expect(reciteDetail.correctAnswers.length).toBeGreaterThan(0);

    const statsResponse = await request.get(`${API_BASE_URL}/api/admin/stats`, {
      headers: { "x-forwarded-for": "10.42.18.36" }
    });
    expect(statsResponse.ok()).toBe(true);
    const stats = (await statsResponse.json()) as AdminStatsResponse;
    expect(stats.questions.total).toBeGreaterThanOrEqual(46);
    expect(stats.questions.published).toBeGreaterThanOrEqual(44);
    expect(stats.questions.bySubject.map((item) => item.subject).sort()).toEqual([
      "programming",
      "refactoring",
      "security_privacy"
    ]);
  });

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
    await expect(page.locator(".question-preview-card .preview-option.correct")).toHaveCount(0);
  });

  test("practice page opens from filters and switches practice and recite modes", async ({ page }) => {
    await mockIdentity(page, "learner");
    await page.goto("/questions");

    await page.locator(".filter-bar select").nth(1).selectOption("java");
    await page.locator(".filter-bar select").nth(3).selectOption("single");
    await page.locator(".search-field input").fill("ConcurrentHashMap");
    await page.getByRole("link", { name: "按当前筛选练习" }).click();

    await expect(page).toHaveURL(/\/practice\?.*keyword=ConcurrentHashMap/);
    await expect(page.getByRole("button", { name: "练习" })).toHaveClass(/active/);

    await page.locator(".options .option").filter({ hasText: "ArrayList" }).click();
    const submitResponsePromise = page.waitForResponse((response) => response.url().includes("/api/practice/submit"));
    await page.locator(".practice-actions .primary-button").click();
    const submitResponse = await submitResponsePromise;
    expect(submitResponse.ok(), await submitResponse.text()).toBe(true);

    await expect(page.locator(".answer-panel[role='status']")).toBeVisible();
    await expect(page.locator(".option.is-wrong")).toContainText("ArrayList");
    await expect(page.locator(".option.is-correct")).toContainText("ConcurrentHashMap");
    await expect(page.locator(".option.is-correct")).toHaveCSS("background-color", "rgb(236, 253, 243)");
    await expect(page.locator(".answer-panel[role='status'] strong")).toHaveCSS("color", "rgb(189, 63, 59)");

    await page.locator(".options .option").filter({ hasText: "ConcurrentHashMap" }).click();
    await expect(page.locator(".practice-resubmit-note")).toContainText("已修改答案，可重新提交");
    await page.locator(".options .option").filter({ hasText: "ArrayList" }).click();
    await expect(page.locator(".answer-panel[role='status']")).toHaveCount(0);
    await expect(page.locator(".option.is-correct")).toHaveCount(0);
    await expect(page.locator(".option.is-wrong")).toHaveCount(0);
    await expect(page.locator(".practice-resubmit-note")).toContainText("已修改答案，可重新提交");
    await page.locator(".options .option").filter({ hasText: "ConcurrentHashMap" }).click();
    const retrySubmitResponsePromise = page.waitForResponse((response) => response.url().includes("/api/practice/submit"));
    await page.locator(".practice-actions .primary-button").click();
    const retrySubmitResponse = await retrySubmitResponsePromise;
    expect(retrySubmitResponse.ok(), await retrySubmitResponse.text()).toBe(true);
    await expect(page.locator(".answer-panel[role='status']")).toContainText("回答正确");

    await page.getByRole("button", { name: "下一题" }).click();
    await expect(page.locator(".question-progress strong")).toContainText(/第 2 \/ \d+ 题/);
    await page.getByRole("button", { name: "上一题" }).click();
    await expect(page.locator(".question-progress strong")).toContainText(/第 1 \/ \d+ 题/);
    await expect(page.locator(".option.is-correct")).toContainText("ConcurrentHashMap");

    await page.getByRole("button", { name: "背诵" }).click();
    await expect(page.getByRole("button", { name: "背诵" })).toHaveClass(/active/);
    await expect(page.locator(".answer-panel[role='status']")).toContainText("答案与解析");
    await expect(page.locator(".option.is-correct")).toContainText("ConcurrentHashMap");

    await page.getByRole("button", { name: "下一题" }).click();
    await expect(page.locator(".question-progress strong")).toContainText(/第 2 \/ \d+ 题/);

    await page.getByRole("button", { name: "上一题" }).click();
    await expect(page.locator(".question-progress strong")).toContainText(/第 1 \/ \d+ 题/);

    await expect(page.getByRole("heading", { name: "快速跳题" })).toBeVisible();
    await page.getByLabel("跳转题号").selectOption("2");
    await expect(page.locator(".question-progress strong")).toContainText(/第 2 \/ \d+ 题/);
    await expect(page.locator(".practice-main .mode-hint")).toContainText("直接显示答案和解析，不写练习记录");
    await expect(page.locator(".side-stack .mode-explainer")).toHaveCount(0);
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

  test("exam starts only after user action, then save-submit works", async ({ page }) => {
    await mockIdentity(page, "learner", "10.42.11.11");
    await page.goto("/exam");

    await expect(page.getByRole("heading", { name: "未启动模拟考" })).toBeVisible();
    await expect(page.locator(".answer-sheet")).toHaveCount(0);
    const filterBox = await requiredBox(page.locator(".exam-start-panel .filter-bar"));
    const actionBox = await requiredBox(page.locator(".exam-start-panel .button-row"));
    expect(actionBox.y - (filterBox.y + filterBox.height)).toBeGreaterThanOrEqual(16);

    const createExamResponsePromise = page.waitForResponse((response) => response.url().includes("/api/exams") && response.request().method() === "POST");
    await page.getByRole("button", { name: "开始模拟考" }).click();
    const createExamResponse = await createExamResponsePromise;
    expect(createExamResponse.ok(), await createExamResponse.text()).toBe(true);
    await expect(page.locator(".exam-layout")).toBeVisible();

    await page.locator(".options .option").nth(1).click();
    await expect(page.locator(".options .option").nth(1)).toHaveClass(/selected/);

    await page.getByRole("button", { name: "提交答案" }).click();
    await expect(page.locator(".autosave-state")).toBeVisible();

    await page.locator(".answer-sheet > .danger-button").click();
    await expect(page.locator(".submit-confirmation[role='alert']")).toBeVisible();
    await expect(page.locator(".submit-confirmation[role='alert']")).toContainText(/还有 \d+ 道题未作答/);
    await expect(page.locator(".submit-confirmation[role='alert'] strong")).toHaveCSS("color", "rgb(189, 63, 59)");
    const continueBox = await requiredBox(page.getByRole("button", { name: "继续答题" }));
    const confirmBox = await requiredBox(page.getByRole("button", { name: "确认交卷" }));
    expect(Math.abs(continueBox.y - confirmBox.y)).toBeLessThanOrEqual(2);
    await page.locator(".submit-confirmation .danger-button").click();

    await expect(page.locator(".answer-panel.review-state")).toBeVisible();
    const reviewTitle = page.locator(".answer-panel.review-state strong");
    await expect(reviewTitle).toContainText(/回答(正确|错误)/);
    await expect(reviewTitle).not.toContainText("复盘结果");
    const reviewTitleText = await reviewTitle.textContent();
    if (reviewTitleText?.includes("错误")) {
      await expect(reviewTitle).toHaveCSS("color", "rgb(189, 63, 59)");
    } else {
      await expect(reviewTitle).toHaveCSS("color", "rgb(32, 136, 90)");
    }
    await expect(page.locator(".exam-result-summary")).toContainText("考试结果");
    await expect(page.locator(".exam-result-summary")).toContainText("正确率");
    await expect(page.locator(".sheet-grid button.correct, .sheet-grid button.wrong").first()).toBeVisible();
    await expect(page.locator(".legend")).toContainText("正确");
    await expect(page.locator(".legend")).toContainText("错误");
    await expect(page.locator(".legend")).not.toContainText("已答");
    await expect(page.locator(".legend")).not.toContainText("当前");
    await expect(page.locator(".legend")).not.toContainText("疑问");
    await expect(page.getByRole("button", { name: "重新模拟考" })).toBeVisible();

    await page.getByRole("link", { name: "练习", exact: true }).click();
    await expect(page).toHaveURL(/\/practice/);
    await page.getByRole("link", { name: "模拟考", exact: true }).click();
    await expect(page.locator(".answer-panel.review-state")).toBeVisible();
    await expect(page.locator(".answer-panel.review-state strong")).toContainText(/回答(正确|错误)/);
    await expect(page.getByRole("button", { name: "重新模拟考" })).toBeVisible();

    await page.getByRole("button", { name: "重新模拟考" }).click();
    await expect(page.getByRole("heading", { name: "未启动模拟考" })).toBeVisible();
    await expect(page.locator(".answer-sheet")).toHaveCount(0);

    const restartExamResponsePromise = page.waitForResponse((response) => response.url().includes("/api/exams") && response.request().method() === "POST");
    await page.getByRole("button", { name: "开始模拟考" }).click();
    const restartExamResponse = await restartExamResponsePromise;
    expect(restartExamResponse.ok(), await restartExamResponse.text()).toBe(true);
    await expect(page.locator(".exam-layout")).toBeVisible();
    await expect(page.locator(".answer-panel.review-state")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "交卷" })).toBeVisible();
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
    await expect(table.locator("thead th")).toHaveCount(6);
    await expect(table).toContainText("10.42.18.36");
    await expect(table.locator(".permission-list span").first()).toBeVisible();
    expect(await table.locator(".permission-list span").count()).toBeGreaterThanOrEqual(10);
    await expect(table).toContainText("系统配置");
    await expect(table).not.toContainText("配置重载");
  });
});

async function mockIdentity(page: Page, role: TestRole, ipOverride?: string) {
  const ip = ipOverride ?? (role === "learner" ? "10.42.11.10" : role === "content_admin" ? "10.42.20.17" : "10.42.18.36");
  await page.route("**/api/**", async (route) => {
    const headers = { ...route.request().headers(), "x-forwarded-for": ip };
    const pathname = new URL(route.request().url()).pathname;

    if (pathname === "/api/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ip,
          role,
          roleLabel: role,
          permissions: []
        })
      });
      return;
    }

    await route.continue({ headers });
  });
}

async function getQuestionList(request: APIRequestContext, type: QuestionType): Promise<QuestionListResponse> {
  const response = await request.get(
    `${API_BASE_URL}/api/questions?subject=programming&language=java&level=working&type=${type}&pageSize=100`
  );
  expect(response.ok()).toBe(true);
  return (await response.json()) as QuestionListResponse;
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
