import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { apiClient } from "../api/client";
import type { DashboardSummary } from "../api/types";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { TrainingCalendar } from "../components/TrainingCalendar";
import { getLanguageLabel, getLevelLabel, getSubjectLabel, type Language, type Level, type Subject } from "../domain/labels";
import { useStaleResource } from "../hooks/useStaleResource";

export function DashboardPage() {
  const summaryResource = useStaleResource<DashboardSummary>({
    key: "/dashboard",
    load: async () => (await apiClient.get<DashboardSummary>("/dashboard")) ?? emptySummary()
  });

  if (summaryResource.isInitialLoading) {
    return <LoadingSkeleton variant="dashboard" />;
  }

  if (summaryResource.error && summaryResource.data === undefined) {
    return (
      <section className="panel" role="alert">
        首页数据加载失败，请稍后重试。
      </section>
    );
  }

  const data = summaryResource.data ?? emptySummary();
  const latestExamLabel = data.latestExam
    ? `${data.latestExam.scorePercent ?? 0}`
    : "暂无记录";
  const latestExamNote = data.latestExam
    ? sourceLabel(data.latestExam.subject, data.latestExam.language, data.latestExam.level)
    : "尚未启动模拟考";

  return (
    <div className="dashboard-grid">
      {summaryResource.error ? <p className="status-message error">首页数据刷新失败，已保留上次成功数据。</p> : null}
      <section className="overview-panel">
        <div className="overview-copy">
          <p className="hero-label">今日训练</p>
          <h2>{data.today.answered > 0 ? "继续完成今日练习" : "先从题库筛选练习"}</h2>
          <p>
            今天已完成 {data.today.answered} 道题，正确率 {data.today.correctRate}%。
            {data.mistakes.unmastered > 0 ? `未掌握错题还剩 ${data.mistakes.unmastered} 道。` : "暂无待复习错题。"}
          </p>
          <div className="overview-facts" aria-label="今日训练摘要">
            <span>
              <small>作答</small>
              <strong>{data.today.answered}</strong>
            </span>
            <span>
              <small>正确率</small>
              <strong>{data.today.correctRate}%</strong>
            </span>
            <span>
              <small>未掌握</small>
              <strong>{data.mistakes.unmastered}</strong>
            </span>
          </div>
          <div className="button-row">
            <Link className="primary-button" to="/practice">
              开始练习
            </Link>
            <Link className="secondary-button" to="/questions">
              题库筛选
            </Link>
          </div>
        </div>
        <TrainingCalendar months={[{ ...data.calendar, days: data.calendar.days }]} initialMonthIndex={0} />
      </section>

      <MetricCard title="今日作答" value={`${data.today.answered}`} note={`答对 ${data.today.correct} / 答错 ${data.today.incorrect}`} />
      <MetricCard className="accent-blue" title="正确率" value={`${data.today.correctRate}%`} note="基于今日真实练习记录" />
      <MetricCard className="accent-amber" title="待复习错题" value={`${data.mistakes.unmastered}`} note="未掌握错题数" />
      <MetricCard className="accent-coral" title="最近模拟考" value={latestExamLabel} note={latestExamNote} />

      <section className="panel dashboard-wide">
        <div className="panel-heading">
          <h3>三类科目的可练习状态</h3>
          <Link className="text-button" to="/questions">
            查看题库
          </Link>
        </div>
        <div className="coverage-list">
          {data.coverage.map((item, index) => (
            <CoverageRow
              className={index === 0 ? "violet" : index === 1 ? "blue" : "amber"}
              label={getSubjectLabel(item.subject as Subject)}
              note={`${item.count} 题`}
              value={coveragePercent(item.count, data.coverage)}
              key={item.subject}
            />
          ))}
        </div>
      </section>

      <section className="panel dashboard-wide">
        <div className="panel-heading">
          <h3>推荐工作流</h3>
        </div>
        <div className="task-stack">
          <Link className="task-row" to={data.mistakes.unmastered > 0 ? "/review" : "/questions"}>
            <span className="task-index">01</span>
            <div>
              <strong>{data.mistakes.unmastered > 0 ? "先复习未掌握错题" : "先从题库筛选练习"}</strong>
              <small>{data.mistakes.unmastered > 0 ? `${data.mistakes.unmastered} 道题` : "选择科目、语言、级别和题型"}</small>
            </div>
          </Link>
          <Link className="task-row" to="/practice?mode=recite">
            <span className="task-index">02</span>
            <div>
              <strong>切换背诵模式</strong>
              <small>直接查看答案和解析，不写入练习记录</small>
            </div>
          </Link>
          <Link className="task-row" to="/exam">
            <span className="task-index">03</span>
            <div>
              <strong>进入模拟考</strong>
              <small>未启动时先选择考试范围</small>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ title, value, note, className = "" }: { title: string; value: string; note: string; className?: string }) {
  return (
    <motion.div className={`metric-card ${className}`.trim()} whileHover={{ y: -3 }} whileTap={{ scale: 0.99 }}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </motion.div>
  );
}

function CoverageRow({ className, label, note, value }: { className: string; label: string; note: string; value: number }) {
  return (
    <div className="coverage-row">
      <span className={`coverage-dot ${className}`} />
      <div>
        <strong>{label}</strong>
        <small>{note}</small>
      </div>
      <meter min="0" max="100" value={value} aria-label={`${label}覆盖率`} />
    </div>
  );
}

function sourceLabel(subject: string, language: string | null, level: string): string {
  return [getSubjectLabel(subject as Subject, "short"), language ? getLanguageLabel(language as Language) : null, getLevelLabel(level as Level)]
    .filter(Boolean)
    .join(" / ");
}

function coveragePercent(count: number, coverage: Array<{ count: number }>): number {
  const max = Math.max(1, ...coverage.map((item) => item.count));
  return Math.round((count / max) * 100);
}

function emptySummary(): DashboardSummary {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  return {
    today: { answered: 0, correct: 0, incorrect: 0, correctRate: 0 },
    mistakes: { unmastered: 0 },
    latestExam: null,
    calendar: {
      year,
      month,
      total: 0,
      days: Array.from({ length: daysInMonth }, (_value, index) => ({ day: index + 1, count: 0 }))
    },
    coverage: [
      { subject: "programming", count: 0 },
      { subject: "security_privacy", count: 0 },
      { subject: "refactoring", count: 0 }
    ]
  };
}
