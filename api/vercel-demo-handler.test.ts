import { afterEach, beforeEach, describe, expect, it } from "vitest";
import handler from "./[...path]";

class MockResponse {
  statusCode = 200;
  headers = new Map<string, string>();
  body = "";

  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
  }

  end(value?: string) {
    this.body = value ?? "";
  }
}

describe("Vercel API demo fallback", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("returns demo dashboard data when no remote database is configured", async () => {
    const response = new MockResponse();

    await handler({ method: "GET", url: "/api/dashboard" }, response);

    expect(response.statusCode).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(JSON.parse(response.body)).toMatchObject({
      today: { answered: expect.any(Number), correct: expect.any(Number), incorrect: expect.any(Number), correctRate: expect.any(Number) },
      mistakes: { unmastered: expect.any(Number) },
      coverage: expect.any(Array)
    });
  });

  it("returns a learner identity when no remote database is configured", async () => {
    const response = new MockResponse();

    await handler({ method: "GET", url: "/api/me" }, response);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      ip: "demo",
      role: "system_admin",
      permissions: expect.arrayContaining(["question:browse", "practice:use", "ip_role:write", "data:clear"])
    });
  });

  it("keeps the health check green when no remote database is configured", async () => {
    const response = new MockResponse();

    await handler({ method: "GET", url: "/api/health" }, response);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: "ok", mode: "demo" });
  });

  it("serves learner page data without a remote database", async () => {
    await expectJson("GET", "/api/questions?page=1&pageSize=100", {
      items: expect.arrayContaining([
        expect.objectContaining({ id: "EX-PROG-JAVA-WRK-S-001-001", sourceCode: "EX-PROG-JAVA-WRK-S-001-001" })
      ]),
      page: 1,
      pageSize: 100,
      total: 600
    });

    await expectJson("GET", "/api/questions?subject=programming&language=java&level=working&type=single&page=1&pageSize=100", {
      items: expect.arrayContaining([expect.objectContaining({ subject: "programming", language: "java", level: "working", type: "single" })]),
      total: 28
    });

    await expectJson("GET", "/api/questions/EX-PROG-JAVA-WRK-S-001-001", {
      id: "EX-PROG-JAVA-WRK-S-001-001",
      stemHtml: expect.stringContaining("<p>"),
      options: expect.any(Array)
    });
    await expectJson("GET", "/api/questions/EX-PROG-JAVA-WRK-S-001-001/recite", {
      id: "EX-PROG-JAVA-WRK-S-001-001",
      correctAnswers: expect.arrayContaining(["D"])
    });
    await expectJson("GET", "/api/review/mistakes", { items: expect.any(Array) });
    await expectJson("GET", "/api/review/bookmarks", { items: expect.any(Array) });
    await expectJson("GET", "/api/review/records", { items: expect.any(Array) });
  });

  it("serves exam and admin page data without a remote database", async () => {
    await expectJson("GET", "/api/exams", { items: expect.any(Array) });
    await expectJson("GET", "/api/exams/demo-exam-1", {
      id: "demo-exam-1",
      questions: expect.any(Array)
    });
    await expectJson("GET", "/api/admin/stats", {
      questions: expect.objectContaining({ total: 600 }),
      trends: expect.any(Object)
    });
    await expectJson("GET", "/api/admin/settings/ip-role-bindings", {
      headers: expect.any(Array),
      items: expect.any(Array)
    });
  });

  it("accepts demo write actions used by the preview pages", async () => {
    await expectJson("POST", "/api/practice/submit", {
      attemptId: expect.any(String),
      correctAnswers: expect.arrayContaining(["D"])
    });
    await expectJson("POST", "/api/bookmarks/demo-q-1", { id: expect.any(String) });
    await expectJson("DELETE", "/api/bookmarks/demo-q-1", { deleted: true });
    await expectJson("PATCH", "/api/review/mistakes/demo-mistake-1", {
      id: "demo-mistake-1",
      isMastered: true
    });
    await expectJson("POST", "/api/exams", {
      id: "demo-exam-active",
      status: "in_progress"
    });
    await expectJson("PATCH", "/api/exams/demo-exam-active/answers", {
      id: "demo-exam-active",
      answers: expect.any(Object)
    });
    await expectJson("POST", "/api/exams/demo-exam-active/submit", {
      id: "demo-exam-active",
      status: "submitted"
    });
    await expectJson("POST", "/api/admin/settings/data-clear", {
      scope: "activity",
      result: "success"
    });
  });
});

async function expectJson(method: string, url: string, expected: unknown) {
  const response = new MockResponse();

  await handler({ method, url }, response);

  expect(response.statusCode).toBeGreaterThanOrEqual(200);
  expect(response.statusCode).toBeLessThan(300);
  expect(JSON.parse(response.body)).toMatchObject(expected);
}
