import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";
import type { Identity } from "../api/types";

const learnerIdentity: Identity = {
  ip: "10.0.0.5",
  role: "learner",
  roleLabel: "学习者",
  permissions: ["question:browse", "practice:use"]
};

const adminIdentity: Identity = {
  ip: "10.0.0.1",
  role: "system_admin",
  roleLabel: "系统管理员",
  permissions: ["question:browse", "question:create", "ip_role:write"]
};

describe("AppShell", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders learner shell with route title, top actions, and no admin nav", async () => {
    renderShell("/questions", learnerIdentity);

    expect(await screen.findByRole("heading", { name: "题库" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看通知" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换主题" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "开始练习" })).toHaveAttribute("href", "/practice");
    const identityCard = screen.getByLabelText("当前身份信息");
    expect(within(identityCard).getByText("学习者")).toBeInTheDocument();
    expect(within(identityCard).getByText("10.0.0.5")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "题目管理" })).not.toBeInTheDocument();
    expect(screen.queryByText("管理")).not.toBeInTheDocument();
  });

  it("shows admin navigation for system administrators", async () => {
    renderShell("/admin/settings", adminIdentity);

    expect(await screen.findByRole("heading", { name: "系统设置" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "题目管理" })).toHaveAttribute("href", "/admin/questions");
    expect(screen.getByRole("link", { name: "运营看板" })).toHaveAttribute("href", "/admin/stats");
    expect(screen.getByRole("link", { name: "系统设置" })).toHaveAttribute("href", "/admin/settings");
  });

  it("falls back to learner identity when /api/me fails", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="*" element={<AppShell loadIdentity={() => Promise.reject(new Error("offline"))} />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("无法加载身份，已使用访客学习者模式")).toBeInTheDocument());
    expect(within(screen.getByLabelText("当前身份信息")).getByText("学习者")).toBeInTheDocument();
  });
});

function renderShell(path: string, identity: Identity) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<AppShell loadIdentity={() => Promise.resolve(identity)} />} />
      </Routes>
    </MemoryRouter>
  );
}
