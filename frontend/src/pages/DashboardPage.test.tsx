import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { apiClient } from "../api/client";
import { DashboardPage } from "./DashboardPage";

vi.mock("../api/client", () => ({
  apiClient: {
    get: vi.fn()
  }
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockResolvedValue({
      today: { answered: 0, correct: 0, incorrect: 0, correctRate: 0 },
      mistakes: { unmastered: 0 },
      latestExam: null,
      calendar: {
        year: 2026,
        month: 5,
        total: 0,
        days: Array.from({ length: 31 }, (_value, index) => ({ day: index + 1, count: 0 }))
      },
      coverage: [
        { subject: "programming", count: 600 },
        { subject: "security_privacy", count: 0 },
        { subject: "refactoring", count: 0 }
      ]
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders real dashboard summary without mock activity fallback", async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "先从题库筛选练习" })).toBeInTheDocument();
    expect(screen.getByText("暂无记录")).toBeInTheDocument();
    expect(screen.getByText("600 题")).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith("/dashboard");
    expect(screen.queryByText("今天已完成 28 道题")).not.toBeInTheDocument();
    expect(screen.queryByText("82%")).not.toBeInTheDocument();
  });
});
