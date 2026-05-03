import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TrainingCalendar } from "./TrainingCalendar";

describe("TrainingCalendar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the May 2026 calendar with Monday-to-Sunday columns and six fixed rows", () => {
    render(<TrainingCalendar />);

    expect(screen.getByRole("heading", { name: "训练日历" })).toBeInTheDocument();
    expect(screen.getByText("2026 年 5 月")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["周一", "周二", "周三", "周四", "周五", "周六", "周日"]);
    expect(screen.getAllByRole("gridcell")).toHaveLength(42);
  });

  it("switches months without changing the fixed calendar grid size", () => {
    render(<TrainingCalendar />);

    fireEvent.click(screen.getByRole("button", { name: "上一月" }));

    expect(screen.getByText("2026 年 4 月")).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(42);

    fireEvent.click(screen.getByRole("button", { name: "下一月" }));

    expect(screen.getByText("2026 年 5 月")).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(42);
  });
});
