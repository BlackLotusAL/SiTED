import { Navigate, Route, Routes } from "react-router-dom";
import { PlaceholderPage } from "./components/PlaceholderPage";
import { AppShell } from "./layout/AppShell";

function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route
          index
          element={
            <PlaceholderPage eyebrow="今日训练" title="训练工作台">
              Task 8 frontend foundation is ready for learner and admin page implementations.
            </PlaceholderPage>
          }
        />
        <Route
          path="questions"
          element={
            <PlaceholderPage eyebrow="题库" title="题库浏览">
              Browse, filter, and start practice from published questions in the next frontend task.
            </PlaceholderPage>
          }
        />
        <Route
          path="practice"
          element={
            <PlaceholderPage eyebrow="练习" title="单题练习">
              Practice flow placeholder for answer submission and immediate feedback.
            </PlaceholderPage>
          }
        />
        <Route
          path="recite"
          element={
            <PlaceholderPage eyebrow="背诵" title="快速背诵">
              Recite mode placeholder for fast question review.
            </PlaceholderPage>
          }
        />
        <Route
          path="review"
          element={
            <PlaceholderPage eyebrow="复习" title="错题复习">
              Review placeholder for mistakes, bookmarks, and recent practice history.
            </PlaceholderPage>
          }
        />
        <Route
          path="exam"
          element={
            <PlaceholderPage eyebrow="模拟考" title="模拟考试">
              Exam placeholder for paper selection, timed answering, and history.
            </PlaceholderPage>
          }
        />
        <Route
          path="admin/questions"
          element={
            <PlaceholderPage eyebrow="管理" title="题目管理">
              Admin question maintenance placeholder for Task 10.
            </PlaceholderPage>
          }
        />
        <Route
          path="admin/stats"
          element={
            <PlaceholderPage eyebrow="管理" title="运营看板">
              Admin statistics placeholder for Task 10.
            </PlaceholderPage>
          }
        />
        <Route
          path="admin/settings"
          element={
            <PlaceholderPage eyebrow="管理" title="系统设置">
              System settings placeholder for Task 10.
            </PlaceholderPage>
          }
        />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}

export default App;
