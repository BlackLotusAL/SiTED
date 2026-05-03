import { CheckCircle2, CircleAlert } from "lucide-react";
import { useState } from "react";

export interface PracticeQuestion {
  id: string;
  sourceLabel: string;
  progressLabel: string;
  title: string;
  code?: string;
  options: Array<{ key: string; label: string; correct: boolean }>;
  explanation: string;
}

const PRACTICE_QUESTIONS: PracticeQuestion[] = [
  {
    id: "java-map",
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
  },
  {
    id: "java-exception",
    sourceLabel: "科目二 / Java / 工作级",
    progressLabel: "第 13 / 40 题",
    title: "关于 checked exception 和 unchecked exception，下列说法正确的是？",
    options: [
      { key: "A", label: "checked exception 需要调用方处理或继续声明抛出", correct: true },
      { key: "B", label: "unchecked exception 不能被 catch 捕获", correct: false },
      { key: "C", label: "所有异常都必须在方法签名中声明", correct: false },
      { key: "D", label: "异常类型会影响 API 的使用边界", correct: true }
    ],
    explanation: "checked exception 会形成编译期约束；unchecked exception 通常表达编程错误或运行时失败，但仍然可以被捕获。"
  }
];

interface PracticeQuestionRendererProps {
  question: PracticeQuestion;
  mode: "practice" | "recite";
  onNextQuestion?: () => void;
}

export function PracticeQuestionRenderer({ question, mode, onNextQuestion }: PracticeQuestionRendererProps) {
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
    if (!submitted) {
      return;
    }

    setSelectedKey(undefined);
    setSubmitted(false);
    onNextQuestion?.();
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
              aria-label={getOptionLabel(option, selected, submitted)}
              aria-pressed={selected}
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
          <button className="secondary-button" type="button" onClick={nextQuestion} disabled={!submitted}>
            下一题
          </button>
        </div>
      ) : null}
      {submitted ? (
        <div className="answer-panel" role="status" aria-live="polite">
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
  const [questionIndex, setQuestionIndex] = useState(0);
  const question = PRACTICE_QUESTIONS[questionIndex];

  function advanceQuestion() {
    setQuestionIndex((current) => (current + 1) % PRACTICE_QUESTIONS.length);
  }

  return (
    <div className="practice-shell">
      <PracticeQuestionRenderer question={question} mode="practice" onNextQuestion={advanceQuestion} key={question.id} />

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

function getOptionLabel(option: PracticeQuestion["options"][number], selected: boolean, submitted: boolean): string {
  const parts = [`${option.key} ${option.label}`];

  if (selected) {
    parts.push("已选择");
  }

  if (submitted && option.correct) {
    parts.push("正确答案");
  }

  if (submitted && selected && !option.correct) {
    parts.push("回答错误");
  }

  return parts.join("，");
}
