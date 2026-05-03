import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdminQuestionsPage } from "./AdminQuestionsPage";

describe("AdminQuestionsPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("updates the live preview when option text changes", () => {
    render(<AdminQuestionsPage />);

    fireEvent.change(screen.getByDisplayValue("ArrayList"), { target: { value: "CopyOnWriteArrayList" } });

    const preview = screen.getByLabelText("实时预览");
    expect(within(preview).getByText("A. CopyOnWriteArrayList")).toBeInTheDocument();
    expect(within(preview).queryByText("A. ArrayList")).not.toBeInTheDocument();
  });

  it("updates the live preview when correct answers are toggled", () => {
    render(<AdminQuestionsPage />);

    const preview = screen.getByLabelText("实时预览");
    expect(within(preview).getByText("B. HashMap")).not.toHaveClass("correct");

    fireEvent.click(screen.getByRole("checkbox", { name: /^B / }));

    expect(within(preview).getByText("B. HashMap")).toHaveClass("correct");
  });
});
