import { useState } from "react";
import { ReviewTabs, type ReviewTab } from "../components/ReviewTabs";

const mistakes = [
  {
    title: "volatile 能保证复合操作的原子性。",
    source: "科目二 / Java",
    count: 4,
    status: "连续答对 2 次",
    statusClass: "warning",
    action: "重练"
  },
  {
    title: "SQL 注入防护中的参数化查询边界",
    source: "科目三 / Python",
    count: 2,
    status: "未掌握",
    statusClass: "needs-work",
    action: "重练"
  },
  {
    title: "重构时何时提取方法",
    source: "科目四",
    count: 1,
    status: "已掌握",
    statusClass: "success",
    action: "取消掌握"
  }
];

const bookmarks = [
  {
    title: "线程池拒绝策略的选择",
    source: "科目二 / Java",
    type: "多选题",
    recent: "今天 10:26",
    action: "练习"
  },
  {
    title: "隐私数据脱敏的最小化原则",
    source: "科目三 / Python",
    type: "单选题",
    recent: "昨天 16:40",
    action: "练习"
  }
];

const records = [
  {
    title: "科目二工作级专项",
    source: "科目二 / Python",
    count: 20,
    result: "正确率 70%",
    resultClass: "warning"
  },
  {
    title: "科目二 Java 集合专项",
    source: "科目二 / Java",
    count: 40,
    result: "正确率 88%",
    resultClass: "success"
  }
];

export function ReviewPage() {
  const [activeTab, setActiveTab] = useState<ReviewTab>("mistakes");

  return (
    <>
      <div className="review-toolbar">
        <ReviewTabs activeTab={activeTab} onChange={setActiveTab} />
      </div>

      <div className="review-panels">
        {activeTab === "mistakes" ? <MistakesPanel /> : null}
        {activeTab === "bookmarks" ? <BookmarksPanel /> : null}
        {activeTab === "records" ? <RecordsPanel /> : null}
      </div>
    </>
  );
}

function MistakesPanel() {
  return (
    <section className="review-table panel" aria-label="错题列表">
      <div className="table-head">
        <span>题目</span>
        <span>题源</span>
        <span>错次</span>
        <span>掌握状态</span>
        <span className="operation-column">操作</span>
      </div>
      {mistakes.map((item) => (
        <div className="table-row" key={item.title}>
          <strong>{item.title}</strong>
          <span>{item.source}</span>
          <span>{item.count}</span>
          <span className={`status-chip ${item.statusClass}`}>{item.status}</span>
          <span className="operation-column">
            <button className="text-button" type="button">
              {item.action}
            </button>
          </span>
        </div>
      ))}
    </section>
  );
}

function BookmarksPanel() {
  return (
    <section className="review-table panel" aria-label="收藏列表">
      <div className="table-head bookmarks">
        <span>收藏题目</span>
        <span>题源</span>
        <span>题型</span>
        <span>最近练习</span>
        <span className="operation-column">操作</span>
      </div>
      {bookmarks.map((item) => (
        <div className="table-row bookmarks" key={item.title}>
          <strong>{item.title}</strong>
          <span>{item.source}</span>
          <span>{item.type}</span>
          <span>{item.recent}</span>
          <span className="operation-column">
            <button className="text-button" type="button">
              {item.action}
            </button>
          </span>
        </div>
      ))}
    </section>
  );
}

function RecordsPanel() {
  return (
    <section className="review-table panel" aria-label="练习记录">
      <div className="table-head records">
        <span>练习记录</span>
        <span>题源</span>
        <span>题数</span>
        <span>结果</span>
        <span className="operation-column">操作</span>
      </div>
      {records.map((item) => (
        <div className="table-row records" key={item.title}>
          <strong>{item.title}</strong>
          <span>{item.source}</span>
          <span>{item.count}</span>
          <span className={`status-chip ${item.resultClass}`}>{item.result}</span>
          <span className="operation-column">
            <button className="text-button" type="button">
              查看
            </button>
          </span>
        </div>
      ))}
    </section>
  );
}
