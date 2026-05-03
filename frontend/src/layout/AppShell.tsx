import { Bell, Moon, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { apiClient } from "../api/client";
import type { Identity } from "../api/types";
import { routeTitleForPath } from "../routes/config";
import type { AppShellOutletContext } from "../routes/ProtectedRoute";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  loadIdentity?: () => Promise<Identity>;
}

const FALLBACK_IDENTITY: Identity = {
  ip: "0.0.0.0",
  role: "learner",
  roleLabel: "学习者",
  permissions: []
};

export function AppShell({ loadIdentity = loadCurrentIdentity }: AppShellProps) {
  const location = useLocation();
  const [identity, setIdentity] = useState<Identity>(FALLBACK_IDENTITY);
  const [identityStatus, setIdentityStatus] = useState<"loading" | "ready" | "error">("loading");
  const pageTitle = useMemo(() => routeTitleForPath(location.pathname), [location.pathname]);
  const outletContext = useMemo<AppShellOutletContext>(
    () => ({ identity, identityStatus }),
    [identity, identityStatus]
  );

  useEffect(() => {
    let isMounted = true;

    setIdentityStatus("loading");
    loadIdentity()
      .then((nextIdentity) => {
        if (!isMounted) {
          return;
        }

        setIdentity(nextIdentity);
        setIdentityStatus("ready");
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setIdentity(FALLBACK_IDENTITY);
        setIdentityStatus("error");
      });

    return () => {
      isMounted = false;
    };
  }, [loadIdentity]);

  return (
    <div className="app-shell">
      <Sidebar identity={identity} identityStatus={identityStatus} />

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{pageTitle}</h1>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" aria-label="查看通知" title="查看通知">
              <span className="nav-icon">
                <Bell aria-hidden="true" />
              </span>
            </button>
            <button className="ghost-button" type="button" aria-label="切换主题">
              <Moon aria-hidden="true" size={18} />
              Light
            </button>
            <Link className="primary-button" to="/practice" aria-label="开始练习">
              <Play aria-hidden="true" size={18} />
              开始练习
            </Link>
          </div>
        </header>

        <Outlet context={outletContext} />
      </main>
    </div>
  );
}

function loadCurrentIdentity(): Promise<Identity> {
  return apiClient.me();
}
