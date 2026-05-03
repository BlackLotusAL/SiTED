import { AlertTriangle, Flag, Save } from "lucide-react";
import { useState } from "react";

type ExamState = "answering" | "confirming" | "review";

const EXAM_QUESTION = {
  title: "以下哪些措施可以降低用户输入进入 SQL 查询时的安全风险？",
  sourceLabel: "科目三 / Python / 工作级",
  options: [
    { key: "A", label: "使用参数化查询", correct: true },
    { key: "B", label: "拼接前删除空格", correct: false },
    { key: "C", label: "限制数据库账号权限", correct: true },
    { key: "D", label: "在前端隐藏输入框", correct: false }
  ]
};

export function ExamPage() {
  const [selectedKeys, setSelectedKeys] = useState<string[]>(["A", "C"]);
  const [flagged, setFlagged] = useState(false);
  const [examState, setExamState] = useState<ExamState>("answering");
  const [autosaveState, setAutosaveState] = useState("已自动保存 10:42");

  function toggleAnswer(key: string) {
    if (examState === "review") {
      return;
    }

    setSelectedKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
    setAutosaveState("正在自动保存...");
    window.setTimeout(() => setAutosaveState("已自动保存刚刚"), 250);
  }

  return (
    <div className="exam-layout">
      <section className="panel exam-paper">
        <div className="question-progress">
          <span>模拟考 / {EXAM_QUESTION.sourceLabel}</span>
          <strong>{examState === "review" ? "复盘中" : "剩余 31:42"}</strong>
        </div>
        <h2>{EXAM_QUESTION.sourceLabel} 模拟考</h2>
        <h3>{EXAM_QUESTION.title}</h3>
        <div className="options multi" role="group" aria-label="考试答案选项">
          {EXAM_QUESTION.options.map((option) => {
            const selected = selectedKeys.includes(option.key);
            const className = [
              "option",
              selected ? "selected" : "",
              examState === "review" && option.correct ? "is-correct" : "",
              examState === "review" && selected && !option.correct ? "is-wrong" : ""
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button className={className} type="button" onClick={() => toggleAnswer(option.key)} key={option.key}>
                <span>{option.key}</span>
                {option.label}
              </button>
            );
          })}
        </div>
        <div className="practice-actions">
          <button className="secondary-button" type="button" onClick={() => setFlagged((current) => !current)} disabled={examState === "review"}>
            <Flag aria-hidden="true" size={17} />
            {flagged ? "取消疑问" : "标记疑问"}
          </button>
          <button className="primary-button" type="button" onClick={() => setAutosaveState("已自动保存刚刚")} disabled={examState === "review"}>
            <Save aria-hidden="true" size={17} />
            保存并下一题
          </button>
        </div>
        {examState === "review" ? (
          <div className="answer-panel review-state">
            <strong>复盘结果：本题正确</strong>
            <p>参数化查询和最小权限能直接降低注入影响面。删除空格和隐藏输入框不能作为安全控制。</p>
          </div>
        ) : null}
      </section>

      <aside className="panel answer-sheet">
        <div className="panel-heading compact">
          <div>
            <h3>答题卡</h3>
            <p>40 题 / 合格线 60%</p>
          </div>
        </div>
        <div className="sheet-grid" aria-label="答题卡">
          {Array.from({ length: 20 }, (_, index) => {
            const number = index + 1;
            const className = number === 5 ? "current" : number === 4 && flagged ? "flagged" : number < 5 ? "done" : "";

            return (
              <button className={className} type="button" key={number}>
                {number}
              </button>
            );
          })}
        </div>
        <div className="legend">
          <span>
            <b className="done" />
            已答
          </span>
          <span>
            <b className="current" />
            当前
          </span>
          <span>
            <b className="flagged" />
            疑问
          </span>
        </div>
        <p className="autosave-state">{autosaveState}</p>
        {examState === "confirming" ? (
          <div className="submit-confirmation" role="alert">
            <strong>
              <AlertTriangle aria-hidden="true" size={17} />
              交卷确认
            </strong>
            <p>当前还有 15 道未作答。交卷后将进入复盘，成绩和错题会写入记录。</p>
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={() => setExamState("answering")}>
                继续答题
              </button>
              <button className="danger-button" type="button" onClick={() => setExamState("review")}>
                确认交卷
              </button>
            </div>
          </div>
        ) : (
          <button className="danger-button" type="button" onClick={() => setExamState("confirming")} disabled={examState === "review"}>
            {examState === "review" ? "已交卷" : "交卷"}
          </button>
        )}
      </aside>
    </div>
  );
}
