import { AlertTriangle, CheckCircle2, Flag, FlagOff } from "lucide-react";
import { motion } from "motion/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiClient } from "../api/client";
import type { ExamDetail, ExamListResponse, ExamQuestion } from "../api/types";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
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
import { invalidateStaleResource, setStaleResourceData, useStaleResource } from "../hooks/useStaleResource";

type ExamViewState = "loading" | "unstarted" | "answering" | "confirming" | "review" | "error";
type ExamSource = { subject: Subject; language: Language | null; level: Level };

export function ExamPage() {
  const [searchParams] = useSearchParams();
  const examId = searchParams.get("examId");
  const [viewState, setViewState] = useState<ExamViewState>("loading");
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [hasLocalExamState, setHasLocalExamState] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const answersRef = useRef<Record<string, string[]>>({});
  const [flaggedQuestionIds, setFlaggedQuestionIds] = useState<Set<string>>(() => new Set());
  const [autosaveState, setAutosaveState] = useState("尚未保存");
  const [source, setSource] = useState<{ subject: Subject; language: Language; level: Level }>({
    subject: "programming",
    language: "java",
    level: "working"
  });

  const initialExamResource = useStaleResource<ExamDetail | null>({
    key: examId ? `/exams/${examId}` : "/exams:open",
    load: () => loadInitialExam(examId)
  });
  const effectiveExam = hasLocalExamState ? exam : exam ?? initialExamResource.data ?? null;
  const effectiveViewState =
    viewState === "loading" && initialExamResource.data !== undefined ? viewStateForExam(initialExamResource.data) : viewState;
  const currentQuestion = effectiveExam?.questions[currentIndex] ?? null;
  const currentAnswers = currentQuestion ? answers[currentQuestion.id] ?? effectiveExam?.answers?.[currentQuestion.id] ?? [] : [];
  const totalQuestions = effectiveExam?.questions.length ?? 0;
  const answeredCount = useMemo(() => Object.values(answers).filter((value) => value.length > 0).length, [answers]);
  const unansweredCount = Math.max(totalQuestions - answeredCount, 0);
  answersRef.current = answers;

  useEffect(() => {
    if (initialExamResource.data !== undefined) {
      setExamState(initialExamResource.data);
    }
  }, [initialExamResource.data]);

  useEffect(() => {
    setHasLocalExamState(false);
    setExam(null);
    setViewState("loading");
  }, [examId]);

  useEffect(() => {
    if (initialExamResource.error && initialExamResource.data === undefined) {
      setViewState("error");
    }
  }, [initialExamResource.data, initialExamResource.error]);

  async function startExam() {
    await startExamWithSource(source);
  }

  function restartExam() {
    const examForRestart = effectiveExam;
    if (examForRestart === null) {
      return;
    }
    setSource((current) => ({
      subject: examForRestart.subject as Subject,
      language: (examForRestart.language ?? current.language) as Language,
      level: examForRestart.level as Level
    }));
    setHasLocalExamState(true);
    setExam(null);
    initialExamResource.setData(null);
    answersRef.current = {};
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
      if (created) {
        setStaleResourceData(`/exams/${created.id}`, created);
        setStaleResourceData("/exams:open", created);
      }
      setExamState(created ?? null);
      invalidateStaleResource("/dashboard");
      invalidateStaleResource("/review");
      invalidateStaleResource("/admin/stats");
    } catch {
      setViewState("error");
    }
  }

  function setExamState(nextExam: ExamDetail | null) {
    setHasLocalExamState(true);
    if (nextExam === null) {
      setExam(null);
      answersRef.current = {};
      setViewState("unstarted");
      return;
    }
    setExam(nextExam);
    answersRef.current = nextExam.answers ?? {};
    setAnswers(nextExam.answers ?? {});
    setFlaggedQuestionIds(new Set(nextExam.flaggedQuestionIds ?? []));
    setCurrentIndex(0);
    setAutosaveState(nextExam.status === "in_progress" ? "等待保存" : "已交卷");
    setViewState(viewStateForExam(nextExam));
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
      const next = { ...current, [question.id]: nextAnswers };
      answersRef.current = next;
      return next;
    });
    setAutosaveState("有未保存作答");
  }

  async function saveAndNext() {
    if (exam === null) {
      return;
    }
    const answersForSave = answersRef.current;
    const updated = await apiClient.patch<ExamDetail>(`/exams/${exam.id}/answers`, { answers: answersForSave });
    if (updated) {
      setExam(updated);
      setAnswers(updated.answers ?? answersForSave);
      setStaleResourceData(`/exams/${updated.id}`, updated);
      setStaleResourceData("/exams:open", updated);
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
    const answersForSubmit = answersRef.current;
    const submitted = await apiClient.post<ExamDetail>(`/exams/${exam.id}/submit`, { answers: answersForSubmit });
    if (submitted) {
      setStaleResourceData(`/exams/${submitted.id}`, submitted);
      setStaleResourceData("/exams:open", submitted);
      invalidateStaleResource("/dashboard");
      invalidateStaleResource("/review");
      invalidateStaleResource("/admin/stats");
    }
    setExamState(submitted ?? exam);
  }

  if (initialExamResource.isInitialLoading && effectiveExam === null) {
    return <LoadingSkeleton variant="exam" />;
  }

  if (effectiveViewState === "error") {
    return (
      <section className="panel" role="alert">
        模拟考数据加载失败，请确认题库题量满足组卷要求。
      </section>
    );
  }

  if (effectiveViewState === "unstarted" || effectiveExam === null || currentQuestion === null) {
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

  const isReview = effectiveViewState === "review";
  const isCurrentFlagged = flaggedQuestionIds.has(currentQuestion.id);
  const reviewSummary = isReview ? buildExamReviewSummary(effectiveExam) : null;

  return (
    <div className="exam-layout">
      <section className="panel exam-paper">
        <div className="question-progress">
          <span>模拟考 / {sourceLabel(effectiveExam.subject, effectiveExam.language, effectiveExam.level)}</span>
          <strong>{isReview ? "复盘中" : formatRemaining(effectiveExam.deadlineAt)}</strong>
        </div>
        <h2>{sourceLabel(effectiveExam.subject, effectiveExam.language, effectiveExam.level)} 模拟考</h2>
        <StableHtml className="markdown-preview-body" html={markdownParagraph(currentQuestion.stemMd)} />
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
              <motion.button
                aria-label={`${option.key} ${option.text}`}
                className={className}
                type="button"
                whileHover={{ x: isReview ? 0 : 3 }}
                whileTap={{ scale: isReview ? 1 : 0.992 }}
                onClick={() => toggleAnswer(currentQuestion, option.key)}
                key={option.key}
              >
                <span>{option.key}</span>
                {option.text}
              </motion.button>
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
          <motion.div
            className={`answer-panel review-state ${currentQuestion.isCorrect ? "result-correct" : "result-wrong"}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          >
            <strong>{currentQuestion.isCorrect ? "回答正确" : "回答错误"}</strong>
            <p>{currentQuestion.explanationMd ?? "暂无解析"}</p>
          </motion.div>
        ) : null}
      </section>

      <aside className="panel answer-sheet">
        <div className="panel-heading compact">
          <div>
            <h3>答题卡</h3>
            <p>
              {totalQuestions} 题 / 合格线 {effectiveExam.config.passScorePercent}%
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
          {effectiveExam.questions.map((question, index) => {
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
        ) : effectiveViewState === "confirming" ? (
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

const StableHtml = memo(function StableHtml({ className, html }: { className: string; html: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
});

function selectExamToOpen(items: ExamListResponse["items"]) {
  return items.find((item) => item.status === "in_progress") ?? items.find((item) => item.status === "submitted") ?? null;
}

async function loadInitialExam(examId: string | null): Promise<ExamDetail | null> {
  if (examId) {
    return (await apiClient.get<ExamDetail>(`/exams/${examId}`)) ?? null;
  }

  const payload = await apiClient.get<ExamListResponse>("/exams");
  const examToOpen = selectExamToOpen(payload?.items ?? []);
  if (!examToOpen) {
    return null;
  }

  return (await apiClient.get<ExamDetail>(`/exams/${examToOpen.id}`)) ?? null;
}

function viewStateForExam(nextExam: ExamDetail | null): ExamViewState {
  if (nextExam === null) {
    return "unstarted";
  }
  return nextExam.status === "submitted" ? "review" : "answering";
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
