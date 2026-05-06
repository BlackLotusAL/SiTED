import type { ReactElement } from "react";
import { useOutletContext } from "react-router-dom";
import type { Identity } from "../api/types";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { PlaceholderPage } from "../components/PlaceholderPage";
import { canAccessRoute, type AppRouteConfig } from "./config";

export interface AppShellOutletContext {
  identity: Identity;
  identityStatus: "loading" | "ready" | "error";
}

interface ProtectedRouteProps {
  route: AppRouteConfig;
  children: ReactElement;
}

export function ProtectedRoute({ route, children }: ProtectedRouteProps) {
  const { identity, identityStatus } = useOutletContext<AppShellOutletContext>();

  if (identityStatus === "loading") {
    return <LoadingSkeleton variant="route" />;
  }

  if (identityStatus === "error") {
    return (
      <PlaceholderPage eyebrow="权限" title="身份不可用">
        无法确认当前身份，请稍后重试。
      </PlaceholderPage>
    );
  }

  if (!canAccessRoute(identity.role, route)) {
    return (
      <PlaceholderPage eyebrow="403" title="权限不足">
        当前身份无权访问该页面。
      </PlaceholderPage>
    );
  }

  return children;
}
