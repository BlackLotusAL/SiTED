import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { apiClient } from "../api/client";
import type { PracticeSubmitResponse } from "../api/types";
import { PracticePage } from "./PracticePage";

vi.mock("../api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

describe("PracticePage", () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === "/questions/q-1") {
        return questionDetail("q-1", "Practice question", false);
      }
      if (path === "/questions/q-2") {
        return questionDetail("q-2", "Second practice question", false);
      }
      if (path === "/questions/q-1/recite") {
        return questionDetail("q-1", "Practice question", true);
      }
      if (path === "/questions/q-2/recite") {
        return questionDetail("q-2", "Second practice question", true);
      }
      if (path.startsWith("/questions?")) {
        return { items: [questionListItem("q-1", "Practice question"), questionListItem("q-2", "Second practice question")], page: 1, pageSize: 100, total: 2 };
      }
      throw new Error(`Unexpected API path: ${path}`);
    });
    vi.mocked(apiClient.post).mockResolvedValue({
      attemptId: "attempt-1",
      questionId: "q-1",
      submittedAnswers: ["B"],
      correctAnswers: ["A"],
      isCorrect: false,
      explanationMd: "Use the correct option.",
      memo: "Real memo",
      masteryStatus: { code: "unmastered", label: "未掌握", color: "danger" }
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads filtered real questions and submits practice answers to the backend", async () => {
    renderPractice("/practice?subject=programming&language=java&level=working&type=single&keyword=concurrency");

    expect(await screen.findByText("Practice question")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /B Wrong option/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交答案" }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith("/practice/submit", {
        questionId: "q-1",
        submittedAnswers: ["B"]
      })
    );
    const wrongPanel = await screen.findByRole("status");
    expect(wrongPanel).toHaveTextContent("回答错误");
    expect(wrongPanel).toHaveClass("result-wrong");
    expect(screen.getByRole("button", { name: /A Correct option.*正确答案/ })).toHaveClass("is-correct");
  });

  it("allows incorrect practice answers to be changed and submitted again", async () => {
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce(practiceSubmitResponse({ submittedAnswers: ["B"], isCorrect: false }))
      .mockResolvedValueOnce(practiceSubmitResponse({ submittedAnswers: ["A"], isCorrect: true }));

    renderPractice("/practice?subject=programming&language=java&level=working&type=single&keyword=concurrency");

    expect(await screen.findByText("Practice question")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /B Wrong option/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交答案" }));

    expect(await screen.findByRole("status")).toHaveTextContent("回答错误");
    fireEvent.click(screen.getByRole("button", { name: /A Correct option.*正确答案/ }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("已修改答案，可重新提交")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /B Wrong option/ }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /A Correct option/ })).not.toHaveClass("is-correct");
    expect(screen.getByRole("button", { name: /B Wrong option/ })).not.toHaveClass("is-wrong");
    expect(screen.getByText("已修改答案，可重新提交")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /A Correct option/ }));

    fireEvent.click(screen.getByRole("button", { name: "提交答案" }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    expect(apiClient.post).toHaveBeenLastCalledWith("/practice/submit", {
      questionId: "q-1",
      submittedAnswers: ["A"]
    });
    const correctPanel = await screen.findByRole("status");
    expect(correctPanel).toHaveTextContent("回答正确");
    expect(correctPanel).toHaveClass("result-correct");
  });

  it("shows recite answers directly without writing a practice attempt", async () => {
    renderPractice("/practice?mode=recite&questionId=q-1");

    expect(await screen.findByText("Practice question")).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith("/questions/q-1/recite");
    expect(screen.getByRole("status")).toHaveTextContent("答案与解析");
    expect(screen.getByRole("status")).toHaveClass("result-correct");
    expect(screen.getByRole("button", { name: /A Correct option.*正确答案/ })).toHaveClass("is-correct");
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("lets recite mode move through the filtered real question sequence", async () => {
    renderPractice("/practice?mode=recite&subject=programming&language=java&level=working&type=single&keyword=concurrency");

    expect(await screen.findByText("Practice question")).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith("/questions/q-1/recite");

    const nextButton = screen.getByRole("button", { name: "下一题" });
    expect(nextButton).not.toHaveTextContent("下一题");
    expect(nextButton.querySelector("svg")).not.toBeNull();

    fireEvent.click(nextButton);

    expect(await screen.findByText("Second practice question")).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith("/questions/q-2/recite");

    const previousButton = screen.getByRole("button", { name: "上一题" });
    expect(previousButton).not.toHaveTextContent("上一题");
    expect(previousButton.querySelector("svg")).not.toBeNull();

    fireEvent.click(previousButton);

    expect(await screen.findByText("Practice question")).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("lets practice mode move backward, forward, and jump directly to a question number", async () => {
    renderPractice("/practice?subject=programming&language=java&level=working&type=single&keyword=concurrency");

    expect(await screen.findByText("Practice question")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "快速跳题" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("跳转题号"), { target: { value: "2" } });

    expect(await screen.findByText("Second practice question")).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith("/questions/q-2");

    fireEvent.click(screen.getByRole("button", { name: "上一题" }));

    expect(await screen.findByText("Practice question")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一题" }));

    expect(await screen.findByText("Second practice question")).toBeInTheDocument();

    const submitButton = screen.getByRole("button", { name: "提交答案" });
    expect(submitButton.closest(".practice-answer-actions")).not.toBeNull();
    expect(submitButton.querySelector("svg")).not.toBeNull();
  });

  it("preserves each question's selected answer and last submission when navigating", async () => {
    renderPractice("/practice?subject=programming&language=java&level=working&type=single&keyword=concurrency");

    expect(await screen.findByText("Practice question")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /B Wrong option/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交答案" }));
    expect(await screen.findByRole("status")).toHaveTextContent("回答错误");

    fireEvent.click(screen.getByRole("button", { name: "下一题" }));
    expect(await screen.findByText("Second practice question")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "上一题" }));
    expect(await screen.findByText("Practice question")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /B Wrong option.*已选择.*回答错误/ })).toHaveClass("is-wrong");
    expect(screen.getByRole("status")).toHaveTextContent("回答错误");
  });

  it("describes the two modes beside the mode switch and removes the side explanation card", async () => {
    renderPractice("/practice?mode=recite&subject=programming&language=java&level=working&type=single&keyword=concurrency");

    expect(await screen.findByText("直接显示答案和解析，不写练习记录")).toBeInTheDocument();
    expect(screen.getByText("直接显示答案和解析，不写练习记录").closest(".panel-heading")).not.toBeNull();
    expect(screen.queryByText("背诵模式")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "模式说明" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "练习" }));

    const practiceHint = await screen.findByText("作答后提交会写入练习记录和错题状态");
    expect(practiceHint).toBeInTheDocument();
    expect(practiceHint.closest(".panel-heading")).not.toBeNull();
    expect(screen.queryByText("练习模式")).not.toBeInTheDocument();
  });
});

function renderPractice(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PracticePage />
    </MemoryRouter>
  );
}

function questionListItem(id: string, stemMd: string) {
  return {
    id,
    sourceCode: id.toUpperCase(),
    subject: "programming",
    language: "java",
    level: "working",
    type: "single",
    stemMd,
    memo: "Real memo",
    tags: ["real"],
    totalAttempts: 0,
    correctAttempts: 0,
    correctRate: 0
  };
}

function questionDetail(id: string, stem: string, includeAnswer: boolean) {
  return {
    id,
    stemHtml: `<p>${stem}</p>`,
    explanationHtml: "<p>Use the correct option.</p>",
    source: {
      subject: "programming",
      language: "java",
      level: "working",
      type: "single",
      sourceCode: "SRC-1"
    },
    options: [
      { key: "A", text: "Correct option" },
      { key: "B", text: "Wrong option" }
    ],
    memo: "Real memo",
    tags: ["real"],
    stats: { totalAttempts: 0, correctAttempts: 0, correctRate: 0 },
    ...(includeAnswer ? { correctAnswers: ["A"] } : {})
  };
}

function practiceSubmitResponse(overrides: Partial<PracticeSubmitResponse> = {}): PracticeSubmitResponse {
  const submittedAnswers = Array.isArray(overrides.submittedAnswers) ? overrides.submittedAnswers : ["B"];
  const isCorrect = typeof overrides.isCorrect === "boolean" ? overrides.isCorrect : false;
  return {
    attemptId: `attempt-${submittedAnswers.join("-")}`,
    questionId: "q-1",
    submittedAnswers,
    correctAnswers: ["A"],
    isCorrect,
    explanationMd: "Use the correct option.",
    memo: "Real memo",
    masteryStatus: isCorrect ? { code: "mastered", label: "已掌握", color: "success" as const } : { code: "unmastered", label: "未掌握", color: "danger" as const },
    ...overrides
  };
}
