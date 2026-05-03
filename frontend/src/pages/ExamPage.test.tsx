import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExamPage } from "./ExamPage";

describe("ExamPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an answer sheet count that matches the displayed total", () => {
    render(<ExamPage />);

    const answerSheet = screen.getByLabelText("答题卡");

    expect(screen.getByText("40 题 / 合格线 60%")).toBeInTheDocument();
    expect(within(answerSheet).getAllByRole("button")).toHaveLength(40);
  });

  it("marks the current question as flagged instead of a different question", () => {
    render(<ExamPage />);

    const answerSheet = screen.getByLabelText("答题卡");
    const currentQuestionButton = within(answerSheet).getByRole("button", { name: "5" });
    const previousQuestionButton = within(answerSheet).getByRole("button", { name: "4" });

    expect(currentQuestionButton).toHaveClass("current");
    expect(previousQuestionButton).not.toHaveClass("flagged");

    fireEvent.click(screen.getByRole("button", { name: "标记疑问" }));

    expect(currentQuestionButton).toHaveClass("current");
    expect(currentQuestionButton).toHaveClass("flagged");
    expect(previousQuestionButton).not.toHaveClass("flagged");
  });
});
