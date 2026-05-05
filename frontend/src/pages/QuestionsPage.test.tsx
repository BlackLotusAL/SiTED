import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { apiClient } from "../api/client";
import { QuestionsPage } from "./QuestionsPage";

vi.mock("../api/client", () => ({
  apiClient: {
    get: vi.fn()
  }
}));

describe("QuestionsPage", () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === "/questions/q-1") {
        return detail("q-1", "Real detail one", "First option");
      }
      if (path === "/questions/q-2") {
        return detail("q-2", "Real detail two", "Second option");
      }
      if (path.startsWith("/questions?")) {
        const params = new URL(path, "http://local").searchParams;
        if (params.get("page") === "2") {
          return {
            items: [listItem("q-2", "Real question two")],
            page: 2,
            pageSize: 100,
            total: 101
          };
        }
        return {
          items: [listItem("q-1", "Real question one")],
          page: 1,
          pageSize: 100,
          total: 101
        };
      }
      throw new Error(`Unexpected API path: ${path}`);
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads every matching real question page and previews the selected question detail", async () => {
    render(
      <MemoryRouter>
        <QuestionsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Real question one")).toBeInTheDocument();
    expect(await screen.findByText("Real question two")).toBeInTheDocument();
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith(expect.stringContaining("pageSize=100"));
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith(expect.stringContaining("page=2"));

    fireEvent.click(screen.getByText("Real question two"));

    const preview = await screen.findByLabelText("题目预览");
    await waitFor(() => expect(within(preview).getByText("Real detail two")).toBeInTheDocument());
    expect(within(preview).getByText("A. Second option")).toBeInTheDocument();
    expect(within(preview).queryByText("正确答案")).not.toBeInTheDocument();
  });
});

function listItem(id: string, stemMd: string) {
  return {
    id,
    sourceCode: id.toUpperCase(),
    subject: "programming",
    language: "java",
    level: "working",
    type: "single",
    stemMd,
    memo: "Real memo",
    tags: ["real", "concurrency"],
    totalAttempts: 4,
    correctAttempts: 2,
    correctRate: 50
  };
}

function detail(id: string, stem: string, option: string) {
  return {
    id,
    stemHtml: `<p>${stem}</p>`,
    explanationHtml: "<p>Explanation</p>",
    source: {
      subject: "programming",
      language: "java",
      level: "working",
      type: "single",
      sourceCode: id.toUpperCase()
    },
    options: [
      { key: "A", text: option },
      { key: "B", text: "Other option" }
    ],
    memo: "Real memo",
    tags: ["real", "concurrency"],
    stats: { totalAttempts: 4, correctAttempts: 2, correctRate: 50 }
  };
}
