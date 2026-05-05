import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { apiClient } from "../api/client";
import { ExamPage } from "./ExamPage";

vi.mock("../api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn()
  }
}));

describe("ExamPage", () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(apiClient.patch).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows an unstarted exam page without creating an exam on first load", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ items: [] });

    renderExam();

    expect(await screen.findByRole("heading", { name: "未启动模拟考" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始模拟考" })).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("creates an exam only after the user starts it", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ items: [] });
    vi.mocked(apiClient.post).mockResolvedValueOnce(activeExam());

    renderExam();

    fireEvent.click(await screen.findByRole("button", { name: "开始模拟考" }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/exams",
        expect.objectContaining({ subject: "programming", language: "java", level: "working" })
      )
    );
    expect(await screen.findByText("Exam question")).toBeInTheDocument();
    expect(screen.getByLabelText("答题卡")).toBeInTheDocument();
  });

  it("loads an active real exam, saves answers, and renders submitted review data", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ items: [{ id: "exam-1", status: "in_progress" }] })
      .mockResolvedValueOnce(activeExam());
    vi.mocked(apiClient.patch).mockResolvedValue(activeExam({ answers: { "q-1": ["B"] } }));
    vi.mocked(apiClient.post).mockResolvedValue(submittedExam());

    renderExam();

    expect(await screen.findByText("Exam question")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /B Wrong/ }));
    const submitAnswerButton = screen.getByRole("button", { name: "提交答案" });
    expect(submitAnswerButton.querySelector("svg")).not.toBeNull();
    fireEvent.click(submitAnswerButton);

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith("/exams/exam-1/answers", { answers: { "q-1": ["B"] } }));

    fireEvent.click(screen.getByRole("button", { name: "交卷" }));
    const continueButton = await screen.findByRole("button", { name: "继续答题" });
    const confirmButton = screen.getByRole("button", { name: "确认交卷" });
    expect(continueButton.parentElement).toBe(confirmButton.parentElement);
    expect(confirmButton.parentElement).toHaveClass("submit-confirmation-actions");
    fireEvent.click(confirmButton);

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/exams/exam-1/submit", { answers: { "q-1": ["B"] } }));
    expect(await screen.findByText("回答错误")).toBeInTheDocument();
    expect(screen.getByText("回答错误").closest(".answer-panel")).toHaveClass("result-wrong");
    expect(screen.getByText("Use the correct option.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "考试结果" })).toBeInTheDocument();
    expect(screen.getByText("正确率 0%")).toBeInTheDocument();
    expect(screen.getByText("正确 0")).toBeInTheDocument();
    expect(screen.getByText("错误 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1" })).toHaveClass("wrong");
    expect(screen.getByRole("button", { name: "重新模拟考" })).toBeInTheDocument();
  });

  it("reopens the latest submitted exam in review mode and returns to the start page before a new simulation", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ items: [{ id: "exam-1", status: "submitted" }] })
      .mockResolvedValueOnce(submittedExam());

    renderExam();

    expect(await screen.findByText("回答错误")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "未启动模拟考" })).not.toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith("/exams/exam-1");

    fireEvent.click(screen.getByRole("button", { name: "重新模拟考" }));

    expect(await screen.findByRole("heading", { name: "未启动模拟考" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始模拟考" })).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("opens a submitted exam review directly from an examId query parameter", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(submittedExam());

    renderExam("/exam?examId=exam-1");

    expect(await screen.findByText("回答错误")).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith("/exams/exam-1");
    expect(apiClient.get).not.toHaveBeenCalledWith("/exams");
  });

  it("warns about unanswered questions before submitting the exam", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ items: [{ id: "exam-1", status: "in_progress" }] })
      .mockResolvedValueOnce(
        activeExam({
          answers: { "q-1": ["A"] },
          questions: [
            examQuestion("q-1", "Exam question"),
            examQuestion("q-2", "Second exam question")
          ]
        })
      );

    renderExam();

    expect(await screen.findByText("Exam question")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "交卷" }));

    const confirmation = await screen.findByRole("alert");
    expect(confirmation).toHaveTextContent("还有 1 道题未作答");
    expect(confirmation).toHaveClass("submit-confirmation");
    expect(confirmation).not.toHaveClass("answer-panel");
    expect(confirmation.querySelector("strong")).not.toHaveClass("result-correct");
    expect(confirmation.querySelector("strong")).not.toHaveClass("result-wrong");
  });

  it("shows only correct and wrong legends in review and marks correct questions green", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ items: [{ id: "exam-1", status: "in_progress" }] })
      .mockResolvedValueOnce(
        activeExam({
          answers: { "q-1": ["B"], "q-2": ["A"] },
          questions: [
            examQuestion("q-1", "Exam question"),
            examQuestion("q-2", "Second exam question")
          ]
        })
      );
    vi.mocked(apiClient.post).mockResolvedValue(submittedMixedExam());

    renderExam();

    expect(await screen.findByText("Exam question")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "交卷" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认交卷" }));

    expect(await screen.findByRole("heading", { name: "考试结果" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1" })).toHaveClass("wrong");
    expect(screen.getByRole("button", { name: "2" })).toHaveClass("correct");
    expect(screen.getByText("回答错误").closest(".answer-panel")).toHaveClass("result-wrong");

    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(await screen.findByText("回答正确")).toBeInTheDocument();
    expect(screen.getByText("回答正确").closest(".answer-panel")).toHaveClass("result-correct");

    const legend = document.querySelector(".legend");
    expect(legend).toHaveTextContent("正确");
    expect(legend).toHaveTextContent("错误");
    expect(legend).not.toHaveTextContent("已答");
    expect(legend).not.toHaveTextContent("当前");
    expect(legend).not.toHaveTextContent("疑问");
  });

  it("uses different icons for marking and unmarking flagged questions", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ items: [{ id: "exam-1", status: "in_progress" }] })
      .mockResolvedValueOnce(activeExam());

    renderExam();

    expect(await screen.findByText("Exam question")).toBeInTheDocument();
    const markButton = screen.getByRole("button", { name: "标记疑问" });
    const markIcon = markButton.querySelector("svg")?.outerHTML;

    fireEvent.click(markButton);

    const unmarkButton = screen.getByRole("button", { name: "取消疑问" });
    expect(unmarkButton.querySelector("svg")?.outerHTML).not.toEqual(markIcon);
  });
});

function renderExam(path = "/exam") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ExamPage />
    </MemoryRouter>
  );
}

function activeExam(overrides: Record<string, unknown> = {}) {
  return {
    id: "exam-1",
    subject: "programming",
    language: "java",
    level: "working",
    status: "in_progress",
    config: {
      durationMinutes: 45,
      passScorePercent: 60,
      questionCounts: { single: 1, multiple: 0, judgment: 0 }
    },
    answers: {},
    flaggedQuestionIds: [],
    startedAt: "2026-05-05T02:00:00.000Z",
    deadlineAt: "2026-05-05T02:45:00.000Z",
    submittedAt: null,
    scorePercent: null,
    isPassed: null,
    questions: [examQuestion("q-1", "Exam question")],
    ...overrides
  };
}

function examQuestion(id: string, stemMd: string) {
  return {
    id,
    sourceCode: "SRC-1",
    subject: "programming",
    language: "java",
    level: "working",
    type: "single",
    stemMd,
    options: [
      { key: "A", text: "Correct" },
      { key: "B", text: "Wrong" }
    ],
    tags: ["real"]
  };
}

function submittedExam() {
  return {
    ...activeExam(),
    status: "submitted",
    scorePercent: 0,
    isPassed: false,
    submittedAt: "2026-05-05T02:30:00.000Z",
    answers: { "q-1": ["B"] },
    questions: [
      {
        id: "q-1",
        sourceCode: "SRC-1",
        subject: "programming",
        language: "java",
        level: "working",
        type: "single",
        stemMd: "Exam question",
        options: [
          { key: "A", text: "Correct" },
          { key: "B", text: "Wrong" }
        ],
        correctAnswers: ["A"],
        submittedAnswers: ["B"],
        isCorrect: false,
        explanationMd: "Use the correct option.",
        memo: null,
        tags: ["real"]
      }
    ]
  };
}

function submittedMixedExam() {
  return {
    ...activeExam(),
    status: "submitted",
    scorePercent: 50,
    isPassed: false,
    submittedAt: "2026-05-05T02:30:00.000Z",
    answers: { "q-1": ["B"], "q-2": ["A"] },
    questions: [
      {
        ...examQuestion("q-1", "Exam question"),
        correctAnswers: ["A"],
        submittedAnswers: ["B"],
        isCorrect: false,
        explanationMd: "Use the correct option.",
        memo: null
      },
      {
        ...examQuestion("q-2", "Second exam question"),
        correctAnswers: ["A"],
        submittedAnswers: ["A"],
        isCorrect: true,
        explanationMd: "Use the correct option.",
        memo: null
      }
    ]
  };
}
