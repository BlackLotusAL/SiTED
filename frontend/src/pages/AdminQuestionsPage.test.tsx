import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../api/client";
import { AdminQuestionsPage } from "./AdminQuestionsPage";

vi.mock("../api/client", () => ({
  apiClient: {
    post: vi.fn()
  }
}));

describe("AdminQuestionsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(apiClient.post).mockResolvedValue({ id: "q-created", status: "published" });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("updates the live preview when option text changes", () => {
    render(<AdminQuestionsPage />);

    fireEvent.change(screen.getByLabelText("A 选项内容"), { target: { value: "CopyOnWriteArrayList" } });

    const preview = screen.getByLabelText("实时预览");
    expect(within(preview).getByText("A. CopyOnWriteArrayList")).toBeInTheDocument();
  });

  it("keeps single and multiple questions at empty A-D by default and supports adding through F and deleting down to three options", () => {
    render(<AdminQuestionsPage />);

    expect(optionTextInputs()).toHaveLength(4);
    expect(screen.getByLabelText("A 选项内容")).toHaveValue("");
    expect(screen.getByLabelText("B 选项内容")).toHaveValue("");
    expect(screen.getByLabelText("C 选项内容")).toHaveValue("");
    expect(screen.getByLabelText("D 选项内容")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "添加选项" }));
    fireEvent.click(screen.getByRole("button", { name: "添加选项" }));

    expect(screen.getByLabelText("E 选项内容")).toBeInTheDocument();
    expect(screen.getByLabelText("F 选项内容")).toBeInTheDocument();
    const addButton = screen.getByRole("button", { name: "添加选项" });
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveClass("add-option-button");

    fireEvent.click(screen.getByRole("button", { name: "删除 F 选项" }));
    fireEvent.click(screen.getByRole("button", { name: "删除 E 选项" }));
    fireEvent.click(screen.getByRole("button", { name: "删除 D 选项" }));

    expect(optionTextInputs()).toHaveLength(3);
    expect(screen.getByRole("button", { name: "删除 A 选项" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("题型"), { target: { value: "multiple" } });

    expect(optionTextInputs()).toHaveLength(4);
    expect(screen.getByLabelText("D 选项内容")).toBeInTheDocument();
    expect(screen.getByLabelText("D 选项内容")).toHaveValue("");
  });

  it("fixes judgment questions to A and B and hides option add and delete controls", () => {
    render(<AdminQuestionsPage />);

    fireEvent.change(screen.getByLabelText("题型"), { target: { value: "judgment" } });

    expect(optionTextInputs()).toHaveLength(2);
    expect(screen.getByDisplayValue("正确")).toBeInTheDocument();
    expect(screen.getByDisplayValue("错误")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加选项" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /删除/ })).not.toBeInTheDocument();
  });

  it("renumbers options and preserves correct answer identity when an option is deleted", () => {
    render(<AdminQuestionsPage />);

    fireEvent.change(screen.getByLabelText("B 选项内容"), { target: { value: "HashMap" } });
    fireEvent.change(screen.getByLabelText("C 选项内容"), { target: { value: "ConcurrentHashMap" } });
    fireEvent.change(screen.getByLabelText("D 选项内容"), { target: { value: "LinkedList" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /^D / }));
    fireEvent.click(screen.getByRole("button", { name: "删除 B 选项" }));

    expect(screen.queryByDisplayValue("HashMap")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("ConcurrentHashMap")).toHaveAccessibleName("B 选项内容");
    expect(screen.getByDisplayValue("LinkedList")).toHaveAccessibleName("C 选项内容");
    expect(screen.getByRole("checkbox", { name: /^C / })).toBeChecked();
  });

  it("limits single and judgment questions to one correct answer and allows multiple correct answers for multiple choice", () => {
    render(<AdminQuestionsPage />);

    fireEvent.click(screen.getByRole("checkbox", { name: /^B / }));
    expect(screen.getByRole("checkbox", { name: /^B / })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^C / })).not.toBeChecked();

    fireEvent.change(screen.getByLabelText("题型"), { target: { value: "multiple" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /^A / }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^C / }));

    expect(screen.getByRole("checkbox", { name: /^A / })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^C / })).toBeChecked();

    fireEvent.change(screen.getByLabelText("题型"), { target: { value: "judgment" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /^B / }));

    expect(screen.getByRole("checkbox", { name: /^A / })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^B / })).toBeChecked();
  });

  it("saves a local draft and restores it on the next render without calling the backend", () => {
    const { unmount } = render(<AdminQuestionsPage />);

    fireEvent.change(screen.getByLabelText("A 选项内容"), { target: { value: "CopyOnWriteArrayList" } });
    fireEvent.change(screen.getByLabelText("解析"), { target: { value: "Use a concurrent collection." } });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    expect(screen.getByRole("status")).toHaveTextContent("草稿已保存到本地");
    expect(apiClient.post).not.toHaveBeenCalled();

    unmount();
    render(<AdminQuestionsPage />);

    expect(screen.getByDisplayValue("CopyOnWriteArrayList")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Use a concurrent collection.")).toBeInTheDocument();
  });

  it("shows a top-center toast and does not publish invalid questions", () => {
    render(<AdminQuestionsPage />);

    fireEvent.change(screen.getByLabelText("题型"), { target: { value: "multiple" } });
    fillDefaultChoiceOptions();
    fireEvent.click(screen.getByRole("checkbox", { name: /^A / }));
    fireEvent.click(screen.getByRole("button", { name: "发布题目" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("status-toast", "error");
    expect(alert).toHaveTextContent("多选题至少需要 2 个正确答案");
    expect(alert.parentElement).toHaveClass("toast-region");
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("publishes valid questions with explanation, options, and correct answers", async () => {
    render(<AdminQuestionsPage />);

    fillDefaultChoiceOptions();
    fireEvent.click(screen.getByRole("checkbox", { name: /^C / }));
    fireEvent.change(screen.getByLabelText("解析"), { target: { value: "ConcurrentHashMap reduces lock contention." } });
    fireEvent.click(screen.getByRole("button", { name: "发布题目" }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith("/admin/questions", {
        subject: "programming",
        language: "java",
        level: "working",
        type: "single",
        stemMd: expect.stringContaining("ConcurrentHashMap"),
        options: [
          { key: "A", text: "ArrayList", isCorrect: false },
          { key: "B", text: "HashMap", isCorrect: false },
          { key: "C", text: "ConcurrentHashMap", isCorrect: true },
          { key: "D", text: "LinkedList", isCorrect: false }
        ],
        correctAnswers: ["C"],
        explanationMd: "ConcurrentHashMap reduces lock contention.",
        tags: [],
        memo: undefined,
        status: "published"
      })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("题目已发布");
  });

  it("shows animated feedback when a correct answer is selected", () => {
    render(<AdminQuestionsPage />);

    const checkbox = screen.getByRole("checkbox", { name: /^B / });
    fireEvent.click(checkbox);

    expect(screen.queryByText("已标记为正确答案")).not.toBeInTheDocument();
    expect(checkbox.closest(".option-entry")).toHaveClass("is-correct-selected", "is-correct-pulse");
  });

  it("previews explanation content instead of fake memo text", () => {
    render(<AdminQuestionsPage />);

    expect(screen.queryByText(/速记/)).not.toBeInTheDocument();
    const preview = screen.getByLabelText("实时预览");
    expect(within(preview).getByText(/ConcurrentHashMap 面向并发访问场景/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("解析"), { target: { value: "" } });

    expect(within(preview).getByText("暂无解析")).toBeInTheDocument();
  });
});

function optionTextInputs() {
  return screen.getAllByLabelText(/[A-F] 选项内容/);
}

function fillDefaultChoiceOptions() {
  fireEvent.change(screen.getByLabelText("A 选项内容"), { target: { value: "ArrayList" } });
  fireEvent.change(screen.getByLabelText("B 选项内容"), { target: { value: "HashMap" } });
  fireEvent.change(screen.getByLabelText("C 选项内容"), { target: { value: "ConcurrentHashMap" } });
  fireEvent.change(screen.getByLabelText("D 选项内容"), { target: { value: "LinkedList" } });
}
