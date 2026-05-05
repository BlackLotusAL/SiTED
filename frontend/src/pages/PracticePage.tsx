import { CheckCircle2, ChevronLeft, ChevronRight, CircleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiClient } from "../api/client";
import type { PracticeSubmitResponse, QuestionDetail, QuestionListItem, QuestionListResponse, ReciteQuestionDetail } from "../api/types";
import {
  getLanguageLabel,
  getLevelLabel,
  getQuestionTypeLabel,
  getSubjectLabel,
  type Language,
  type Level,
  type QuestionType,
  type Subject
} from "../domain/labels";

type BackQuestionMode = "practice" | "recite";

const PAGE_SIZE = 100;

interface PracticeQuestionState {
  selectedKeys: string[];
  submission: PracticeSubmitResponse | null;
  isDirty: boolean;
  isSubmitting: boolean;
}

export function PracticePage() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") === "recite" ? "recite" : "practice";
  const [mode, setMode] = useState<BackQuestionMode>(initialMode);
  const [questions, setQuestions] = useState<QuestionListItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [detail, setDetail] = useState<QuestionDetail | ReciteQuestionDetail | null>(null);
  const [practiceStateByQuestionId, setPracticeStateByQuestionId] = useState<Record<string, PracticeQuestionState>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const questionId = searchParams.get("questionId");
  const currentQuestionId = questionId ?? questions[currentIndex]?.id ?? null;
  const currentPracticeState = currentQuestionId ? practiceStateByQuestionId[currentQuestionId] : undefined;
  const selectedKeys = mode === "recite" && isReciteDetail(detail) ? detail.correctAnswers : currentPracticeState?.selectedKeys ?? [];
  const activeSubmission = currentPracticeState?.isDirty ? null : currentPracticeState?.submission ?? null;
  const submitted = mode === "recite" || activeSubmission !== null;
  const correctAnswers = mode === "recite" && isReciteDetail(detail) ? detail.correctAnswers : activeSubmission?.correctAnswers ?? [];
  const isCorrect = activeSubmission?.isCorrect ?? (mode === "recite" ? true : false);
  const isSubmitting = currentPracticeState?.isSubmitting ?? false;
  const sourceText = detail ? sourceLabel(detail.source.subject, detail.source.language, detail.source.level) : "真实题源";
  const canNavigateSequence = questionId === null && questions.length > 1;

  useEffect(() => {
    let isMounted = true;
    setStatus("loading");
    setQuestions([]);
    setCurrentIndex(0);

    if (questionId) {
      setStatus("ready");
      return () => {
        isMounted = false;
      };
    }

    fetchAllQuestions(searchParams)
      .then((items) => {
        if (!isMounted) {
          return;
        }
        setQuestions(items);
        setStatus(items.length === 0 ? "empty" : "ready");
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setStatus("error");
      });

    return () => {
      isMounted = false;
    };
  }, [questionId, searchParams]);

  useEffect(() => {
    if (currentQuestionId === null) {
      setDetail(null);
      setDetailStatus("idle");
      return;
    }

    let isMounted = true;
    setDetailStatus("loading");

    apiClient
      .get<QuestionDetail | ReciteQuestionDetail>(`/questions/${currentQuestionId}${mode === "recite" ? "/recite" : ""}`)
      .then((payload) => {
        if (!isMounted) {
          return;
        }
        setDetail(payload ?? null);
        setDetailStatus("ready");
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setDetail(null);
        setDetailStatus("error");
      });

    return () => {
      isMounted = false;
    };
  }, [currentQuestionId, mode]);

  const progressLabel = useMemo(() => {
    if (questionId) {
      return mode === "recite" ? "背诵模式" : "单题练习";
    }
    return `第 ${Math.min(currentIndex + 1, Math.max(questions.length, 1))} / ${Math.max(questions.length, 1)} 题`;
  }, [currentIndex, mode, questionId, questions.length]);

  function toggleAnswer(key: string) {
    if (mode !== "practice" || detail === null || currentQuestionId === null) {
      return;
    }

    setPracticeStateByQuestionId((current) => {
      const existing = current[currentQuestionId] ?? emptyPracticeQuestionState();
      const nextSelectedKeys =
        detail.source.type === "multiple"
          ? existing.selectedKeys.includes(key)
            ? existing.selectedKeys.filter((item) => item !== key)
            : [...existing.selectedKeys, key]
          : [key];
      const selectionChanged = !sameAnswers(nextSelectedKeys, existing.selectedKeys);

      return {
        ...current,
        [currentQuestionId]: {
          ...existing,
          selectedKeys: nextSelectedKeys,
          isDirty: existing.submission !== null ? existing.isDirty || selectionChanged : false
        }
      };
    });
  }

  async function submitAnswer() {
    if (mode !== "practice" || currentQuestionId === null || selectedKeys.length === 0 || isSubmitting) {
      return;
    }

    const questionIdForSubmit = currentQuestionId;
    const answersForSubmit = selectedKeys;
    setPracticeStateByQuestionId((current) => ({
      ...current,
      [questionIdForSubmit]: {
        ...(current[questionIdForSubmit] ?? emptyPracticeQuestionState()),
        selectedKeys: answersForSubmit,
        isSubmitting: true
      }
    }));

    try {
      const result = await apiClient.post<PracticeSubmitResponse>("/practice/submit", {
        questionId: questionIdForSubmit,
        submittedAnswers: answersForSubmit
      });

      setPracticeStateByQuestionId((current) => ({
        ...current,
        [questionIdForSubmit]: {
          ...(current[questionIdForSubmit] ?? emptyPracticeQuestionState()),
          selectedKeys: result?.submittedAnswers ?? answersForSubmit,
          submission: result ?? null,
          isDirty: false,
          isSubmitting: false
        }
      }));
    } catch (error) {
      setPracticeStateByQuestionId((current) => ({
        ...current,
        [questionIdForSubmit]: {
          ...(current[questionIdForSubmit] ?? emptyPracticeQuestionState()),
          isSubmitting: false
        }
      }));
      throw error;
    }
  }

  function modeHintText() {
    return mode === "practice" ? "作答后提交会写入练习记录和错题状态" : "直接显示答案和解析，不写练习记录";
  }

  function emptyPracticeQuestionState(): PracticeQuestionState {
    return {
      selectedKeys: [],
      submission: null,
      isDirty: false,
      isSubmitting: false
    };
  }

  function sameAnswers(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
      return false;
    }
    const normalizedLeft = [...left].sort();
    const normalizedRight = [...right].sort();
    return normalizedLeft.every((value, index) => value === normalizedRight[index]);
  }

  function nextQuestion() {
    goToQuestion(currentIndex + 1);
  }

  function previousQuestion() {
    goToQuestion(currentIndex - 1);
  }

  function jumpToQuestion(value: string) {
    const nextIndex = Number(value) - 1;
    if (!Number.isInteger(nextIndex)) {
      return;
    }
    goToQuestion(nextIndex);
  }

  function goToQuestion(nextIndex: number) {
    if (!canNavigateSequence) {
      return;
    }
    setCurrentIndex(((nextIndex % questions.length) + questions.length) % questions.length);
  }

  if (status === "loading" || detailStatus === "loading") {
    return <section className="panel">正在加载真实题目...</section>;
  }

  if (status === "error" || detailStatus === "error") {
    return (
      <section className="panel" role="alert">
        练习数据加载失败，请稍后重试。
      </section>
    );
  }

  if (status === "empty" || detail === null) {
    return <section className="panel">当前筛选条件下暂无已发布题目。</section>;
  }

  return (
    <div className="practice-shell">
      <section className="practice-main panel">
        <div className="panel-heading compact practice-mode-heading">
          <div className="segmented" role="tablist" aria-label="练习模式">
            <button className={mode === "practice" ? "active" : ""} type="button" onClick={() => setMode("practice")}>
              练习
            </button>
            <button className={mode === "recite" ? "active" : ""} type="button" onClick={() => setMode("recite")}>
              背诵
            </button>
          </div>
          <p className="mode-hint">
            {modeHintText()}
          </p>
        </div>
        <div className="question-progress">
          <span>{sourceText}</span>
          <strong>{progressLabel}</strong>
        </div>
        <div className="markdown-preview-body" dangerouslySetInnerHTML={{ __html: detail.stemHtml }} />
        <div className={detail.source.type === "multiple" ? "options multi" : "options"} role="group" aria-label="答案选项">
          {detail.options.map((option) => {
            const selected = selectedKeys.includes(option.key);
            const correct = correctAnswers.includes(option.key);
            const className = [
              "option",
              selected ? "is-selected" : "",
              submitted && correct ? "is-correct" : "",
              submitted && selected && !correct ? "is-wrong" : ""
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                aria-label={getOptionLabel(option.key, option.text, selected, submitted, correct)}
                aria-pressed={selected}
                className={className}
                type="button"
                onClick={() => toggleAnswer(option.key)}
                key={option.key}
              >
                <span>{option.key}</span>
                {option.text}
              </button>
            );
          })}
        </div>
        {mode === "practice" ? (
          <div className="practice-actions practice-answer-actions">
            {canNavigateSequence ? (
              <div className="question-nav-controls" role="group" aria-label="题目导航">
                <button className="secondary-button question-nav-button" type="button" aria-label="上一题" title="上一题" onClick={previousQuestion}>
                  <ChevronLeft aria-hidden="true" size={20} />
                </button>
                <button className="secondary-button question-nav-button" type="button" aria-label="下一题" title="下一题" onClick={nextQuestion}>
                  <ChevronRight aria-hidden="true" size={20} />
                </button>
              </div>
            ) : null}
            <button className="primary-button submit-answer-button" type="button" onClick={submitAnswer} disabled={selectedKeys.length === 0 || isSubmitting}>
              <CheckCircle2 aria-hidden="true" size={17} />
              {isSubmitting ? "提交中" : "提交答案"}
            </button>
          </div>
        ) : null}
        {mode === "practice" && currentPracticeState?.isDirty ? <p className="practice-resubmit-note">已修改答案，可重新提交</p> : null}
        {submitted ? (
          <div className={`answer-panel ${isCorrect || mode === "recite" ? "result-correct" : "result-wrong"}`} role="status" aria-live="polite">
            <strong>
              {isCorrect || mode === "recite" ? <CheckCircle2 aria-hidden="true" size={17} /> : <CircleAlert aria-hidden="true" size={17} />}
              {mode === "recite" ? "答案与解析" : isCorrect ? "回答正确" : "回答错误"}
            </strong>
            {activeSubmission?.masteryStatus ? <p>{activeSubmission.masteryStatus.label}</p> : null}
            <div
              className="markdown-preview-body"
              dangerouslySetInnerHTML={{ __html: mode === "recite" && isReciteDetail(detail) ? detail.explanationHtml : markdownParagraph(activeSubmission?.explanationMd ?? detail.explanationHtml) }}
            />
          </div>
        ) : null}
        {mode === "recite" && canNavigateSequence ? (
          <div className="practice-actions">
            <div className="question-nav-controls" role="group" aria-label="题目导航">
              <button className="secondary-button question-nav-button" type="button" aria-label="上一题" title="上一题" onClick={previousQuestion}>
                <ChevronLeft aria-hidden="true" size={20} />
              </button>
              <button className="secondary-button question-nav-button" type="button" aria-label="下一题" title="下一题" onClick={nextQuestion}>
                <ChevronRight aria-hidden="true" size={20} />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <aside className="side-stack">
        <section className="panel mini-panel fixed-mini-panel">
          <h3>当前筛选</h3>
          <p>{sourceText}</p>
          <p>{questionId ? "单题练习" : `本组题源共 ${questions.length} 道`}</p>
          <div className="linear-progress" aria-label="当前筛选进度">
            <span style={{ width: `${questions.length === 0 ? 0 : ((currentIndex + 1) / questions.length) * 100}%` }} />
          </div>
        </section>
        {canNavigateSequence ? (
          <section className="panel mini-panel quick-jump-panel">
            <h3>快速跳题</h3>
            <label className="question-jump">
              跳转题号
              <select value={String(currentIndex + 1)} onChange={(event) => jumpToQuestion(event.target.value)}>
                {questions.map((question, index) => (
                  <option value={index + 1} key={question.id}>
                    第 {index + 1} 题
                  </option>
                ))}
              </select>
            </label>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

async function fetchAllQuestions(searchParams: URLSearchParams): Promise<QuestionListItem[]> {
  const firstPage = await fetchQuestionPage(searchParams, 1);
  const pageCount = Math.ceil(firstPage.total / PAGE_SIZE);
  if (pageCount <= 1) {
    return firstPage.items;
  }
  const rest = await Promise.all(Array.from({ length: pageCount - 1 }, (_value, index) => fetchQuestionPage(searchParams, index + 2)));
  return [firstPage, ...rest].flatMap((page) => page.items);
}

async function fetchQuestionPage(searchParams: URLSearchParams, page: number): Promise<QuestionListResponse> {
  const params = new URLSearchParams(searchParams);
  params.delete("mode");
  params.delete("questionId");
  if (!params.has("subject")) params.set("subject", "programming");
  if (!params.has("language")) params.set("language", "java");
  if (!params.has("level")) params.set("level", "working");
  if (!params.has("type")) params.set("type", "single");
  params.set("page", String(page));
  params.set("pageSize", String(PAGE_SIZE));

  const payload = await apiClient.get<QuestionListResponse>(`/questions?${params.toString()}`);
  return payload ?? { items: [], page, pageSize: PAGE_SIZE, total: 0 };
}

function isReciteDetail(detail: QuestionDetail | ReciteQuestionDetail | null): detail is ReciteQuestionDetail {
  return detail !== null && "correctAnswers" in detail;
}

function sourceLabel(subject: string, language: string | null, level: string): string {
  return [getSubjectLabel(subject as Subject, "short"), language ? getLanguageLabel(language as Language) : null, getLevelLabel(level as Level)]
    .filter(Boolean)
    .join(" / ");
}

function getOptionLabel(key: string, text: string, selected: boolean, submitted: boolean, correct: boolean): string {
  const parts = [`${key} ${text}`];
  if (selected) parts.push("已选择");
  if (submitted && correct) parts.push("正确答案");
  if (submitted && selected && !correct) parts.push("回答错误");
  return parts.join("，");
}

function markdownParagraph(value: string | null): string {
  if (value === null || value.trim().length === 0) {
    return "";
  }
  if (value.trim().startsWith("<")) {
    return value;
  }
  return `<p>${escapeHtml(value)}</p>`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
