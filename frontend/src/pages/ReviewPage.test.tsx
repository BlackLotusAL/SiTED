import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StrictMode } from "react";
import { apiClient } from "../api/client";
import type { ReviewBookmarkItem, ReviewExamRecord, ReviewMistakeItem } from "../api/types";
import { ReviewPage } from "./ReviewPage";

vi.mock("../api/client", () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

describe("ReviewPage", () => {
  let mistakes: ReviewMistakeItem[];
  let bookmarks: ReviewBookmarkItem[];
  let records: ReviewExamRecord[];

  beforeEach(() => {
    mistakes = [mistakeItem()];
    bookmarks = [bookmarkItem()];
    records = [examRecord()];

    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.patch).mockReset();
    vi.mocked(apiClient.delete).mockReset();
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === "/review/mistakes") {
        return { items: mistakes };
      }
      if (path === "/review/bookmarks") {
        return { items: bookmarks };
      }
      if (path === "/review/records") {
        return {
          items: records,
          practice: { items: [{ id: "pa-legacy", question: questionSummary("q-legacy", "Legacy practice row") }] }
        };
      }
      throw new Error(`Unexpected API path: ${path}`);
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads real mistakes and wires mastery and removal actions", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(mistakeItem({ isMastered: true, masteryStatus: { code: "mastered", label: "已掌握", color: "success" } }));
    vi.mocked(apiClient.patch).mockResolvedValueOnce(mistakeItem({ isMastered: false, masteryStatus: { code: "unmastered", label: "未掌握", color: "danger" } }));
    vi.mocked(apiClient.delete).mockResolvedValue({ deleted: true });

    renderReview();

    expect(await screen.findByText("Volatile atomicity question")).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith("/review/mistakes");
    expect(screen.getByRole("link", { name: "重练" })).toHaveAttribute("href", "/practice?questionId=q-1");

    fireEvent.click(screen.getByRole("button", { name: "标记掌握" }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith("/review/mistakes/m-1", { isMastered: true }));
    expect(await screen.findByText("已掌握")).toHaveClass("success");

    fireEvent.click(screen.getByRole("button", { name: "取消掌握" }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith("/review/mistakes/m-1", { isMastered: false }));
    expect(await screen.findByText("未掌握")).toHaveClass("needs-work");

    fireEvent.click(screen.getByRole("button", { name: "移除错题" }));
    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith("/review/mistakes/m-1"));
    expect(screen.queryByText("Volatile atomicity question")).not.toBeInTheDocument();
  });

  it("loads data under React StrictMode remounts", async () => {
    renderReview({ strict: true });

    expect(await screen.findByText("Volatile atomicity question")).toBeInTheDocument();
  });

  it("loads bookmarks, supports practice and recite links, edits metadata, and cancels bookmarks", async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ id: "b-1", questionId: "q-2", note: "focus", tags: ["java", "review"] });
    vi.mocked(apiClient.delete).mockResolvedValue({ deleted: true });

    renderReview();

    fireEvent.click(screen.getByRole("tab", { name: "收藏" }));

    expect(await screen.findByText("SQL injection boundary question")).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith("/review/bookmarks");
    expect(screen.getByRole("link", { name: "练习" })).toHaveAttribute("href", "/practice?questionId=q-2");
    expect(screen.getByRole("link", { name: "背诵" })).toHaveAttribute("href", "/practice?mode=recite&questionId=q-2");

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("备注"), { target: { value: "  focus  " } });
    fireEvent.change(screen.getByLabelText("标签"), { target: { value: "java, review" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith("/bookmarks/q-2", {
        note: "focus",
        tags: ["java", "review"]
      })
    );
    expect(await screen.findByText("focus")).toBeInTheDocument();
    expect(screen.getByText("java / review")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "取消收藏" }));
    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith("/bookmarks/q-2"));
    expect(screen.queryByText("SQL injection boundary question")).not.toBeInTheDocument();
  });

  it("loads only mock exam records and links to the exam review page", async () => {
    renderReview();

    fireEvent.click(screen.getByRole("tab", { name: "记录" }));

    const recordsPanel = await screen.findByLabelText("模拟考记录");
    expect(within(recordsPanel).getByText(/模拟考/)).toBeInTheDocument();
    expect(within(recordsPanel).getByText("88% · 已通过")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看复盘" })).toHaveAttribute("href", "/exam?examId=exam-1");
    expect(screen.queryByText("Legacy practice row")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "查看题目" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "再练一次" })).not.toBeInTheDocument();
  });

  it("paginates mistakes, bookmarks, and mock exam records with shared controls", async () => {
    mistakes = Array.from({ length: 12 }, (_value, index) =>
      mistakeItem({
        id: `m-${index + 1}`,
        questionId: `q-m-${index + 1}`,
        question: questionSummary(`q-m-${index + 1}`, `Mistake question ${index + 1}`)
      })
    );
    bookmarks = Array.from({ length: 12 }, (_value, index) =>
      bookmarkItem({
        id: `b-${index + 1}`,
        questionId: `q-b-${index + 1}`,
        question: questionSummary(`q-b-${index + 1}`, `Bookmark question ${index + 1}`)
      })
    );
    records = Array.from({ length: 12 }, (_value, index) =>
      examRecord({
        id: `exam-${index + 1}`,
        scorePercent: index + 1,
        isPassed: false,
        submittedAt: `2026-05-05T${String(index).padStart(2, "0")}:00:00.000Z`
      })
    );

    renderReview();

    const mistakesPanel = await screen.findByLabelText("错题列表");
    expect(within(mistakesPanel).getByText("Mistake question 10")).toBeInTheDocument();
    expect(within(mistakesPanel).queryByText("Mistake question 11")).not.toBeInTheDocument();
    fireEvent.click(within(mistakesPanel).getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("Mistake question 11")).toBeInTheDocument();
    fireEvent.click(within(mistakesPanel).getByRole("button", { name: "上一页" }));
    expect(await screen.findByText("Mistake question 1")).toBeInTheDocument();
    fireEvent.change(within(mistakesPanel).getByLabelText("每页数量"), { target: { value: "20" } });
    expect(await screen.findByText("Mistake question 12")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "收藏" }));
    const bookmarksPanel = await screen.findByLabelText("收藏列表");
    expect(within(bookmarksPanel).getByText("Bookmark question 10")).toBeInTheDocument();
    expect(within(bookmarksPanel).queryByText("Bookmark question 11")).not.toBeInTheDocument();
    fireEvent.click(within(bookmarksPanel).getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("Bookmark question 11")).toBeInTheDocument();
    fireEvent.change(within(bookmarksPanel).getByLabelText("每页数量"), { target: { value: "20" } });
    expect(await screen.findByText("Bookmark question 12")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "记录" }));
    const recordsPanel = await screen.findByLabelText("模拟考记录");
    expect(within(recordsPanel).getByText("10% · 未通过")).toBeInTheDocument();
    expect(within(recordsPanel).queryByText("11% · 未通过")).not.toBeInTheDocument();
    fireEvent.click(within(recordsPanel).getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("11% · 未通过")).toBeInTheDocument();
    fireEvent.change(within(recordsPanel).getByLabelText("每页数量"), { target: { value: "20" } });
    expect(await screen.findByText("12% · 未通过")).toBeInTheDocument();
  });

  it("clamps the current page after removing the only row on the last mistakes page", async () => {
    mistakes = Array.from({ length: 11 }, (_value, index) =>
      mistakeItem({
        id: `m-${index + 1}`,
        questionId: `q-m-${index + 1}`,
        question: questionSummary(`q-m-${index + 1}`, `Mistake question ${index + 1}`)
      })
    );
    vi.mocked(apiClient.delete).mockResolvedValue({ deleted: true });

    renderReview();

    const panel = await screen.findByLabelText("错题列表");
    fireEvent.click(within(panel).getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("Mistake question 11")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "移除错题" }));

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith("/review/mistakes/m-11"));
    await waitFor(() => expect(screen.queryByText("Mistake question 11")).not.toBeInTheDocument());
    expect(await screen.findByText("Mistake question 10")).toBeInTheDocument();
    expect(screen.getByText("第 1 / 1 页")).toBeInTheDocument();
  });

  it("clamps the current page after cancelling the only bookmark on the last page", async () => {
    bookmarks = Array.from({ length: 11 }, (_value, index) =>
      bookmarkItem({
        id: `b-${index + 1}`,
        questionId: `q-b-${index + 1}`,
        question: questionSummary(`q-b-${index + 1}`, `Bookmark question ${index + 1}`)
      })
    );
    vi.mocked(apiClient.delete).mockResolvedValue({ deleted: true });

    renderReview();
    fireEvent.click(screen.getByRole("tab", { name: "收藏" }));

    const panel = await screen.findByLabelText("收藏列表");
    fireEvent.click(within(panel).getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("Bookmark question 11")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消收藏" }));

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith("/bookmarks/q-b-11"));
    await waitFor(() => expect(screen.queryByText("Bookmark question 11")).not.toBeInTheDocument());
    expect(await screen.findByText("Bookmark question 10")).toBeInTheDocument();
    expect(screen.getByText("第 1 / 1 页")).toBeInTheDocument();
  });

  it("shows empty and error states from real API responses", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ items: [] });
    renderReview();

    expect(await screen.findByText("暂无错题记录。")).toBeInTheDocument();

    cleanup();
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error("network"));
    renderReview();

    expect(await screen.findByRole("alert")).toHaveTextContent("复习数据加载失败");
  });
});

function renderReview(options: { strict?: boolean } = {}) {
  const tree = (
    <MemoryRouter>
      <ReviewPage />
    </MemoryRouter>
  );

  return render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
}

function bookmarkItem(overrides: Partial<ReviewBookmarkItem> = {}): ReviewBookmarkItem {
  return {
    id: "b-1",
    questionId: "q-2",
    note: null,
    tags: [],
    createdAt: "2026-05-05T02:00:00.000Z",
    question: questionSummary("q-2", "SQL injection boundary question"),
    ...overrides
  };
}

function examRecord(overrides: Partial<ReviewExamRecord> = {}): ReviewExamRecord {
  return {
    kind: "exam",
    id: "exam-1",
    subject: "programming",
    language: "java",
    level: "working",
    status: "submitted",
    scorePercent: 88,
    isPassed: true,
    startedAt: "2026-05-05T01:00:00.000Z",
    deadlineAt: "2026-05-05T01:45:00.000Z",
    submittedAt: "2026-05-05T01:30:00.000Z",
    ...overrides
  };
}

function mistakeItem(overrides: Partial<ReviewMistakeItem> = {}): ReviewMistakeItem {
  return {
    id: "m-1",
    questionId: "q-1",
    wrongCount: 4,
    consecutiveCorrectCount: 0,
    isMastered: false,
    lastWrongAt: "2026-05-05T02:00:00.000Z",
    masteredAt: null,
    masteryStatus: { code: "unmastered", label: "未掌握", color: "danger" },
    question: questionSummary("q-1", "Volatile atomicity question"),
    ...overrides
  };
}

function questionSummary(id: string, stemMd: string) {
  return {
    id,
    sourceCode: "SRC-1",
    subject: "programming",
    language: "java",
    level: "working",
    type: "single",
    stemMd,
    memo: null,
    tags: ["review"],
    status: "published",
    stats: { totalAttempts: 2, correctAttempts: 1, correctRate: 50 }
  };
}
