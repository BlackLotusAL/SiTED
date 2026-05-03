import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TrendChart } from "./TrendChart";

const data = [
  { label: "4/27", value: 58 },
  { label: "4/28", value: 64 },
  { label: "4/29", value: 61 },
  { label: "4/30", value: 79 },
  { label: "5/1", value: 83 },
  { label: "5/2", value: 91 },
  { label: "5/3", value: 86 }
];

describe("TrendChart", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders aligned axes, unit, and one bar per x-axis label", () => {
    render(<TrendChart color="blue" data={data} max={100} title="访问用户" unit="人" />);

    const chart = screen.getByRole("figure", { name: "访问用户 近 7 天趋势" });

    expect(within(chart).getByText("单位：人")).toBeInTheDocument();
    expect(within(chart).getByText("100")).toBeInTheDocument();
    expect(within(chart).getByText("50")).toBeInTheDocument();
    expect(within(chart).getByText("0")).toBeInTheDocument();
    expect(within(chart).getAllByTestId("trend-chart-bar")).toHaveLength(data.length);
    expect(within(chart).getAllByTestId("trend-chart-x-label").map((label) => label.textContent)).toEqual(
      data.map((item) => item.label)
    );
  });

  it("shows a concrete hover tooltip for a bar", () => {
    render(<TrendChart color="amber" data={data} max={100} title="模拟考" unit="次" />);

    fireEvent.mouseEnter(screen.getAllByTestId("trend-chart-bar")[0]);

    expect(screen.getByRole("tooltip")).toHaveTextContent("4/27 模拟考 58 次");
  });
});
