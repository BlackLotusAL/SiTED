import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PracticePage } from "./PracticePage";

describe("PracticePage", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps next question unavailable until submit, then advances to a different local question", () => {
    render(<PracticePage />);

    expect(screen.getByRole("heading", { name: "下面哪个集合适合在并发读写场景下作为线程安全 Map 使用？" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一题" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /ConcurrentHashMap/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交答案" }));

    expect(screen.getByRole("button", { name: "下一题" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "下一题" }));

    expect(screen.getByRole("heading", { name: "关于 checked exception 和 unchecked exception，下列说法正确的是？" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一题" })).toBeDisabled();
  });

  it("exposes selected and submitted option state to assistive technology", () => {
    render(<PracticePage />);

    const wrongOption = screen.getByText("HashMap").closest("button");

    expect(wrongOption).not.toBeNull();

    fireEvent.click(wrongOption!);

    expect(wrongOption!).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "提交答案" }));

    expect(screen.getByRole("status")).toHaveTextContent("回答错误");
    expect(wrongOption!).toHaveAttribute("aria-label", expect.stringContaining("回答错误"));
    expect(screen.getByRole("button", { name: /ConcurrentHashMap.*正确答案/ })).toBeInTheDocument();
  });
});
