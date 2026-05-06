import { useMemo } from "react";
import { apiClient } from "../api/client";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { StatsPanel } from "../components/StatsPanel";
import { TrendChart, type TrendChartPoint } from "../components/TrendChart";
import { getSubjectLabel, type Subject } from "../domain/labels";
import { useStaleResource } from "../hooks/useStaleResource";

interface AdminStatsResponse {
  questions: {
    total: number;
    published: number;
    bySubject: Array<{ subject: Subject; count: number }>;
  };
  lowCorrectRateQuestions: Array<{
    id: string;
    sourceCode: string | null;
    stemMd: string;
    totalAttempts: number;
    correctAttempts: number;
    correctRate: number;
  }>;
  today: {
    visitors: number;
    practiceQuestions: number;
    exams: number;
  };
  trends: {
    visitors: TrendResponsePoint[];
    practiceQuestions: TrendResponsePoint[];
    exams: TrendResponsePoint[];
  };
}

interface TrendResponsePoint {
  date: string;
  count: number;
}

export function AdminStatsPage() {
  const statsResource = useStaleResource<AdminStatsResponse | null>({
    key: "/admin/stats",
    load: async () => (await apiClient.get<AdminStatsResponse>("/admin/stats")) ?? null
  });
  const viewModel = useMemo(() => (statsResource.data ? toViewModel(statsResource.data) : null), [statsResource.data]);

  if ((statsResource.error && statsResource.data === undefined) || statsResource.data === null) {
    return (
      <section className="panel" role="alert">
        运营数据加载失败，请稍后重试。
      </section>
    );
  }

  if (viewModel === null) {
    return <LoadingSkeleton variant="stats" />;
  }

  return (
    <>
      {statsResource.error ? <p className="status-message error">运营数据刷新失败，已保留上次成功数据。</p> : null}
      <div className="stats-kpis">
        <MetricCard label="当前题库数量" value={viewModel.questionTotal} note={`已发布 ${viewModel.publishedQuestions}`} />
        <MetricCard className="accent-blue" label="今日访问用户" value={viewModel.todayVisitors} note={viewModel.visitorDeltaNote} />
        <MetricCard className="accent-violet" label="今日练习题数" value={viewModel.todayPracticeQuestions} note={viewModel.averagePracticeNote} />
        <MetricCard className="accent-amber" label="今日模拟考" value={viewModel.todayExams} note="今日记录" />
      </div>

      <div className="stats-layout admin-stats-layout">
        <StatsPanel title="题库统计">
          <div className="bank-stat-summary">
            <span>题目总量</span>
            <strong>{viewModel.questionTotal}</strong>
            <small>覆盖 3 个科目、6 种语言、3 个级别</small>
          </div>
          <div className="distribution-list">
            {viewModel.distribution.map((item) => (
              <div className="distribution-row" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.count}</strong>
                <div className="distribution-track">
                  <i style={{ width: `${item.percent}%` }}></i>
                </div>
              </div>
            ))}
          </div>
          <div className="ranking-panel">
            <h3>Top10 低正确率题目</h3>
            {viewModel.lowCorrectRateQuestions.length > 0 ? (
              <ol className="ranking-list">
                {viewModel.lowCorrectRateQuestions.map((question) => (
                  <li key={question.id}>
                    <span>{question.title}</span>
                    <b>{question.correctRate}</b>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-state">暂无练习记录。</p>
            )}
          </div>
        </StatsPanel>

        <StatsPanel title="训练统计">
          <div className="trend-charts" aria-label="近 7 天三项指标独立趋势图">
            <TrendChart color="blue" data={viewModel.visitorTrend} title="访问用户" unit="人" />
            <TrendChart color="violet" data={viewModel.practiceTrend} title="练习题数" unit="题" />
            <TrendChart color="amber" data={viewModel.examTrend} title="模拟考" unit="次" />
          </div>
        </StatsPanel>
      </div>
    </>
  );
}

function MetricCard({ label, value, note, className = "" }: { label: string; value: string; note: string; className?: string }) {
  return (
    <div className={`metric-card ${className}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function toViewModel(stats: AdminStatsResponse) {
  const visitorTrend = toTrendChartData(stats.trends.visitors);
  const practiceTrend = toTrendChartData(stats.trends.practiceQuestions);
  const examTrend = toTrendChartData(stats.trends.exams);
  const yesterdayVisitors = stats.trends.visitors.at(-2)?.count ?? 0;
  const visitorDelta = stats.today.visitors - yesterdayVisitors;
  const maxSubjectCount = Math.max(...stats.questions.bySubject.map((item) => item.count), 1);

  return {
    questionTotal: formatNumber(stats.questions.total),
    publishedQuestions: formatNumber(stats.questions.published),
    todayVisitors: formatNumber(stats.today.visitors),
    todayPracticeQuestions: formatNumber(stats.today.practiceQuestions),
    todayExams: formatNumber(stats.today.exams),
    visitorDeltaNote: `较昨日 ${formatSignedNumber(visitorDelta)}`,
    averagePracticeNote: `人均 ${formatAverage(stats.today.practiceQuestions, stats.today.visitors)} 题`,
    distribution: stats.questions.bySubject.map((item) => ({
      label: getSubjectLabel(item.subject),
      count: formatNumber(item.count),
      percent: Math.round((item.count / maxSubjectCount) * 100)
    })),
    lowCorrectRateQuestions: stats.lowCorrectRateQuestions.map((question) => ({
      id: question.id,
      title: toQuestionTitle(question),
      correctRate: `${correctRateFromAttempts(question)}%`
    })),
    visitorTrend,
    practiceTrend,
    examTrend
  };
}

function toTrendChartData(points: TrendResponsePoint[]): TrendChartPoint[] {
  return points.map((point) => ({
    label: formatTrendDate(point.date),
    value: point.count
  }));
}

function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatNumber(value)}`;
}

function formatAverage(total: number, count: number): string {
  return count === 0 ? "0.0" : (total / count).toFixed(1);
}

function correctRateFromAttempts(question: { totalAttempts: number; correctAttempts: number }): number {
  return question.totalAttempts === 0 ? 0 : Math.round((question.correctAttempts / question.totalAttempts) * 100);
}

function formatTrendDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function toQuestionTitle(question: { stemMd: string; sourceCode: string | null; id: string }): string {
  const plainStem = question.stemMd
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return plainStem.slice(0, 32) || question.sourceCode || question.id;
}
