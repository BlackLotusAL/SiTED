import {
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  FileQuestion,
  GraduationCap,
  Home,
  Library,
  Settings,
  ShieldCheck
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import type { Identity } from "../api/types";
import type { Role } from "../domain/labels";

export interface SidebarProps {
  identity: Identity;
  identityStatus: "loading" | "ready" | "error";
}

interface NavItem {
  label: string;
  to: string;
  icon: typeof Home;
  minimumRole?: Role;
}

const LEARNER_ITEMS: NavItem[] = [
  { label: "首页", to: "/", icon: Home },
  { label: "题库", to: "/questions", icon: Library },
  { label: "练习", to: "/practice", icon: GraduationCap },
  { label: "背诵", to: "/recite", icon: BookOpenCheck },
  { label: "复习", to: "/review", icon: ClipboardList },
  { label: "模拟考", to: "/exam", icon: FileQuestion }
];

const ADMIN_ITEMS: NavItem[] = [
  { label: "题目管理", to: "/admin/questions", icon: ShieldCheck, minimumRole: "content_admin" },
  { label: "运营看板", to: "/admin/stats", icon: BarChart3, minimumRole: "content_admin" },
  { label: "系统设置", to: "/admin/settings", icon: Settings, minimumRole: "system_admin" }
];

const ROLE_RANK: Record<Role, number> = {
  learner: 0,
  content_admin: 1,
  system_admin: 2
};

export function Sidebar({ identity, identityStatus }: SidebarProps) {
  const adminItems = ADMIN_ITEMS.filter((item) => canAccess(identity.role, item.minimumRole));

  return (
    <aside className="sidebar" aria-label="主导航">
      <div className="brand">
        <BrandMark />
        <div>
          <strong>SiTED</strong>
          <span>Trusted Engineering Dojo</span>
        </div>
      </div>

      <nav className="nav-list">
        {LEARNER_ITEMS.map((item) => (
          <SidebarLink item={item} key={item.to} />
        ))}

        {adminItems.length > 0 ? (
          <>
            <div className="nav-section">管理</div>
            {adminItems.map((item) => (
              <SidebarLink item={item} key={item.to} />
            ))}
          </>
        ) : null}
      </nav>

      <div className="identity-card" aria-label="当前身份信息">
        <div className="identity-top">
          <span>当前身份</span>
          <strong>{identity.roleLabel}</strong>
        </div>
        <div className="identity-ip">{identity.ip}</div>
        {identityStatus === "loading" ? <p className="identity-state">正在加载身份...</p> : null}
        {identityStatus === "error" ? <p className="identity-state error">无法加载身份，已使用访客学习者模式</p> : null}
      </div>
    </aside>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon;

  return (
    <NavLink className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} end={item.to === "/"} to={item.to}>
      <span className="nav-icon">
        <Icon aria-hidden="true" />
      </span>
      {item.label}
    </NavLink>
  );
}

function canAccess(role: Role, minimumRole: Role | undefined): boolean {
  return minimumRole === undefined || ROLE_RANK[role] >= ROLE_RANK[minimumRole];
}
