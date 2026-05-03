import { StatsPanel } from "../components/StatsPanel";
import { TrendChart } from "../components/TrendChart";

const distribution = [
  { label: "科目二（编程知识）", count: 6420, percent: 74 },
  { label: "科目三（安全质量隐私）", count: 3860, percent: 48 },
  { label: "科目四（重构知识）", count: 2206, percent: 31 }
];

const lowAccuracyQuestions = [
  ["SQL 注入参数边界", "38%"],
  ["volatile 与原子性", "42%"],
  ["线程池拒绝策略", "45%"],
  ["隐私数据脱敏范围", "47%"],
  ["接口拆分原则", "49%"],
  ["异常传播边界", "51%"],
  ["资源释放顺序", "52%"],
  ["最小权限原则", "53%"],
  ["并发集合选择", "55%"],
  ["重构回归风险", "57%"]
];

const visitorTrend = [
  { label: "4/27", value: 58 },
  { label: "4/28", value: 64 },
  { label: "4/29", value: 61 },
  { label: "4/30", value: 79 },
  { label: "5/1", value: 83 },
  { label: "5/2", value: 91 },
  { label: "5/3", value: 86 }
];

const practiceTrend = [
  { label: "4/27", value: 760 },
  { label: "4/28", value: 940 },
  { label: "4/29", value: 880 },
  { label: "4/30", value: 1030 },
  { label: "5/1", value: 1190 },
  { label: "5/2", value: 1360 },
  { label: "5/3", value: 1284 }
];

const examTrend = [
  { label: "4/27", value: 18 },
  { label: "4/28", value: 21 },
  { label: "4/29", value: 20 },
  { label: "4/30", value: 29 },
  { label: "5/1", value: 34 },
  { label: "5/2", value: 43 },
  { label: "5/3", value: 37 }
];

export function AdminStatsPage() {
  return (
    <>
      <div className="stats-kpis">
        <MetricCard label="当前题库数量" value="12,486" note="已发布 11,920" />
        <MetricCard className="accent-blue" label="今日访问用户" value="86" note="较昨日 +12" />
        <MetricCard className="accent-violet" label="今日练习题数" value="1,284" note="人均 14.9 题" />
        <MetricCard className="accent-amber" label="今日模拟考" value="37" note="完成率 78%" />
      </div>

      <div className="stats-layout admin-stats-layout">
        <StatsPanel title="题库统计">
          <div className="bank-stat-summary">
            <span>题目总量</span>
            <strong>12,486</strong>
            <small>覆盖 3 个科目、6 种语言、3 个级别</small>
          </div>
          <div className="distribution-list">
            {distribution.map((item) => (
              <div className="distribution-row" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.count.toLocaleString("zh-CN")}</strong>
                <div className="distribution-track">
                  <i style={{ width: `${item.percent}%` }}></i>
                </div>
              </div>
            ))}
          </div>
          <div className="ranking-panel">
            <h3>Top10 低正确率题目</h3>
            <ol className="ranking-list">
              {lowAccuracyQuestions.map(([title, accuracy]) => (
                <li key={title}>
                  <span>{title}</span>
                  <b>{accuracy}</b>
                </li>
              ))}
            </ol>
          </div>
        </StatsPanel>

        <StatsPanel title="训练统计">
          <div className="trend-charts" aria-label="近 7 天三项指标独立趋势图">
            <TrendChart color="blue" data={visitorTrend} max={100} title="访问用户" unit="人" />
            <TrendChart color="violet" data={practiceTrend} max={1500} title="练习题数" unit="题" />
            <TrendChart color="amber" data={examTrend} max={50} title="模拟考" unit="次" />
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
