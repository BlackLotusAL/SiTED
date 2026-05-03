import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReviewPage } from "./ReviewPage";

describe("ReviewPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("starts on mistakes with compact tabs and distinct mastery states", () => {
    render(<ReviewPage />);

    expect(screen.getByRole("tab", { name: "错题" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("错题列表")).toBeInTheDocument();
    expect(screen.getByText("未掌握")).toHaveClass("needs-work");
    expect(screen.getByText("已掌握")).toHaveClass("success");
    expect(screen.queryByText("线程池拒绝策略的选择")).not.toBeInTheDocument();
  });

  it("switches between mistakes, bookmarks, and records panels", () => {
    render(<ReviewPage />);

    fireEvent.click(screen.getByRole("tab", { name: "收藏" }));
    expect(screen.getByRole("tab", { name: "收藏" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("收藏列表")).toBeInTheDocument();
    expect(screen.getByText("线程池拒绝策略的选择")).toBeInTheDocument();
    expect(screen.queryByText("SQL 注入防护中的参数化查询边界")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "记录" }));
    const recordsPanel = screen.getByLabelText("练习记录");

    expect(recordsPanel).toBeInTheDocument();
    expect(within(recordsPanel).getByText("科目二 / Python")).toBeInTheDocument();
    expect(screen.queryByText("隐私数据脱敏的最小化原则")).not.toBeInTheDocument();
  });
});
