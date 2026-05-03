import { Link } from "react-router-dom";
import { TrainingCalendar } from "../components/TrainingCalendar";
import { getSubjectLabel } from "../domain/labels";

export function DashboardPage() {
  return (
    <div className="dashboard-grid">
      <section className="overview-panel">
        <div className="overview-copy">
          <p className="hero-label">今日训练</p>
          <h2>继续完成科目二工作级练习</h2>
          <p>今天已完成 28 道题，正确率稳定在 82%。错题复习还剩 7 道，建议先完成复习再进入模拟考。</p>
          <div className="button-row">
            <Link className="primary-button" to="/practice">
              继续练习
            </Link>
            <Link className="secondary-button" to="/review">
              复习错题
            </Link>
          </div>
        </div>
        <TrainingCalendar />
      </section>

      <MetricCard title="今日作答" value="28" note="比昨日多 9 题" />
      <MetricCard className="accent-blue" title="正确率" value="82%" note="近 30 天 +6%" />
      <MetricCard className="accent-amber" title="待复习错题" value="7" note="3 题已连续答对 2 次" />
      <MetricCard className="accent-coral" title="最近模拟考" value="76" note="科目三 / Python" />

      <section className="panel dashboard-wide">
        <div className="panel-heading">
          <h3>三类科目的可练习状态</h3>
          <Link className="text-button" to="/questions">
            查看题库
          </Link>
        </div>
        <div className="coverage-list">
          <CoverageRow className="violet" label={getSubjectLabel("programming")} note="C / C++ / Python / Java，12 个组合" value={78} />
          <CoverageRow className="blue" label={getSubjectLabel("security_privacy")} note="工作级、专业级，8 个组合" value={64} />
          <CoverageRow className="amber" label={getSubjectLabel("refactoring")} note="不区分语言，专业级" value={91} />
        </div>
      </section>

      <section className="panel dashboard-wide">
        <div className="panel-heading">
          <h3>推荐工作流</h3>
        </div>
        <div className="task-stack">
          <Link className="task-row" to="/review">
            <span className="task-index">01</span>
            <div>
              <strong>先复习未掌握错题</strong>
              <small>7 道题，预计 6 分钟</small>
            </div>
          </Link>
          <Link className="task-row" to="/questions">
            <span className="task-index">02</span>
            <div>
              <strong>补齐 Python 安全题源</strong>
              <small>筛选工作级，多选题优先</small>
            </div>
          </Link>
          <Link className="task-row" to="/exam">
            <span className="task-index">03</span>
            <div>
              <strong>进入 45 分钟模拟考</strong>
              <small>交卷后自动生成复盘</small>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ title, value, note, className = "" }: { title: string; value: string; note: string; className?: string }) {
  return (
    <div className={`metric-card ${className}`.trim()}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
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
