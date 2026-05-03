import { CheckCircle2, CircleAlert } from "lucide-react";
import { useState } from "react";

export interface PracticeQuestion {
  sourceLabel: string;
  progressLabel: string;
  title: string;
  code?: string;
  options: Array<{ key: string; label: string; correct: boolean }>;
  explanation: string;
}

const QUESTION: PracticeQuestion = {
  sourceLabel: "科目二 / Java / 工作级",
  progressLabel: "第 12 / 40 题",
  title: "下面哪个集合适合在并发读写场景下作为线程安全 Map 使用？",
  code: "Map<String, Integer> cache = new ________();",
  options: [
    { key: "A", label: "ArrayList", correct: false },
    { key: "B", label: "HashMap", correct: false },
    { key: "C", label: "ConcurrentHashMap", correct: true },
    { key: "D", label: "LinkedList", correct: false }
  ],
  explanation: "ConcurrentHashMap 面向并发访问场景，能在高并发读写时降低锁竞争。速记：并发集合优先找 Concurrent 前缀。"
};

interface PracticeQuestionRendererProps {
  question: PracticeQuestion;
  mode: "practice" | "recite";
}

export function PracticeQuestionRenderer({ question, mode }: PracticeQuestionRendererProps) {
  const [selectedKey, setSelectedKey] = useState<string | undefined>(mode === "recite" ? question.options.find((option) => option.correct)?.key : undefined);
  const [submitted, setSubmitted] = useState(mode === "recite");
  const correctKey = question.options.find((option) => option.correct)?.key;
  const isCorrect = submitted && selectedKey === correctKey;

  function submitAnswer() {
    if (mode === "recite" || selectedKey === undefined) {
      return;
    }

    setSubmitted(true);
  }

  function nextQuestion() {
    setSelectedKey(undefined);
    setSubmitted(false);
  }

  return (
    <section className="practice-main panel">
      <div className="question-progress">
        <span>{question.sourceLabel}</span>
        <strong>{question.progressLabel}</strong>
      </div>
      <h2>{question.title}</h2>
      {question.code ? (
        <pre>
          <code>{question.code}</code>
        </pre>
      ) : null}
      <div className="options" role="group" aria-label="答案选项">
        {question.options.map((option) => {
          const selected = selectedKey === option.key;
          const className = [
            "option",
            selected ? "is-selected" : "",
            submitted && option.correct ? "is-correct" : "",
            submitted && selected && !option.correct ? "is-wrong" : ""
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              className={className}
              type="button"
              onClick={() => {
                if (!submitted || mode === "recite") {
                  setSelectedKey(option.key);
                }
              }}
              key={option.key}
            >
              <span>{option.key}</span>
              {option.label}
            </button>
          );
        })}
      </div>
      {mode === "practice" ? (
        <div className="practice-actions">
          <button className="primary-button" type="button" onClick={submitAnswer} disabled={selectedKey === undefined || submitted}>
            提交答案
          </button>
          <button className="secondary-button" type="button" onClick={nextQuestion}>
            下一题
          </button>
        </div>
      ) : null}
      {submitted ? (
        <div className="answer-panel">
          <strong>
            {isCorrect || mode === "recite" ? <CheckCircle2 aria-hidden="true" size={17} /> : <CircleAlert aria-hidden="true" size={17} />}
            {mode === "recite" ? "答案与解析" : isCorrect ? "回答正确" : "回答错误"}
          </strong>
          <p>{question.explanation}</p>
        </div>
      ) : null}
    </section>
  );
}

export function PracticePage() {
  return (
    <div className="practice-shell">
      <PracticeQuestionRenderer question={QUESTION} mode="practice" />

      <aside className="side-stack">
        <section className="panel mini-panel fixed-mini-panel">
          <h3>当前筛选</h3>
          <p>线程安全 / 集合</p>
          <p>本组题源共 96 道，已完成 12 道。</p>
          <div className="linear-progress" aria-label="当前筛选进度">
            <span style={{ width: "30%" }} />
          </div>
        </section>
        <section className="panel mini-panel fixed-mini-panel">
          <h3>快捷状态</h3>
          <div className="status-list">
            <span>
              <b /> 已答 12
            </span>
            <span>
              <b className="amber" /> 待复习 7
            </span>
            <span>
              <b className="blue" /> 收藏 18
            </span>
          </div>
        </section>
      </aside>
    </div>
  );
}
