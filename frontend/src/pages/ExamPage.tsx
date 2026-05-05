import { AlertTriangle, CheckCircle2, Flag, FlagOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiClient } from "../api/client";
import type { ExamDetail, ExamListResponse, ExamQuestion } from "../api/types";
import {
  getLanguageLabel,
  getLevelLabel,
  getSubjectLabel,
  LANGUAGES,
  LEVELS,
  SUBJECTS,
  type Language,
  type Level,
  type Subject
} from "../domain/labels";

type ExamViewState = "loading" | "unstarted" | "answering" | "confirming" | "review" | "error";
type ExamSource = { subject: Subject; language: Language | null; level: Level };

export function ExamPage() {
  const [searchParams] = useSearchParams();
  const examId = searchParams.get("examId");
  const [viewState, setViewState] = useState<ExamViewState>("loading");
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [flaggedQuestionIds, setFlaggedQuestionIds] = useState<Set<string>>(() => new Set());
  const [autosaveState, setAutosaveState] = useState("尚未保存");
  const [source, setSource] = useState<{ subject: Subject; language: Language; level: Level }>({
    subject: "programming",
    language: "java",
    level: "working"
  });

  useEffect(() => {
    let isMounted = true;
    setViewState("loading");

    async function loadExam() {
      try {
        if (examId) {
          const detail = await apiClient.get<ExamDetail>(`/exams/${examId}`);
          if (!isMounted) {
            return;
          }
          setExamState(detail ?? null);
          return;
        }

        const payload = await apiClient.get<ExamListResponse>("/exams");
        if (!isMounted) {
          return;
        }
        const examToOpen = selectExamToOpen(payload?.items ?? []);
        if (!examToOpen) {
          setViewState("unstarted");
          return;
        }
        const detail = await apiClient.get<ExamDetail>(`/exams/${examToOpen.id}`);
        if (!isMounted) {
          return;
        }
        setExamState(detail ?? null);
      } catch {
        if (!isMounted) {
          return;
        }
        setViewState("error");
      }
    }

    void loadExam();

    return () => {
      isMounted = false;
    };
  }, [examId]);

  const currentQuestion = exam?.questions[currentIndex] ?? null;
  const currentAnswers = currentQuestion ? answers[currentQuestion.id] ?? [] : [];
  const totalQuestions = exam?.questions.length ?? 0;
  const answeredCount = useMemo(() => Object.values(answers).filter((value) => value.length > 0).length, [answers]);
  const unansweredCount = Math.max(totalQuestions - answeredCount, 0);

  async function startExam() {
    await startExamWithSource(source);
  }

  function restartExam() {
    if (exam === null) {
      return;
    }
    setSource((current) => ({
      subject: exam.subject as Subject,
      language: (exam.language ?? current.language) as Language,
      level: exam.level as Level
    }));
    setExam(null);
    setAnswers({});
    setFlaggedQuestionIds(new Set());
    setCurrentIndex(0);
    setAutosaveState("尚未保存");
    setViewState("unstarted");
  }

  async function startExamWithSource(nextSource: ExamSource) {
    setViewState("loading");
    try {
      const created = await apiClient.post<ExamDetail>("/exams", nextSource);
      setExamState(created ?? null);
    } catch {
      setViewState("error");
    }
  }

  function setExamState(nextExam: ExamDetail | null) {
    if (nextExam === null) {
      setViewState("unstarted");
      return;
    }
    setExam(nextExam);
    setAnswers(nextExam.answers ?? {});
    setFlaggedQuestionIds(new Set(nextExam.flaggedQuestionIds ?? []));
    setCurrentIndex(0);
    setAutosaveState(nextExam.status === "in_progress" ? "等待保存" : "已交卷");
    setViewState(nextExam.status === "submitted" ? "review" : "answering");
  }

  function toggleAnswer(question: ExamQuestion, key: string) {
    if (viewState === "review") {
      return;
    }
    setAnswers((current) => {
      const existing = current[question.id] ?? [];
      const nextAnswers =
        question.type === "multiple"
          ? existing.includes(key)
            ? existing.filter((item) => item !== key)
            : [...existing, key]
          : [key];
      return { ...current, [question.id]: nextAnswers };
    });
    setAutosaveState("有未保存作答");
  }

  async function saveAndNext() {
    if (exam === null) {
      return;
    }
    const updated = await apiClient.patch<ExamDetail>(`/exams/${exam.id}/answers`, { answers });
    if (updated) {
      setExam(updated);
      setAnswers(updated.answers ?? answers);
    }
    setAutosaveState("已保存刚刚");
    setCurrentIndex((current) => Math.min(current + 1, Math.max(totalQuestions - 1, 0)));
  }

  function toggleCurrentFlag() {
    if (!currentQuestion) {
      return;
    }
    setFlaggedQuestionIds((current) => {
      const next = new Set(current);
      if (next.has(currentQuestion.id)) {
        next.delete(currentQuestion.id);
      } else {
        next.add(currentQuestion.id);
      }
      return next;
    });
  }

  async function submitExam() {
    if (exam === null) {
      return;
    }
    const submitted = await apiClient.post<ExamDetail>(`/exams/${exam.id}/submit`, { answers });
    setExamState(submitted ?? exam);
  }

  if (viewState === "loading") {
    return <section className="panel">正在加载模拟考状态...</section>;
  }

  if (viewState === "error") {
    return (
      <section className="panel" role="alert">
        模拟考数据加载失败，请确认题库题量满足组卷要求。
      </section>
    );
  }

  if (viewState === "unstarted" || exam === null || currentQuestion === null) {
    return (
      <section className="panel exam-start-panel">
        <h2>未启动模拟考</h2>
        <p>当前没有进行中的模拟考。选择真实题库范围后再开始组卷。</p>
        <div className="filter-bar">
          <SelectField label="科目" value={source.subject} values={SUBJECTS} formatter={(value) => getSubjectLabel(value)} onChange={(subject) => setSource((current) => ({ ...current, subject }))} />
          <SelectField label="语言" value={source.language} values={LANGUAGES} formatter={(value) => getLanguageLabel(value)} onChange={(language) => setSource((current) => ({ ...current, language }))} />
          <SelectField label="级别" value={source.level} values={LEVELS} formatter={(value) => getLevelLabel(value)} onChange={(level) => setSource((current) => ({ ...current, level }))} />
        </div>
        <div className="button-row">
          <button className="primary-button" type="button" onClick={startExam}>
            开始模拟考
          </button>
        </div>
      </section>
    );
  }

  const isReview = viewState === "review";
  const isCurrentFlagged = flaggedQuestionIds.has(currentQuestion.id);
  const reviewSummary = isReview ? buildExamReviewSummary(exam) : null;

  return (
    <div className="exam-layout">
      <section className="panel exam-paper">
        <div className="question-progress">
          <span>模拟考 / {sourceLabel(exam.subject, exam.language, exam.level)}</span>
          <strong>{isReview ? "复盘中" : formatRemaining(exam.deadlineAt)}</strong>
        </div>
        <h2>{sourceLabel(exam.subject, exam.language, exam.level)} 模拟考</h2>
        <div className="markdown-preview-body" dangerouslySetInnerHTML={{ __html: markdownParagraph(currentQuestion.stemMd) }} />
        <div className={currentQuestion.type === "multiple" ? "options multi" : "options"} role="group" aria-label="考试答案选项">
          {currentQuestion.options.map((option) => {
            const selected = currentAnswers.includes(option.key);
            const correct = currentQuestion.correctAnswers?.includes(option.key) ?? false;
            const className = [
              "option",
              selected ? "selected" : "",
              isReview && correct ? "is-correct" : "",
              isReview && selected && !correct ? "is-wrong" : ""
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                aria-label={`${option.key} ${option.text}`}
                className={className}
                type="button"
                onClick={() => toggleAnswer(currentQuestion, option.key)}
                key={option.key}
              >
                <span>{option.key}</span>
                {option.text}
              </button>
            );
          })}
        </div>
        <div className="practice-actions">
          <button className="secondary-button" type="button" onClick={toggleCurrentFlag} disabled={isReview} aria-pressed={isCurrentFlagged}>
            {isCurrentFlagged ? <FlagOff aria-hidden="true" size={17} /> : <Flag aria-hidden="true" size={17} />}
            {isCurrentFlagged ? "取消疑问" : "标记疑问"}
          </button>
          <button className="primary-button" type="button" onClick={saveAndNext} disabled={isReview}>
            <CheckCircle2 aria-hidden="true" size={17} />
            提交答案
          </button>
        </div>
        {isReview ? (
          <div className={`answer-panel review-state ${currentQuestion.isCorrect ? "result-correct" : "result-wrong"}`}>
            <strong>{currentQuestion.isCorrect ? "回答正确" : "回答错误"}</strong>
            <p>{currentQuestion.explanationMd ?? "暂无解析"}</p>
          </div>
        ) : null}
      </section>

      <aside className="panel answer-sheet">
        <div className="panel-heading compact">
          <div>
            <h3>答题卡</h3>
            <p>
              {totalQuestions} 题 / 合格线 {exam.config.passScorePercent}%
            </p>
          </div>
        </div>
        {reviewSummary ? (
          <section className="exam-result-summary" aria-label="考试结果">
            <h3>考试结果</h3>
            <strong className={reviewSummary.isPassed ? "passed" : "failed"}>{reviewSummary.isPassed ? "已通过" : "未通过"}</strong>
            <p>正确率 {formatPercent(reviewSummary.scorePercent)}</p>
            <div>
              <span>正确 {reviewSummary.correctCount}</span>
              <span>错误 {reviewSummary.wrongCount}</span>
            </div>
          </section>
        ) : null}
        <div className="sheet-grid" aria-label="答题卡">
          {exam.questions.map((question, index) => {
            const number = index + 1;
            const className = [
              answers[question.id]?.length ? "done" : "",
              index === currentIndex ? "current" : "",
              flaggedQuestionIds.has(question.id) ? "flagged" : "",
              isReview && question.isCorrect === true ? "correct" : "",
              isReview && question.isCorrect === false ? "wrong" : ""
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button className={className} type="button" aria-current={index === currentIndex ? "step" : undefined} aria-pressed={flaggedQuestionIds.has(question.id)} onClick={() => setCurrentIndex(index)} key={question.id}>
                {number}
              </button>
            );
          })}
        </div>
        <div className="legend">
          {isReview ? (
            <>
              <span>
                <b className="correct" />
                正确
              </span>
              <span>
                <b className="wrong" />
                错误
              </span>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
        <p className="autosave-state">
          {autosaveState}，已答 {answeredCount} / {totalQuestions}
        </p>
        {isReview ? (
          <button className="primary-button restart-exam-button" type="button" onClick={restartExam}>
            重新模拟考
          </button>
        ) : viewState === "confirming" ? (
          <div className="submit-confirmation" role="alert">
            <strong>
              <AlertTriangle aria-hidden="true" size={17} />
              交卷确认
            </strong>
            <p>
              {unansweredCount > 0 ? `还有 ${unansweredCount} 道题未作答，确认交卷后将按未答处理。` : "已完成全部题目。"}
              交卷后将进入复盘，成绩和错题会写入真实记录。
            </p>
            <div className="button-row submit-confirmation-actions">
              <button className="secondary-button" type="button" onClick={() => setViewState("answering")}>
                继续答题
              </button>
              <button className="danger-button" type="button" onClick={submitExam}>
                确认交卷
              </button>
            </div>
          </div>
        ) : (
          <button className="danger-button" type="button" onClick={() => setViewState("confirming")} disabled={isReview}>
            {isReview ? "已交卷" : "交卷"}
          </button>
        )}
      </aside>
    </div>
  );
}

function selectExamToOpen(items: ExamListResponse["items"]) {
  return items.find((item) => item.status === "in_progress") ?? items.find((item) => item.status === "submitted") ?? null;
}

function SelectField<TValue extends Subject | Language | Level>({
  label,
  value,
  values,
  formatter,
  onChange
}: {
  label: string;
  value: TValue;
  values: readonly TValue[];
  formatter: (value: TValue) => string;
  onChange: (value: TValue) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value as TValue)}>
        {values.map((item) => (
          <option value={item} key={item}>
            {formatter(item)}
          </option>
        ))}
      </select>
    </label>
  );
}

function sourceLabel(subject: string, language: string | null, level: string): string {
  return [getSubjectLabel(subject as Subject, "short"), language ? getLanguageLabel(language as Language) : null, getLevelLabel(level as Level)]
    .filter(Boolean)
    .join(" / ");
}

function formatRemaining(deadlineAt: string): string {
  const remainingMs = new Date(deadlineAt).getTime() - Date.now();
  if (remainingMs <= 0) {
    return "剩余 00:00";
  }
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `剩余 ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildExamReviewSummary(exam: ExamDetail) {
  const correctCount = exam.questions.filter((question) => question.isCorrect === true).length;
  const wrongCount = exam.questions.filter((question) => question.isCorrect === false).length;

  return {
    correctCount,
    wrongCount,
    scorePercent: exam.scorePercent ?? (exam.questions.length === 0 ? 0 : (correctCount / exam.questions.length) * 100),
    isPassed: exam.isPassed ?? (exam.scorePercent ?? 0) >= exam.config.passScorePercent
  };
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function markdownParagraph(value: string): string {
  if (value.trim().startsWith("<")) {
    return value;
  }
  return `<p>${escapeHtml(value)}</p>`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
