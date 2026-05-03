import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdminSettingsPage } from "./AdminSettingsPage";

describe("AdminSettingsPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders IP role binding above the visually distinct danger zone", () => {
    render(<AdminSettingsPage />);

    const roleTable = screen.getByRole("table", { name: "IP 固定角色绑定" });
    const dangerZone = screen.getByRole("region", { name: "数据清空" });

    expect(roleTable.compareDocumentPosition(dangerZone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dangerZone).toHaveClass("danger-zone");
    expect(within(dangerZone).queryByText("高风险操作")).not.toBeInTheDocument();
  });

  it("uses readable table headers, role names, and concrete permissions", () => {
    render(<AdminSettingsPage />);

    const roleTable = screen.getByRole("table", { name: "IP 固定角色绑定" });
    const headers = within(roleTable).getAllByRole("columnheader").map((header) => header.textContent);

    expect(headers).toEqual(["IP 地址", "固定角色", "权限范围", "说明", "更新时间"]);
    expect(within(roleTable).getByText("系统管理员")).toBeInTheDocument();
    expect(within(roleTable).getByText("题库管理员")).toBeInTheDocument();
    expect(within(roleTable).queryByText("system_admin")).not.toBeInTheDocument();
    expect(within(roleTable).getAllByRole("rowheader").map((header) => header.textContent)).toEqual([
      "10.42.18.36",
      "10.42.20.17"
    ]);
    expect(within(roleTable).getByText("题目新增")).toBeInTheDocument();
    expect(within(roleTable).getByText("运营看板只读")).toBeInTheDocument();
    expect(within(roleTable).getByText("审计日志查看")).toBeInTheDocument();
  });

  it("requires the confirmation phrase before enabling the data clear action", () => {
    render(<AdminSettingsPage />);

    const dangerZone = screen.getByRole("region", { name: "数据清空" });
    const clearButton = within(dangerZone).getByRole("button", { name: /进入清空流程/ });

    expect(clearButton).toBeDisabled();

    fireEvent.change(within(dangerZone).getByRole("textbox"), { target: { value: "wrong phrase" } });
    expect(clearButton).toBeDisabled();

    fireEvent.change(within(dangerZone).getByRole("textbox"), { target: { value: "确认清空" } });
    expect(clearButton).toBeEnabled();
  });
});
