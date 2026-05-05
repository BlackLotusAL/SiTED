import { AlertCircle, CheckCircle2, Plus, Save, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import { MarkdownEditor, MarkdownPreview } from "../components/MarkdownEditor";
import type { Language, Level, QuestionType, Subject } from "../domain/labels";

const DRAFT_STORAGE_KEY = "sited.admin.questionDraft.v1";
const TOAST_AUTO_DISMISS_MS = 4000;
const MIN_CHOICE_OPTIONS = 3;
const MAX_CHOICE_OPTIONS = 6;

const STEM_SAMPLE = `下面哪个集合适合在并发读写场景下作为线程安全 Map 使用？

\`\`\`java
Map<String, Integer> counts = new ConcurrentHashMap<>();
counts.merge(key, 1, Integer::sum);
\`\`\``;

const EXPLANATION_SAMPLE = "ConcurrentHashMap 面向并发访问场景，能降低多线程读写时的锁竞争。";

interface AdminOption {
  key: string;
  text: string;
  isCorrect: boolean;
}

interface AdminQuestionDraft {
  subject: Subject;
  language: Language;
  level: Level;
  type: QuestionType;
  stemMd: string;
  options: AdminOption[];
  explanationMd: string;
}

interface ToastState {
  tone: "success" | "error";
  message: string;
}

const DEFAULT_DRAFT: AdminQuestionDraft = {
  subject: "programming",
  language: "java",
  level: "working",
  type: "single",
  stemMd: STEM_SAMPLE,
  options: defaultOptionsForType("single"),
  explanationMd: EXPLANATION_SAMPLE
};

export function AdminQuestionsPage() {
  const [draft, setDraft] = useState<AdminQuestionDraft>(() => loadLocalDraft());
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pulseKey, setPulseKey] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedQuestionId, setPublishedQuestionId] = useState<string | null>(null);

  const isJudgment = draft.type === "judgment";
  const canAddOption = !isJudgment && draft.options.length < MAX_CHOICE_OPTIONS;
  const canRemoveOption = !isJudgment && draft.options.length > MIN_CHOICE_OPTIONS;
  const correctAnswers = useMemo(() => draft.options.filter((option) => option.isCorrect).map((option) => option.key), [draft.options]);

  useEffect(() => {
    if (toast === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToast(null), TOAST_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (pulseKey === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => setPulseKey(null), 1400);
    return () => window.clearTimeout(timeoutId);
  }, [pulseKey]);

  function updateType(type: QuestionType) {
    setPublishedQuestionId(null);
    setDraft((current) => ({
      ...current,
      type,
      options: defaultOptionsForType(type)
    }));
    setPulseKey(null);
  }

  function updateOptionText(key: string, text: string) {
    setPublishedQuestionId(null);
    setDraft((current) => ({
      ...current,
      options: current.options.map((option) => (option.key === key ? { ...option, text } : option))
    }));
  }

  function updateOptionCorrect(key: string, isCorrect: boolean) {
    setPublishedQuestionId(null);
    setDraft((current) => {
      const nextOptions =
        current.type === "multiple"
          ? current.options.map((option) => (option.key === key ? { ...option, isCorrect } : option))
          : current.options.map((option) => ({ ...option, isCorrect: option.key === key ? isCorrect : false }));
      return { ...current, options: nextOptions };
    });

    if (isCorrect) {
      setPulseKey(key);
    }
  }

  function addOption() {
    if (!canAddOption) {
      return;
    }

    setPublishedQuestionId(null);
    setDraft((current) => ({
      ...current,
      options: [...current.options, { key: optionKey(current.options.length), text: "", isCorrect: false }]
    }));
  }

  function removeOption(key: string) {
    if (!canRemoveOption) {
      return;
    }

    setPublishedQuestionId(null);
    setDraft((current) => ({
      ...current,
      options: rekeyOptions(current.options.filter((option) => option.key !== key))
    }));
  }

  function saveDraft() {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    showToast("success", "草稿已保存到本地");
  }

  async function publishQuestion() {
    const validationMessage = validateDraft(draft);
    if (validationMessage !== null) {
      showToast("error", validationMessage);
      return;
    }

    setIsPublishing(true);
    try {
      const payload = {
        subject: draft.subject,
        language: draft.language,
        level: draft.level,
        type: draft.type,
        stemMd: draft.stemMd,
        options: draft.options.map((option) => ({ key: option.key, text: option.text, isCorrect: option.isCorrect })),
        correctAnswers,
        explanationMd: draft.explanationMd,
        tags: [],
        memo: undefined,
        status: "published"
      };
      const response = await apiClient.post<{ id?: string; status?: string }>(
        "/admin/questions",
        payload as unknown as Parameters<typeof apiClient.post>[1]
      );
      setPublishedQuestionId(response?.id ?? null);
      showToast("success", "题目已发布");
    } catch (error) {
      showToast("error", errorMessage(error));
    } finally {
      setIsPublishing(false);
    }
  }

  function showToast(tone: ToastState["tone"], message: string) {
    setToast({ tone, message });
  }

  return (
    <div className="editor-layout admin-editor-layout">
      {toast ? <StatusToast toast={toast} /> : null}
      <section className="panel editor-form admin-editor-form">
        <div className="panel-heading compact">
          <h2>新增题目</h2>
          <span className="status-chip">{publishedQuestionId === null ? "草稿" : "已发布"}</span>
        </div>

        <div className="form-grid admin-form-grid">
          <label>
            科目
            <select value={draft.subject} onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value as Subject }))}>
              <option value="programming">科目二（编程知识）</option>
              <option value="security_privacy">科目三（安全质量隐私）</option>
              <option value="refactoring">科目四（重构知识）</option>
            </select>
          </label>
          <label>
            语言
            <select value={draft.language} onChange={(event) => setDraft((current) => ({ ...current, language: event.target.value as Language }))}>
              <option value="c">C</option>
              <option value="cpp">C++</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="javascript">JavaScript</option>
              <option value="go">Go</option>
            </select>
          </label>
          <label>
            级别
            <select value={draft.level} onChange={(event) => setDraft((current) => ({ ...current, level: event.target.value as Level }))}>
              <option value="entry">入门级</option>
              <option value="working">工作级</option>
              <option value="professional">专业级</option>
            </select>
          </label>
          <label>
            题型
            <select value={draft.type} onChange={(event) => updateType(event.target.value as QuestionType)}>
              <option value="single">单选题</option>
              <option value="multiple">多选题</option>
              <option value="judgment">判断题</option>
            </select>
          </label>
        </div>

        <MarkdownEditor onChange={(stemMd) => setDraft((current) => ({ ...current, stemMd }))} value={draft.stemMd} />

        <div className="option-editor" aria-label="选项编辑">
          {draft.options.map((option) => (
            <label
              className={["option-entry", option.isCorrect ? "is-correct-selected" : "", pulseKey === option.key ? "is-correct-pulse" : ""]
                .filter(Boolean)
                .join(" ")}
              key={option.key}
            >
              <input
                checked={option.isCorrect}
                onChange={(event) => updateOptionCorrect(option.key, event.target.checked)}
                type="checkbox"
                aria-label={`${option.key} 为正确答案`}
              />
              <span>{option.key}</span>
              <input
                aria-label={`${option.key} 选项内容`}
                value={option.text}
                onChange={(event) => updateOptionText(option.key, event.target.value)}
              />
              {!isJudgment ? (
                <button
                  aria-label={`删除 ${option.key} 选项`}
                  className="icon-button option-delete-button"
                  disabled={!canRemoveOption}
                  onClick={() => removeOption(option.key)}
                  title={`删除 ${option.key} 选项`}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={16} />
                </button>
              ) : null}
            </label>
          ))}
          {!isJudgment ? (
            <button className="secondary-button add-option-button" disabled={!canAddOption} onClick={addOption} type="button">
              <Plus aria-hidden="true" size={17} />
              添加选项
            </button>
          ) : null}
        </div>

        <label className="block-label">
          解析
          <textarea value={draft.explanationMd} onChange={(event) => setDraft((current) => ({ ...current, explanationMd: event.target.value }))} />
        </label>

        <div className="editor-action-strip">
          <button className="secondary-button" onClick={saveDraft} type="button">
            <Save aria-hidden="true" size={17} />
            保存草稿
          </button>
          <button className="primary-button" disabled={isPublishing} onClick={() => void publishQuestion()} type="button">
            <Upload aria-hidden="true" size={17} />
            {isPublishing ? "发布中" : "发布题目"}
          </button>
        </div>
      </section>

      <aside className="panel question-preview-card admin-preview-panel" aria-label="实时预览">
        <h2>实时预览</h2>
        <MarkdownPreview value={draft.stemMd} />
        <div className="preview-options">
          {draft.options.map((option) => (
            <div className={option.isCorrect ? "preview-option correct" : "preview-option"} key={option.key}>
              {option.key}. {option.text}
            </div>
          ))}
        </div>
        <section className="preview-explanation" aria-label="解析预览">
          <h3>解析</h3>
          {draft.explanationMd.trim().length > 0 ? <MarkdownPreview value={draft.explanationMd} /> : <p className="empty-preview-note">暂无解析</p>}
        </section>
      </aside>
    </div>
  );
}

function StatusToast({ toast }: { toast: ToastState }) {
  const Icon = toast.tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div className="toast-region">
      <div className={`status-toast ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}>
        <Icon aria-hidden="true" size={17} />
        <span>{toast.message}</span>
      </div>
    </div>
  );
}

function defaultOptionsForType(type: QuestionType): AdminOption[] {
  if (type === "judgment") {
    return choiceOptions([
      ["正确", true],
      ["错误", false]
    ]);
  }

  if (type === "multiple") {
    return choiceOptions([
      ["", false],
      ["", false],
      ["", false],
      ["", false]
    ]);
  }

  return choiceOptions([
    ["", false],
    ["", false],
    ["", false],
    ["", false]
  ]);
}

function choiceOptions(values: Array<[text: string, isCorrect: boolean]>): AdminOption[] {
  return values.map(([text, isCorrect], index) => ({ key: optionKey(index), text, isCorrect }));
}

function rekeyOptions(options: AdminOption[]): AdminOption[] {
  return options.map((option, index) => ({ ...option, key: optionKey(index) }));
}

function optionKey(index: number): string {
  return String.fromCharCode("A".charCodeAt(0) + index);
}

function loadLocalDraft(): AdminQuestionDraft {
  try {
    const rawDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (rawDraft === null) {
      return DEFAULT_DRAFT;
    }

    const parsed = JSON.parse(rawDraft) as Partial<AdminQuestionDraft>;
    if (!isValidDraft(parsed)) {
      return DEFAULT_DRAFT;
    }

    return parsed;
  } catch {
    return DEFAULT_DRAFT;
  }
}

function isValidDraft(value: Partial<AdminQuestionDraft>): value is AdminQuestionDraft {
  return (
    typeof value.subject === "string" &&
    typeof value.language === "string" &&
    typeof value.level === "string" &&
    typeof value.type === "string" &&
    typeof value.stemMd === "string" &&
    typeof value.explanationMd === "string" &&
    Array.isArray(value.options) &&
    value.options.every(
      (option) =>
        typeof option === "object" &&
        option !== null &&
        typeof option.key === "string" &&
        typeof option.text === "string" &&
        typeof option.isCorrect === "boolean"
    )
  );
}

function validateDraft(draft: AdminQuestionDraft): string | null {
  const optionCount = draft.options.length;
  const correctCount = draft.options.filter((option) => option.isCorrect).length;

  if (draft.stemMd.trim().length === 0) {
    return "题干不能为空";
  }

  if (draft.options.some((option) => option.text.trim().length === 0)) {
    return "选项内容不能为空";
  }

  if (draft.type === "judgment") {
    if (optionCount !== 2) {
      return "判断题只能有 A 和 B 两个选项";
    }
    return correctCount === 1 ? null : "判断题需要 1 个正确答案";
  }

  if (optionCount < MIN_CHOICE_OPTIONS || optionCount > MAX_CHOICE_OPTIONS) {
    return "单选题和多选题需要 3-6 个选项";
  }

  if (draft.type === "multiple") {
    return correctCount >= 2 ? null : "多选题至少需要 2 个正确答案";
  }

  return correctCount === 1 ? null : "单选题需要 1 个正确答案";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "题目发布失败，请稍后重试";
}
