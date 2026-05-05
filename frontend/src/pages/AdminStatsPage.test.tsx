import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminStatsPage } from "./AdminStatsPage";

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn()
}));

vi.mock("../api/client", () => ({
  apiClient: apiClientMock
}));

describe("AdminStatsPage", () => {
  afterEach(() => {
    cleanup();
    apiClientMock.get.mockReset();
  });

  it("loads the operation dashboard from the admin stats API", async () => {
    apiClientMock.get.mockResolvedValue({
      questions: {
        total: 46,
        published: 44,
        bySubject: [
          { subject: "programming", count: 21 },
          { subject: "security_privacy", count: 14 },
          { subject: "refactoring", count: 11 }
        ]
      },
      lowCorrectRateQuestions: [
        {
          id: "q-low",
          sourceCode: null,
          subject: "programming",
          language: "java",
          level: "working",
          type: "single",
          stemMd: "真实低正确率题目 A",
          totalAttempts: 4,
          correctAttempts: 1,
          correctRate: 99
        }
      ],
      today: {
        visitors: 4,
        practiceQuestions: 9,
        exams: 2
      },
      trends: {
        visitors: [
          { date: "2026-04-29", count: 1 },
          { date: "2026-04-30", count: 2 },
          { date: "2026-05-01", count: 2 },
          { date: "2026-05-02", count: 3 },
          { date: "2026-05-03", count: 3 },
          { date: "2026-05-04", count: 3 },
          { date: "2026-05-05", count: 4 }
        ],
        practiceQuestions: [
          { date: "2026-04-29", count: 2 },
          { date: "2026-04-30", count: 3 },
          { date: "2026-05-01", count: 4 },
          { date: "2026-05-02", count: 5 },
          { date: "2026-05-03", count: 6 },
          { date: "2026-05-04", count: 7 },
          { date: "2026-05-05", count: 9 }
        ],
        exams: [
          { date: "2026-04-29", count: 0 },
          { date: "2026-04-30", count: 1 },
          { date: "2026-05-01", count: 0 },
          { date: "2026-05-02", count: 1 },
          { date: "2026-05-03", count: 1 },
          { date: "2026-05-04", count: 1 },
          { date: "2026-05-05", count: 2 }
        ]
      }
    });

    render(<AdminStatsPage />);

    expect(await screen.findAllByText("46")).toHaveLength(2);
    expect(apiClientMock.get).toHaveBeenCalledWith("/admin/stats");
    expect(screen.getByText("已发布 44")).toBeInTheDocument();
    expect(screen.getByText("较昨日 +1")).toBeInTheDocument();
    expect(screen.getByText("人均 2.3 题")).toBeInTheDocument();
    expect(screen.getByText("今日记录")).toBeInTheDocument();
    expect(screen.getByText("真实低正确率题目 A")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.queryByText("99%")).not.toBeInTheDocument();
    expect(screen.queryByText("12,486")).not.toBeInTheDocument();
    expect(screen.queryByText("1,284")).not.toBeInTheDocument();
  });
});
