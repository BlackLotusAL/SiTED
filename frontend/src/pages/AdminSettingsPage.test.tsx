import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSettingsPage } from "./AdminSettingsPage";

const apiClientMock = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn()
}));

vi.mock("../api/client", () => ({
  apiClient: apiClientMock
}));

const roleBindingResponse = {
  headers: ["IP", "fixed role", "permission scope", "description", "updated time"],
  items: [
    {
      ip: "127.0.0.1",
      role: "system_admin",
      fixedRole: "系统管理员",
      permissionScope: [
        "浏览题库",
        "练习",
        "背诵",
        "错题复习",
        "收藏",
        "模拟考",
        "题目新增",
        "题目编辑",
        "题目归档",
        "题目导入",
        "题目导出",
        "运营看板只读",
        "IP 角色绑定",
        "数据清空",
        "审计日志查看",
        "配置重载"
      ],
      permissionKeys: [
        "question:browse",
        "practice:use",
        "recite:use",
        "mistake:review",
        "bookmark:use",
        "exam:use",
        "question:create",
        "question:edit",
        "question:archive",
        "question:import",
        "question:export",
        "stats:view_basic",
        "ip_role:write",
        "data:clear",
        "audit:view",
        "config:reload"
      ],
      permissions: [
        "浏览题库",
        "练习",
        "背诵",
        "错题复习",
        "收藏",
        "模拟考",
        "题目新增",
        "题目编辑",
        "题目归档",
        "题目导入",
        "题目导出",
        "运营看板只读",
        "IP 角色绑定",
        "数据清空",
        "审计日志查看",
        "配置重载"
      ],
      description: "From SYSTEM_ADMIN_IPS",
      source: "system",
      canDelete: false,
      updatedAt: null
    },
    {
      ip: "10.0.0.8",
      role: "learner",
      fixedRole: "学习者",
      permissionScope: ["浏览题库", "练习", "背诵", "错题复习", "收藏", "模拟考"],
      permissionKeys: ["question:browse", "practice:use", "recite:use", "mistake:review", "bookmark:use", "exam:use"],
      permissions: ["浏览题库", "练习", "背诵", "错题复习", "收藏", "模拟考"],
      description: "学习成员",
      source: "binding",
      canDelete: true,
      updatedAt: "2026-05-05T00:30:00.000Z"
    },
    {
      ip: "10.0.0.9",
      role: "content_admin",
      fixedRole: "题库管理员",
      permissionScope: ["题目新增", "题目编辑", "题目归档", "题目导入", "题目导出", "运营看板只读"],
      permissionKeys: [
        "question:create",
        "question:edit",
        "question:archive",
        "question:import",
        "question:export",
        "stats:view_basic"
      ],
      permissions: ["题目新增", "题目编辑", "题目归档", "题目导入", "题目导出", "运营看板只读"],
      description: "题库负责人",
      source: "binding",
      canDelete: true,
      updatedAt: "2026-05-05T01:00:00.000Z"
    }
  ]
};

describe("AdminSettingsPage", () => {
  beforeEach(() => {
    apiClientMock.delete.mockReset();
    apiClientMock.get.mockReset();
    apiClientMock.post.mockReset();
    apiClientMock.get.mockResolvedValue(roleBindingResponse);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("loads IP role bindings from the API instead of hard-coded rows", async () => {
    render(<AdminSettingsPage />);

    const roleTable = await screen.findByRole("table", { name: "IP 固定角色绑定" });

    expect(apiClientMock.get).toHaveBeenCalledWith("/admin/settings/ip-role-bindings");
    expect(within(roleTable).getByText("127.0.0.1")).toBeInTheDocument();
    expect(within(roleTable).getByText("10.0.0.9")).toBeInTheDocument();
    expect(within(roleTable).queryByText("10.42.18.36")).not.toBeInTheDocument();
    expect(within(roleTable).getByText("系统管理员")).toBeInTheDocument();
    expect(within(roleTable).getByText("题库管理员")).toBeInTheDocument();
  });

  it("adds a binding with editable fields and refreshes the table", async () => {
    render(<AdminSettingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /新增绑定/ }));
    fireEvent.change(screen.getByLabelText("IP 地址"), { target: { value: "10.0.0.10" } });
    fireEvent.change(screen.getByLabelText("固定角色"), { target: { value: "content_admin" } });
    fireEvent.change(screen.getByLabelText("说明"), { target: { value: "新增题库维护者" } });

    expect(within(screen.getByLabelText("权限范围预览")).getByText("题库维护")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存绑定" }));

    await waitFor(() =>
      expect(apiClientMock.post).toHaveBeenCalledWith("/admin/settings/ip-role-bindings", {
        ip: "10.0.0.10",
        role: "content_admin",
        description: "新增题库维护者"
      })
    );
    expect(apiClientMock.get).toHaveBeenCalledTimes(2);
  });

  it("shows binding save errors as an auto-dismissing top-center toast", async () => {
    apiClientMock.post.mockRejectedValueOnce(new Error("ip must be a valid IPv4 address"));
    const { container } = render(<AdminSettingsPage />);

    await screen.findByRole("table", { name: "IP 固定角色绑定" });
    const addButton = container.querySelector(".panel-heading .primary-button");
    expect(addButton).not.toBeNull();
    fireEvent.click(addButton!);

    const form = container.querySelector(".role-binding-form");
    expect(form).not.toBeNull();

    const [ipInput] = Array.from(form!.querySelectorAll("input"));
    fireEvent.change(ipInput, { target: { value: "1112" } });
    vi.useFakeTimers();
    fireEvent.submit(form!);

    await act(async () => {
      await Promise.resolve();
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("status-toast", "error");
    expect(alert).toHaveTextContent("ip must be a valid IPv4 address");
    expect(container.querySelector(".toast-region > .status-toast.error")).toContainElement(alert);
    expect(container.querySelector(".status-bubble")).not.toBeInTheDocument();
    expect(container.querySelector(".status-message.error")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("removes the duplicate collapse button and keeps cancel as the only close action while adding", async () => {
    render(<AdminSettingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /新增绑定/ }));

    expect(screen.queryByRole("button", { name: /收起表单/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /新增绑定/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.getByRole("button", { name: /新增绑定/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("IP 地址")).not.toBeInTheDocument();
  });

  it("summarizes permissions into capability groups in the table and form preview", async () => {
    render(<AdminSettingsPage />);

    const roleTable = await screen.findByRole("table", { name: "IP 固定角色绑定" });
    const systemRow = within(roleTable).getByRole("row", { name: /127\.0\.0\.1/ });
    const learnerRow = within(roleTable).getByRole("row", { name: /10\.0\.0\.8/ });
    const contentAdminRow = within(roleTable).getByRole("row", { name: /10\.0\.0\.9/ });

    for (const label of ["题库浏览", "题库练习", "模拟考试", "题库维护", "导入导出", "运营看板", "系统配置", "数据清空"]) {
      expect(within(systemRow).getAllByText(label).length).toBeGreaterThan(0);
    }
    for (const label of ["题库浏览", "题库练习", "模拟考试"]) {
      expect(within(learnerRow).getByText(label)).toBeInTheDocument();
    }
    for (const label of ["题库维护", "导入导出", "运营看板"]) {
      expect(within(contentAdminRow).getAllByText(label).length).toBeGreaterThan(0);
    }

    expect(within(roleTable).queryByText("配置重载")).not.toBeInTheDocument();
    expect(within(roleTable).queryByText("审计日志查看")).not.toBeInTheDocument();
    expect(within(roleTable).queryByText("错题复习")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /新增绑定/ }));
    fireEvent.change(screen.getByLabelText("固定角色"), { target: { value: "learner" } });

    const preview = screen.getByLabelText("权限范围预览");
    expect(within(preview).getByText("题库浏览")).toBeInTheDocument();
    expect(within(preview).getByText("题库练习")).toBeInTheDocument();
    expect(within(preview).getByText("模拟考试")).toBeInTheDocument();
    expect(within(preview).queryByText("错题复习")).not.toBeInTheDocument();
  });

  it("uses an in-page confirmation dialog before deleting persisted bindings", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    apiClientMock.delete.mockResolvedValue({ deleted: true });
    render(<AdminSettingsPage />);

    const roleTable = await screen.findByRole("table", { name: "IP 固定角色绑定" });
    const systemRow = within(roleTable).getByRole("row", { name: /127\.0\.0\.1/ });
    const persistedRow = within(roleTable).getByRole("row", { name: /10\.0\.0\.9/ });

    expect(within(systemRow).queryByRole("button", { name: /删除/ })).not.toBeInTheDocument();

    fireEvent.click(within(persistedRow).getByRole("button", { name: "删除 10.0.0.9" }));

    const dialog = screen.getByRole("dialog", { name: "确认删除绑定" });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(apiClientMock.delete).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/10\.0\.0\.9/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "确认删除绑定" })).not.toBeInTheDocument();
    expect(apiClientMock.delete).not.toHaveBeenCalled();

    fireEvent.click(within(persistedRow).getByRole("button", { name: "删除 10.0.0.9" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "确认删除绑定" })).getByRole("button", { name: "确认删除" }));

    await waitFor(() =>
      expect(apiClientMock.delete).toHaveBeenCalledWith("/admin/settings/ip-role-bindings/10.0.0.9")
    );
    expect(apiClientMock.get).toHaveBeenCalledTimes(2);
  });

  it("removes the visible confirmation phrase label while preserving the guarded clear flow", async () => {
    render(<AdminSettingsPage />);

    const dangerZone = await screen.findByRole("region", { name: "数据清空" });
    const clearInput = within(dangerZone).getByRole("textbox", { name: "输入确认短语" });
    const startButton = within(dangerZone).getByRole("button", { name: /进入清空流程/ });

    expect(within(dangerZone).queryByText("确认短语")).not.toBeInTheDocument();
    expect(startButton).toBeDisabled();

    fireEvent.change(clearInput, { target: { value: "确认清空" } });
    expect(startButton).toBeEnabled();

    fireEvent.click(startButton);

    expect(within(dangerZone).getByRole("group", { name: "清空范围" })).toBeInTheDocument();
    expect(within(dangerZone).getByRole("radio", { name: "仅清空练习与考试记录" })).toBeChecked();
  });

  it("submits the confirmed clear flow with the safe default scope", async () => {
    apiClientMock.post.mockResolvedValue({ scope: "activity", result: "success", dbResult: "success" });
    render(<AdminSettingsPage />);

    const dangerZone = await screen.findByRole("region", { name: "数据清空" });
    fireEvent.change(within(dangerZone).getByRole("textbox", { name: "输入确认短语" }), {
      target: { value: "确认清空" }
    });
    fireEvent.click(within(dangerZone).getByRole("button", { name: /进入清空流程/ }));
    fireEvent.click(within(dangerZone).getByRole("button", { name: "确认清空数据" }));

    await waitFor(() =>
      expect(apiClientMock.post).toHaveBeenCalledWith("/admin/settings/data-clear", {
        scope: "activity",
        confirmationPhrase: "确认清空"
      })
    );
  });
});
