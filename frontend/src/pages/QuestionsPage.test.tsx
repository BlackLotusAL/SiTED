import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { apiClient } from "../api/client";
import { QuestionsPage } from "./QuestionsPage";

vi.mock("../api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn()
  }
}));

describe("QuestionsPage", () => {
  let bookmarkedQuestionIds: string[];

  beforeEach(() => {
    localStorage.clear();
    bookmarkedQuestionIds = ["q-1"];

    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(apiClient.delete).mockReset();
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === "/review/bookmarks") {
        return {
          items: bookmarkedQuestionIds.map((questionId) => ({
            id: `bookmark-${questionId}`,
            questionId,
            note: null,
            tags: [],
            createdAt: "2026-05-05T02:00:00.000Z",
            question: listItem(questionId, questionId)
          }))
        };
      }
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
    vi.mocked(apiClient.post).mockResolvedValue({ id: "bookmark-q-2" });
    vi.mocked(apiClient.delete).mockResolvedValue({ deleted: true });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("loads every matching real question page and previews the selected question detail", async () => {
    renderQuestionsPage();

    expect(await screen.findByText("Real question one")).toBeInTheDocument();
    expect(await screen.findByText("Real question two")).toBeInTheDocument();
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/review/bookmarks");
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith(expect.stringContaining("pageSize=100"));
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith(expect.stringContaining("page=2"));

    fireEvent.click(screen.getByText("Real question two"));

    const preview = await screen.findByLabelText("题目预览");
    await waitFor(() => expect(within(preview).getByText("Real detail two")).toBeInTheDocument());
    expect(within(preview).getByText("Real detail two").closest(".question-stem-preview")).not.toBeNull();
    expect(within(preview).getByText("A. Second option")).toBeInTheDocument();
    expect(within(preview).queryByText("正确答案")).not.toBeInTheDocument();
  });

  it("deduplicates repeated question ids from paginated responses", async () => {
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === "/review/bookmarks") {
        return { items: [] };
      }
      if (path === "/questions/q-1") {
        return detail("q-1", "Real detail one", "First option");
      }
      if (path.startsWith("/questions?")) {
        const params = new URL(path, "http://local").searchParams;
        return {
          items: [listItem("q-1", params.get("page") === "2" ? "Duplicate question one" : "Real question one")],
          page: Number(params.get("page") ?? 1),
          pageSize: 100,
          total: 101
        };
      }
      throw new Error(`Unexpected API path: ${path}`);
    });

    renderQuestionsPage();

    expect(await screen.findByText("Real question one")).toBeInTheDocument();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining("page=2")));
    expect(screen.queryByText("Duplicate question one")).not.toBeInTheDocument();
  });

  it("defaults every filter to all and omits all filter values from the request", async () => {
    renderQuestionsPage();

    expect(await screen.findByText("Real question one")).toBeInTheDocument();
    expect(screen.getByLabelText("科目")).toHaveValue("all");
    expect(screen.getByLabelText("语言")).toHaveValue("all");
    expect(screen.getByLabelText("级别")).toHaveValue("all");
    expect(screen.getByLabelText("题型")).toHaveValue("all");

    const listRequest = vi.mocked(apiClient.get).mock.calls.find(([path]) => path.startsWith("/questions?"))?.[0] ?? "";
    const params = new URL(listRequest, "http://local").searchParams;
    expect(params.get("subject")).toBeNull();
    expect(params.get("language")).toBeNull();
    expect(params.get("level")).toBeNull();
    expect(params.get("type")).toBeNull();
  });

  it("ignores the old v1 filter cache so legacy defaults do not override all", async () => {
    localStorage.setItem(
      "sited.questions.filters.v1",
      JSON.stringify({ subject: "programming", language: "java", level: "working", type: "single", keyword: "legacy" })
    );

    renderQuestionsPage();

    expect(await screen.findByText("Real question one")).toBeInTheDocument();
    expect(screen.getByLabelText("科目")).toHaveValue("all");
    expect(screen.getByLabelText("关键词")).toHaveValue("");
    expect(localStorage.getItem("sited.questions.filters.v2")).toContain('"subject":"all"');
  });

  it("persists filters locally and restores them after navigating away and back", async () => {
    const { unmount } = render(
      <MemoryRouter>
        <QuestionsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Real question one")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("题型"), { target: { value: "multiple" } });
    fireEvent.change(screen.getByLabelText("关键词"), { target: { value: "security" } });

    await waitFor(() =>
      expect(localStorage.getItem("sited.questions.filters.v2")).toBe(
        JSON.stringify({
          subject: "all",
          language: "all",
          level: "all",
          type: "multiple",
          keyword: "security"
        })
      )
    );

    unmount();
    vi.mocked(apiClient.get).mockClear();

    render(
      <MemoryRouter>
        <QuestionsPage />
      </MemoryRouter>
    );

    expect(screen.getByLabelText("题型")).toHaveValue("multiple");
    expect(screen.getByLabelText("关键词")).toHaveValue("security");
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining("type=multiple")));
    expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining("keyword=security"));
  });

  it("offers only the four P0 training languages", async () => {
    renderQuestionsPage();

    await screen.findByText("Real question one");

    const languageSelect = screen.getByLabelText("语言");
    expect(within(languageSelect).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "全部",
      "C",
      "C++",
      "Python",
      "Java"
    ]);
    expect(within(languageSelect).queryByRole("option", { name: "JavaScript" })).not.toBeInTheDocument();
    expect(within(languageSelect).queryByRole("option", { name: "Go" })).not.toBeInTheDocument();
  });

  it("initializes bookmark state and keeps list and preview bookmark buttons in sync", async () => {
    renderQuestionsPage();

    const bookmarkedListButton = await screen.findByRole("button", { name: "取消收藏：Real question one" });
    expect(bookmarkedListButton).toHaveAttribute("aria-pressed", "true");
    expectBookmarkIcon(bookmarkedListButton, "filled");
    const bookmarkedPreviewButton = await screen.findByRole("button", { name: "取消收藏题目" });
    expect(bookmarkedPreviewButton).toHaveAttribute("aria-pressed", "true");
    expectBookmarkIcon(bookmarkedPreviewButton, "filled");

    fireEvent.click(screen.getByText("Real question two"));
    const unbookmarkedListButton = await screen.findByRole("button", { name: "收藏：Real question two" });
    expect(unbookmarkedListButton).toHaveAttribute("aria-pressed", "false");
    expectBookmarkIcon(unbookmarkedListButton, "outline");
    const previewBookmarkButton = await screen.findByRole("button", { name: "收藏题目" });
    expectBookmarkIcon(previewBookmarkButton, "outline");
    fireEvent.click(previewBookmarkButton);

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/bookmarks/q-2", {}));
    const newlyBookmarkedListButton = await screen.findByRole("button", { name: "取消收藏：Real question two" });
    expect(newlyBookmarkedListButton).toHaveAttribute("aria-pressed", "true");
    expectBookmarkIcon(newlyBookmarkedListButton, "filled");
    const newlyBookmarkedPreviewButton = screen.getByRole("button", { name: "取消收藏题目" });
    expect(newlyBookmarkedPreviewButton).toHaveAttribute("aria-pressed", "true");
    expectBookmarkIcon(newlyBookmarkedPreviewButton, "filled");

    fireEvent.click(screen.getByRole("button", { name: "取消收藏：Real question two" }));
    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith("/bookmarks/q-2"));
    const restoredListButton = await screen.findByRole("button", { name: "收藏：Real question two" });
    expect(restoredListButton).toHaveAttribute("aria-pressed", "false");
    expectBookmarkIcon(restoredListButton, "outline");
  });

  it("shows an inline alert when a bookmark API call fails", async () => {
    bookmarkedQuestionIds = [];
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error("network"));

    renderQuestionsPage();

    const listButton = await screen.findByRole("button", { name: "收藏：Real question one" });
    fireEvent.click(listButton);

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/bookmarks/q-1", {}));
    expect(await screen.findByRole("alert")).toHaveTextContent("收藏操作失败，请稍后重试。");
    expect(screen.getByRole("button", { name: "收藏：Real question one" })).toHaveAttribute("aria-pressed", "false");
  });
});

function renderQuestionsPage() {
  return render(
    <MemoryRouter>
      <QuestionsPage />
    </MemoryRouter>
  );
}

function expectBookmarkIcon(button: HTMLElement, state: "filled" | "outline") {
  const icon = button.querySelector(".lucide-bookmark");
  expect(icon).not.toBeNull();
  if (icon === null) {
    return;
  }
  expect(icon).toHaveAttribute("fill", state === "filled" ? "currentColor" : "none");
}

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
