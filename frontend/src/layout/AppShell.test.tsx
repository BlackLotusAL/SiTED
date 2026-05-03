import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import App from "../App";
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

const contentAdminIdentity: Identity = {
  ip: "10.0.0.8",
  role: "content_admin",
  roleLabel: "题库管理员",
  permissions: ["question:browse", "question:create", "stats:view_basic"]
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

  it("does not render admin route content while identity is loading", () => {
    renderApp("/admin/questions", new Promise<Identity>(() => undefined));

    expect(screen.getByRole("heading", { name: "题目管理" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "正在加载身份..." })).toBeInTheDocument();
    expect(screen.queryByText("Admin question maintenance placeholder for Task 10.")).not.toBeInTheDocument();
  });

  it("blocks learners from rendering admin route placeholders on direct URL access", async () => {
    renderApp("/admin/questions", Promise.resolve(learnerIdentity));

    expect(await screen.findByText("权限不足")).toBeInTheDocument();
    expect(screen.getByText("当前身份无权访问该页面。")).toBeInTheDocument();
    expect(screen.queryByText("Admin question maintenance placeholder for Task 10.")).not.toBeInTheDocument();
  });

  it("allows content admins to access admin questions and stats but not system settings", async () => {
    const questions = renderApp("/admin/questions", Promise.resolve(contentAdminIdentity));

    expect(await screen.findByText("Admin question maintenance placeholder for Task 10.")).toBeInTheDocument();
    questions.unmount();

    const settings = renderApp("/admin/settings", Promise.resolve(contentAdminIdentity));

    expect(await screen.findByText("权限不足")).toBeInTheDocument();
    expect(screen.queryByText("System settings placeholder for Task 10.")).not.toBeInTheDocument();
    settings.unmount();
  });

  it("shows an unavailable identity placeholder instead of admin content when identity loading fails", async () => {
    renderApp("/admin/stats", Promise.reject(new Error("offline")));

    expect(await screen.findByText("身份不可用")).toBeInTheDocument();
    expect(screen.queryByText("Admin statistics placeholder for Task 10.")).not.toBeInTheDocument();
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

function renderApp(path: string, identity: Promise<Identity>) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App loadIdentity={() => identity.catch((error: unknown) => Promise.reject(error))} />
    </MemoryRouter>
  );
}
