import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { apiClient } from "../api/client";
import type { Identity } from "../api/types";
import App from "../App";
import { AppShell } from "./AppShell";
import { APP_ROUTES } from "../routes/config";

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
    vi.restoreAllMocks();
  });

  it("renders learner shell with route title, workbench action, and no inactive utility controls", async () => {
    renderShell("/questions", learnerIdentity);

    expect(await screen.findByRole("heading", { name: "题库" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看通知" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "切换主题" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Light/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "开始练习" })).toHaveAttribute("href", "/practice");
    const identityCard = screen.getByLabelText("当前身份信息");
    expect(within(identityCard).getByText("学习者")).toBeInTheDocument();
    expect(within(identityCard).getByText("10.0.0.5")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "题目管理" })).not.toBeInTheDocument();
    expect(screen.queryByText("管理")).not.toBeInTheDocument();
  });

  it("keeps practice as the single learner nav entry for practice and recite modes", async () => {
    renderShell("/", learnerIdentity);

    expect(await screen.findByRole("link", { name: "练习" })).toHaveAttribute("href", "/practice");
    expect(screen.queryByRole("link", { name: "背题" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "背诵" })).not.toBeInTheDocument();
  });

  it("shows admin navigation for system administrators", async () => {
    renderShell("/admin/settings", adminIdentity);

    expect(await screen.findByRole("heading", { name: "系统设置" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "题目管理" })).toHaveAttribute("href", "/admin/questions");
    expect(screen.getByRole("link", { name: "运营看板" })).toHaveAttribute("href", "/admin/stats");
    expect(screen.getByRole("link", { name: "系统设置" })).toHaveAttribute("href", "/admin/settings");
  });

  it("keeps the page stage mounted when navigating between routes", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<AppShell loadIdentity={() => Promise.resolve(adminIdentity)} />}>
            <Route index element={<h2>Home Sentinel</h2>} />
            <Route path="admin/questions" element={<h2>Admin Sentinel</h2>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Home Sentinel" })).toBeInTheDocument();
    const initialStage = container.querySelector(".page-stage");
    expect(initialStage).not.toBeNull();

    screen.getByRole("link", { name: "题目管理" }).click();

    expect(await screen.findByRole("heading", { name: "Admin Sentinel" })).toBeInTheDocument();
    expect(container.querySelector(".page-stage")).toBe(initialStage);
    expect(container.querySelector(".loading-skeleton")).not.toBeInTheDocument();
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
    expect(screen.getByLabelText("内容加载中")).toBeInTheDocument();
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

    expect(await screen.findByLabelText("题干（支持 Markdown 语法）")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "实时预览" })).toBeInTheDocument();
    questions.unmount();

    mockAdminStatsApi();
    const stats = renderApp("/admin/stats", Promise.resolve(contentAdminIdentity));

    expect(await screen.findByRole("heading", { name: "题库统计" })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "访问用户 近 7 天趋势" })).toBeInTheDocument();
    stats.unmount();

    const settings = renderApp("/admin/settings", Promise.resolve(contentAdminIdentity));

    expect(await screen.findByText("权限不足")).toBeInTheDocument();
    expect(screen.queryByText("System settings placeholder for Task 10.")).not.toBeInTheDocument();
    settings.unmount();
  });

  it("does not expose the temporary typography preview route", async () => {
    renderApp("/typography-preview", Promise.resolve(learnerIdentity));

    const homeRoute = APP_ROUTES.find((route) => route.path === "/");
    expect(homeRoute).toBeDefined();
    expect(await screen.findByRole("heading", { name: homeRoute?.label })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Plex + Noto + JetBrains" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Source 全家桶" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "可读性优先" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "字体预览" })).not.toBeInTheDocument();
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

function mockAdminStatsApi() {
  vi.spyOn(apiClient, "get").mockImplementation(((path: string) => {
    if (path !== "/admin/stats") {
      return Promise.reject(new Error(`Unexpected GET ${path}`));
    }

    return Promise.resolve({
      questions: {
        total: 46,
        published: 44,
        bySubject: [
          { subject: "programming", count: 21 },
          { subject: "security_privacy", count: 14 },
          { subject: "refactoring", count: 11 }
        ]
      },
      lowCorrectRateQuestions: [],
      today: {
        visitors: 4,
        practiceQuestions: 9,
        exams: 2
      },
      trends: {
        visitors: [
          { date: "2026-04-29", count: 1 },
          { date: "2026-04-30", count: 2 },
          { date: "2026-05-01", count: 2 },
          { date: "2026-05-02", count: 3 },
          { date: "2026-05-03", count: 3 },
          { date: "2026-05-04", count: 3 },
          { date: "2026-05-05", count: 4 }
        ],
        practiceQuestions: [
          { date: "2026-04-29", count: 2 },
          { date: "2026-04-30", count: 3 },
          { date: "2026-05-01", count: 4 },
          { date: "2026-05-02", count: 5 },
          { date: "2026-05-03", count: 6 },
          { date: "2026-05-04", count: 7 },
          { date: "2026-05-05", count: 9 }
        ],
        exams: [
          { date: "2026-04-29", count: 0 },
          { date: "2026-04-30", count: 1 },
          { date: "2026-05-01", count: 0 },
          { date: "2026-05-02", count: 1 },
          { date: "2026-05-03", count: 1 },
          { date: "2026-05-04", count: 1 },
          { date: "2026-05-05", count: 2 }
        ]
      }
    });
  }) as typeof apiClient.get);
}
