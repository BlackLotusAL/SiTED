import { Navigate, Route, Routes } from "react-router-dom";
import { PlaceholderPage } from "./components/PlaceholderPage";
import type { Identity } from "./api/types";
import { AppShell } from "./layout/AppShell";
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
          const page = (
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
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}

export default App;
