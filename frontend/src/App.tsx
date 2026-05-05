import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PlaceholderPage } from "./components/PlaceholderPage";
import type { Identity } from "./api/types";
import { AppShell } from "./layout/AppShell";
import { AdminQuestionsPage } from "./pages/AdminQuestionsPage";
import { AdminSettingsPage } from "./pages/AdminSettingsPage";
import { AdminStatsPage } from "./pages/AdminStatsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ExamPage } from "./pages/ExamPage";
import { PracticePage } from "./pages/PracticePage";
import { QuestionsPage } from "./pages/QuestionsPage";
import { ReviewPage } from "./pages/ReviewPage";
import { APP_ROUTES, pathToRoutePath } from "./routes/config";
import { ProtectedRoute } from "./routes/ProtectedRoute";

interface AppProps {
  loadIdentity?: () => Promise<Identity>;
}

function App({ loadIdentity }: AppProps) {
  return (
    <Routes>
      <Route path="/" element={<AppShell loadIdentity={loadIdentity} />}>
        {APP_ROUTES.map((route) => {
          const page = LEARNER_PAGES[route.path] ?? (
            <PlaceholderPage eyebrow={route.eyebrow} title={route.title}>
              {route.placeholder}
            </PlaceholderPage>
          );
          const element =
            route.minimumRole === undefined ? page : <ProtectedRoute route={route}>{page}</ProtectedRoute>;

          return route.index ? (
            <Route index element={element} key={route.path} />
          ) : (
            <Route path={pathToRoutePath(route.path)} element={element} key={route.path} />
          );
        })}
        <Route path="recite" element={<Navigate replace to="/practice?mode=recite" />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}

export default App;

const LEARNER_PAGES: Record<string, ReactElement> = {
  "/": <DashboardPage />,
  "/questions": <QuestionsPage />,
  "/practice": <PracticePage />,
  "/review": <ReviewPage />,
  "/exam": <ExamPage />,
  "/admin/questions": <AdminQuestionsPage />,
  "/admin/stats": <AdminStatsPage />,
  "/admin/settings": <AdminSettingsPage />
};
