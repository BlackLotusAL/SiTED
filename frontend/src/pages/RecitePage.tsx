import { PracticeQuestionRenderer, type PracticeQuestion } from "./PracticePage";

const RECITE_QUESTION: PracticeQuestion = {
  id: "recite-java-map",
  sourceLabel: "科目二 / Java / 工作级",
  progressLabel: "背诵模式",
  title: "下面哪个集合适合在并发读写场景下作为线程安全 Map 使用？",
  code: "Map<String, Integer> cache = new ________();",
  options: [
    { key: "A", label: "ArrayList", correct: false },
    { key: "B", label: "HashMap", correct: false },
    { key: "C", label: "ConcurrentHashMap", correct: true },
    { key: "D", label: "LinkedList", correct: false }
  ],
  explanation: "ConcurrentHashMap 面向并发访问场景，能在高并发读写时降低锁竞争。背诵模式只展示答案和解析，不写入练习记录。"
};

export function RecitePage() {
  return (
    <div className="practice-shell">
      <PracticeQuestionRenderer question={RECITE_QUESTION} mode="recite" />

      <aside className="side-stack">
        <section className="panel mini-panel fixed-mini-panel">
          <h3>背诵范围</h3>
          <p>科目二 / Java / 工作级</p>
          <p>直接查看答案和解析，不提交尝试记录。</p>
        </section>
        <section className="panel mini-panel fixed-mini-panel">
          <h3>记忆状态</h3>
          <div className="status-list">
            <span>
              <b /> 已收藏 18
            </span>
            <span>
              <b className="amber" /> 高频错题 7
            </span>
            <span>
              <b className="blue" /> 今日浏览 24
            </span>
          </div>
        </section>
      </aside>
    </div>
  );
}
