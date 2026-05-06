import { NavLink } from "react-router-dom";
import type { Identity } from "../api/types";
import { BrandMark } from "../components/BrandMark";
import { APP_ROUTES, canAccessRoute, type AppRouteConfig } from "../routes/config";

export interface SidebarProps {
  identity: Identity;
  identityStatus: "loading" | "ready" | "error";
}

const LEARNER_ITEMS = APP_ROUTES.filter((route) => route.section === "learner");
const ADMIN_ITEMS = APP_ROUTES.filter((route) => route.section === "admin");

export function Sidebar({ identity, identityStatus }: SidebarProps) {
  const adminItems = ADMIN_ITEMS.filter((item) => canAccessRoute(identity.role, item));

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
        <div className="nav-section">训练</div>
        {LEARNER_ITEMS.map((item) => (
          <SidebarLink item={item} key={item.path} />
        ))}

        {adminItems.length > 0 ? (
          <div className="nav-list">
            <div className="nav-section">管理</div>
            {adminItems.map((item) => (
              <SidebarLink item={item} key={item.path} />
            ))}
          </div>
        ) : null}
      </nav>

      <div className="identity-card" aria-label="当前身份信息">
        <div className="identity-top">
          <span>当前身份</span>
          <strong>{identity.roleLabel}</strong>
        </div>
        <div className="identity-ip">{identity.ip}</div>
        {identityStatus === "loading" ? <span className="identity-loading-indicator" aria-label="身份加载中" /> : null}
        {identityStatus === "error" ? <p className="identity-state error">无法加载身份，已使用访客学习者模式</p> : null}
      </div>
    </aside>
  );
}

function SidebarLink({ item }: { item: AppRouteConfig }) {
  const Icon = item.icon;

  return (
    <NavLink className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")} end={item.path === "/"} to={item.path}>
      <span className="nav-icon">
        <Icon aria-hidden="true" />
      </span>
      {item.navLabel}
    </NavLink>
  );
}
