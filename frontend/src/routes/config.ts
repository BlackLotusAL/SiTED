import {
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  FileQuestion,
  Home,
  Library,
  Settings,
  ShieldCheck,
  type LucideIcon
} from "lucide-react";
import type { Role } from "../domain/labels";

export type RouteSection = "learner" | "admin";

export interface AppRouteConfig {
  path: string;
  index?: boolean;
  label: string;
  navLabel: string;
  eyebrow: string;
  title: string;
  placeholder: string;
  section: RouteSection;
  icon: LucideIcon;
  minimumRole?: Role;
}

export const APP_ROUTES: AppRouteConfig[] = [
  {
    path: "/",
    index: true,
    label: "首页",
    navLabel: "首页",
    eyebrow: "今日训练",
    title: "训练工作台",
    placeholder: "Task 8 frontend foundation is ready for learner and admin page implementations.",
    section: "learner",
    icon: Home
  },
  {
    path: "/questions",
    label: "题库",
    navLabel: "题库",
    eyebrow: "题库",
    title: "题库浏览",
    placeholder: "Browse, filter, and start practice from published questions in the next frontend task.",
    section: "learner",
    icon: Library
  },
  {
    path: "/practice",
    label: "练习",
    navLabel: "练习",
    eyebrow: "练习",
    title: "筛选练习",
    placeholder: "Practice flow placeholder for answer submission and immediate feedback.",
    section: "learner",
    icon: BookOpenCheck
  },
  {
    path: "/review",
    label: "复习",
    navLabel: "复习",
    eyebrow: "复习",
    title: "错题复习",
    placeholder: "Review placeholder for mistakes, bookmarks, and recent practice history.",
    section: "learner",
    icon: ClipboardList
  },
  {
    path: "/exam",
    label: "模拟考",
    navLabel: "模拟考",
    eyebrow: "模拟考",
    title: "模拟考试",
    placeholder: "Exam placeholder for paper selection, timed answering, and history.",
    section: "learner",
    icon: FileQuestion
  },
  {
    path: "/admin/questions",
    label: "题目管理",
    navLabel: "题目管理",
    eyebrow: "管理",
    title: "题目管理",
    placeholder: "Admin question maintenance placeholder for Task 10.",
    section: "admin",
    icon: ShieldCheck,
    minimumRole: "content_admin"
  },
  {
    path: "/admin/stats",
    label: "运营看板",
    navLabel: "运营看板",
    eyebrow: "管理",
    title: "运营看板",
    placeholder: "Admin statistics placeholder for Task 10.",
    section: "admin",
    icon: BarChart3,
    minimumRole: "content_admin"
  },
  {
    path: "/admin/settings",
    label: "系统设置",
    navLabel: "系统设置",
    eyebrow: "管理",
    title: "系统设置",
    placeholder: "System settings placeholder for Task 10.",
    section: "admin",
    icon: Settings,
    minimumRole: "system_admin"
  }
];

export const ROLE_RANK: Record<Role, number> = {
  learner: 0,
  content_admin: 1,
  system_admin: 2
};

export function canAccessRoute(role: Role, route: Pick<AppRouteConfig, "minimumRole">): boolean {
  return route.minimumRole === undefined || ROLE_RANK[role] >= ROLE_RANK[route.minimumRole];
}

export function routeTitleForPath(pathname: string): string {
  return findRouteForPath(pathname)?.label ?? "首页";
}

export function findRouteForPath(pathname: string): AppRouteConfig | undefined {
  return [...APP_ROUTES]
    .sort((left, right) => right.path.length - left.path.length)
    .find((route) => pathname === route.path || (route.path !== "/" && pathname.startsWith(`${route.path}/`)));
}

export function pathToRoutePath(path: string): string {
  return path === "/" ? "" : path.slice(1);
}
