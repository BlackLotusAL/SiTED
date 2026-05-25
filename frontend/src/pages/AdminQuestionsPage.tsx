import { AlertCircle, Archive, CheckCircle2, FileJson, Plus, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import type {
  AdminQuestionDeleteResponse,
  AdminQuestionDetail,
  AdminQuestionListResponse,
  ImportCommitResponse,
  ImportValidationReport,
  QuestionUpsertPayload
} from "../api/types";
import { MarkdownEditor, MarkdownPreview, OptionContent } from "../components/MarkdownEditor";
import { hasMarkdownCode, markdownToPlainText } from "../components/markdownContent";
import {
  getLanguageLabel,
  getLevelLabel,
  getQuestionStatusLabel,
  getQuestionTypeLabel,
  getSubjectLabel,
  LANGUAGES,
  LEVELS,
  QUESTION_STATUSES,
  QUESTION_TYPES,
  SUBJECTS,
  type Language,
  type Level,
  type QuestionStatus,
  type QuestionType,
  type Subject
} from "../domain/labels";
import { ALL_FILTER_VALUE, appendFilterParam, type FilterValue } from "../domain/filtering";
import { invalidateStaleResource, useStaleResource } from "../hooks/useStaleResource";

const DRAFT_STORAGE_KEY = "sited.admin.questionDraft.v1";
const TOAST_AUTO_DISMISS_MS = 4000;
const MIN_CHOICE_OPTIONS = 3;
const MAX_CHOICE_OPTIONS = 6;
const PAGE_SIZE = 100;

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
  sourceCode: string;
  subject: Subject;
  language: Language;
  level: Level;
  type: QuestionType;
  stemMd: string;
  options: AdminOption[];
  explanationMd: string;
  memo: string;
  tagsInput: string;
  status: QuestionStatus;
}

interface AdminQuestionFilters {
  subject: FilterValue<Subject>;
  language: FilterValue<Language>;
  level: FilterValue<Level>;
  type: FilterValue<QuestionType>;
  status: FilterValue<QuestionStatus>;
  keyword: string;
}

interface ToastState {
  tone: "success" | "error";
  message: string;
}

interface CreatedQuestionResponse {
  id: string;
}

type ApiRequestBody = Parameters<typeof apiClient.post>[1];

const DEFAULT_FILTERS: AdminQuestionFilters = {
  subject: ALL_FILTER_VALUE,
  language: ALL_FILTER_VALUE,
  level: ALL_FILTER_VALUE,
  type: ALL_FILTER_VALUE,
  status: ALL_FILTER_VALUE,
  keyword: ""
};

const DEFAULT_DRAFT: AdminQuestionDraft = {
  sourceCode: "",
  subject: "programming",
  language: "java",
  level: "working",
  type: "single",
  stemMd: STEM_SAMPLE,
  options: defaultOptionsForType("single"),
  explanationMd: EXPLANATION_SAMPLE,
  memo: "",
  tagsInput: "",
  status: "published"
};

export function AdminQuestionsPage() {
  const [draft, setDraft] = useState<AdminQuestionDraft>(() => loadLocalDraft());
  const [filters, setFilters] = useState<AdminQuestionFilters>(DEFAULT_FILTERS);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pulseKey, setPulseKey] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [publishedQuestionId, setPublishedQuestionId] = useState<string | null>(null);
  const [importBatch, setImportBatch] = useState<unknown | null>(null);
  const [importReport, setImportReport] = useState<ImportValidationReport | null>(null);

  const questionListKey = useMemo(() => `/admin/questions?${adminFiltersToSearchParams(filters).toString()}`, [filters]);
  const questionListResource = useStaleResource<AdminQuestionListResponse>({
    key: questionListKey,
    load: async () =>
      (await apiClient.get<AdminQuestionListResponse>(`/admin/questions?${adminFiltersToSearchParams(filters).toString()}`)) ?? {
        items: [],
        page: 1,
        pageSize: PAGE_SIZE,
        total: 0
      }
  });
  const questions = questionListResource.data?.items ?? [];
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

  function startNewQuestion() {
    setSelectedQuestionId(null);
    setPublishedQuestionId(null);
    setDeleteConfirmationOpen(false);
    setDraft(DEFAULT_DRAFT);
    setPulseKey(null);
  }

  async function selectQuestion(questionId: string) {
    setSelectedQuestionId(questionId);
    setPublishedQuestionId(questionId);
    setDeleteConfirmationOpen(false);
    try {
      const detail = await apiClient.get<AdminQuestionDetail>(`/admin/questions/${questionId}`);
      if (detail) {
        setDraft(draftFromDetail(detail));
      }
    } catch (error) {
      showToast("error", errorMessage(error, "题目详情加载失败，请稍后重试"));
    }
  }

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
    const payload = payloadFromDraft("published");
    if (payload === null) {
      return;
    }

    setIsPublishing(true);
    try {
      const response = await apiClient.post<AdminQuestionDetail | CreatedQuestionResponse>("/admin/questions", asRequestBody(payload));
      setPublishedQuestionId(response?.id ?? null);
      if (isAdminQuestionDetail(response)) {
        setSelectedQuestionId(response.id);
        setDraft(draftFromDetail(response));
      } else if (response?.id) {
        setSelectedQuestionId(response.id);
      }
      showToast("success", "题目已发布");
      await refreshAdminQuestions();
    } catch (error) {
      showToast("error", errorMessage(error, "题目发布失败，请稍后重试"));
    } finally {
      setIsPublishing(false);
    }
  }

  async function saveExistingQuestion() {
    if (selectedQuestionId === null) {
      return;
    }
    const payload = payloadFromDraft(draft.status);
    if (payload === null) {
      return;
    }

    setIsSaving(true);
    try {
      const response = await apiClient.patch<AdminQuestionDetail>(`/admin/questions/${selectedQuestionId}`, asRequestBody(payload));
      if (response) {
        setDraft(draftFromDetail(response));
      }
      showToast("success", "题目已保存");
      await refreshAdminQuestions();
    } catch (error) {
      showToast("error", errorMessage(error, "题目保存失败，请稍后重试"));
    } finally {
      setIsSaving(false);
    }
  }

  async function transitionSelectedQuestion(action: "publish" | "archive") {
    if (selectedQuestionId === null) {
      return;
    }
    try {
      const response = await apiClient.post<AdminQuestionDetail>(`/admin/questions/${selectedQuestionId}/${action}`, {});
      if (response) {
        setDraft(draftFromDetail(response));
      }
      showToast("success", action === "publish" ? "题目已发布" : "题目已归档");
      await refreshAdminQuestions();
    } catch (error) {
      showToast("error", errorMessage(error, action === "publish" ? "发布失败，请稍后重试" : "归档失败，请稍后重试"));
    }
  }

  async function deleteSelectedQuestion() {
    if (selectedQuestionId === null || isDeleting) {
      return;
    }

    setIsDeleting(true);
    try {
      await apiClient.delete<AdminQuestionDeleteResponse>(`/admin/questions/${selectedQuestionId}`);
      showToast("success", "题目已删除");
      startNewQuestion();
      await refreshAdminQuestions();
    } catch (error) {
      showToast("error", errorMessage(error, "题目删除失败，请稍后重试"));
    } finally {
      setIsDeleting(false);
    }
  }

  async function validateImportFile(file: File | undefined) {
    if (!file) {
      return;
    }

    setImportReport(null);
    setImportBatch(null);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const report = await apiClient.post<ImportValidationReport>("/admin/questions/import/validate", asRequestBody(parsed));
      setImportBatch(parsed);
      setImportReport(report ?? null);
      if (report?.valid === false) {
        showToast("error", "导入文件存在校验错误");
      }
    } catch (error) {
      showToast("error", errorMessage(error, "导入文件解析或校验失败"));
    }
  }

  async function commitImport() {
    if (importBatch === null || importReport?.valid !== true || isImporting) {
      return;
    }

    setIsImporting(true);
    try {
      const response = await apiClient.post<ImportCommitResponse>("/admin/questions/import/commit", asRequestBody(importBatch));
      showToast("success", `已导入 ${response?.importedCount ?? 0} 题并发布`);
      setImportBatch(null);
      setImportReport(null);
      await refreshAdminQuestions();
    } catch (error) {
      showToast("error", errorMessage(error, "导入提交失败，请稍后重试"));
    } finally {
      setIsImporting(false);
    }
  }

  async function refreshAdminQuestions() {
    invalidateStaleResource("/admin/questions");
    await questionListResource.refresh();
    invalidateStaleResource("/questions");
    invalidateStaleResource("/admin/stats");
  }

  function payloadFromDraft(status: QuestionStatus): QuestionUpsertPayload | null {
    const validationMessage = validateDraft(draft);
    if (validationMessage !== null) {
      showToast("error", validationMessage);
      return null;
    }

    return {
      ...(draft.sourceCode.trim() ? { sourceCode: draft.sourceCode.trim() } : {}),
      subject: draft.subject,
      language: draft.language,
      level: draft.level,
      type: draft.type,
      stemMd: draft.stemMd,
      options: draft.options.map((option) => ({ key: option.key, text: option.text, isCorrect: option.isCorrect })),
      correctAnswers,
      explanationMd: draft.explanationMd.trim() || undefined,
      tags: parseTagsInput(draft.tagsInput),
      memo: draft.memo.trim() || undefined,
      status
    };
  }

  function showToast(tone: ToastState["tone"], message: string) {
    setToast({ tone, message });
  }

  return (
    <div className="admin-question-workspace">
      {toast ? <StatusToast toast={toast} /> : null}

      <section className="panel admin-question-toolbar">
        <div className="panel-heading compact">
          <h2>题库管理</h2>
          <div className="button-row">
            <button className="secondary-button" onClick={startNewQuestion} type="button">
              <Plus aria-hidden="true" size={17} />
              新增题目
            </button>
            <label className="secondary-button file-import-button">
              <FileJson aria-hidden="true" size={17} />
              批量导入
              <input
                aria-label="批量导入题目"
                accept="application/json,.json"
                type="file"
                onChange={(event) => {
                  void validateImportFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
        <div className="filter-bar">
          <AdminFilterSelect label="筛选科目" value={filters.subject} values={SUBJECTS} formatter={(value) => getSubjectLabel(value)} onChange={(subject) => setFilters((current) => ({ ...current, subject }))} />
          <AdminFilterSelect label="筛选语言" value={filters.language} values={LANGUAGES} formatter={(value) => getLanguageLabel(value)} onChange={(language) => setFilters((current) => ({ ...current, language }))} />
          <AdminFilterSelect label="筛选级别" value={filters.level} values={LEVELS} formatter={(value) => getLevelLabel(value)} onChange={(level) => setFilters((current) => ({ ...current, level }))} />
          <AdminFilterSelect label="筛选题型" value={filters.type} values={QUESTION_TYPES} formatter={(value) => getQuestionTypeLabel(value)} onChange={(type) => setFilters((current) => ({ ...current, type }))} />
          <AdminFilterSelect label="筛选状态" value={filters.status} values={QUESTION_STATUSES} formatter={(value) => getQuestionStatusLabel(value)} onChange={(status) => setFilters((current) => ({ ...current, status }))} />
          <label className="search-field">
            筛选关键词
            <input
              type="search"
              value={filters.keyword}
              onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
              placeholder="题干、解析、编号或标签"
            />
          </label>
        </div>
        {importReport ? <ImportReportPanel report={importReport} isImporting={isImporting} onCommit={commitImport} /> : null}
      </section>

      <div className="editor-layout admin-editor-layout">
        <section className="panel admin-question-list" aria-label="管理题目列表">
          <div className="panel-heading compact">
            <h3>题目列表</h3>
            <span>{questionListResource.data?.total ?? 0} 题</span>
          </div>
          {questionListResource.isInitialLoading ? <p>题目加载中...</p> : null}
          {questionListResource.error && questionListResource.data === undefined ? <div role="alert">题目加载失败，请稍后重试。</div> : null}
          {questions.length === 0 && questionListResource.data !== undefined ? <p>当前筛选条件下暂无题目。</p> : null}
          {questions.map((question) => (
            <button
              className={question.id === selectedQuestionId ? "admin-question-row selected" : "admin-question-row"}
              key={question.id}
              onClick={() => {
                void selectQuestion(question.id);
              }}
              type="button"
            >
              <span>{markdownToPlainText(question.stemMd)}</span>
              <small>
                {getQuestionStatusLabel(question.status as QuestionStatus)} / {getQuestionTypeLabel(question.type as QuestionType)}
              </small>
            </button>
          ))}
        </section>

        <section className="panel editor-form admin-editor-form">
          <div className="panel-heading compact">
            <h2>{selectedQuestionId === null ? "新增题目" : "编辑题目"}</h2>
            <span className="status-chip">{selectedQuestionId === null ? (publishedQuestionId === null ? "草稿" : "已发布") : getQuestionStatusLabel(draft.status)}</span>
          </div>

          <div className="form-grid admin-form-grid">
            <label>
              编号
              <input
                aria-label="编号"
                value={draft.sourceCode}
                onChange={(event) => setDraft((current) => ({ ...current, sourceCode: event.target.value }))}
                placeholder="可选，导入去重用"
              />
            </label>
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
                {LANGUAGES.map((language) => (
                  <option value={language} key={language}>
                    {getLanguageLabel(language)}
                  </option>
                ))}
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
            <label>
              状态
              <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as QuestionStatus }))}>
                {QUESTION_STATUSES.map((status) => (
                  <option value={status} key={status}>
                    {getQuestionStatusLabel(status)}
                  </option>
                ))}
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
                <textarea
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

          <div className="form-grid admin-form-grid">
            <label>
              标签
              <input
                aria-label="标签"
                value={draft.tagsInput}
                onChange={(event) => setDraft((current) => ({ ...current, tagsInput: event.target.value }))}
                placeholder="用英文逗号分隔"
              />
            </label>
            <label>
              备注
              <input
                aria-label="备注"
                value={draft.memo}
                onChange={(event) => setDraft((current) => ({ ...current, memo: event.target.value }))}
              />
            </label>
          </div>

          <div className="editor-action-strip">
            <button className="secondary-button" onClick={saveDraft} type="button">
              <Save aria-hidden="true" size={17} />
              保存草稿
            </button>
            {selectedQuestionId === null ? (
              <button className="primary-button" disabled={isPublishing} onClick={() => void publishQuestion()} type="button">
                <Upload aria-hidden="true" size={17} />
                {isPublishing ? "发布中" : "发布题目"}
              </button>
            ) : (
              <>
                <button className="primary-button" disabled={isSaving} onClick={() => void saveExistingQuestion()} type="button">
                  <Save aria-hidden="true" size={17} />
                  {isSaving ? "保存中" : "保存修改"}
                </button>
                <button className="secondary-button" onClick={() => void transitionSelectedQuestion("publish")} type="button">
                  <RotateCcw aria-hidden="true" size={17} />
                  发布
                </button>
                <button className="secondary-button" onClick={() => void transitionSelectedQuestion("archive")} type="button">
                  <Archive aria-hidden="true" size={17} />
                  归档
                </button>
                <button className="danger-button" onClick={() => setDeleteConfirmationOpen(true)} type="button">
                  <Trash2 aria-hidden="true" size={17} />
                  删除题目
                </button>
              </>
            )}
          </div>
          {deleteConfirmationOpen ? (
            <div className="submit-confirmation" role="alert">
              <strong>
                <AlertCircle aria-hidden="true" size={17} />
                确认删除
              </strong>
              <p>会删除该题及关联的收藏、错题和练习记录。模拟考试快照会保留历史副本。</p>
              <div className="button-row submit-confirmation-actions">
                <button className="secondary-button" onClick={() => setDeleteConfirmationOpen(false)} type="button">
                  取消
                </button>
                <button className="danger-button" disabled={isDeleting} onClick={() => void deleteSelectedQuestion()} type="button">
                  {isDeleting ? "删除中" : "确认删除"}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="panel question-preview-card admin-preview-panel" aria-label="实时预览">
          <h2>实时预览</h2>
          <MarkdownPreview value={draft.stemMd} />
          <div className="preview-options">
            {draft.options.map((option) => (
              <OptionPreview option={option} key={option.key} />
            ))}
          </div>
          <section className="preview-explanation" aria-label="解析预览">
            <h3>解析</h3>
            {draft.explanationMd.trim().length > 0 ? <MarkdownPreview value={draft.explanationMd} /> : <p className="empty-preview-note">暂无解析</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

function StatusToast({ toast }: { toast: ToastState }) {
  const Icon = toast.tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div className="toast-region">
      <motion.div
        className={`status-toast ${toast.tone}`}
        role={toast.tone === "error" ? "alert" : "status"}
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
      >
        <Icon aria-hidden="true" size={17} />
        <span>{toast.message}</span>
      </motion.div>
    </div>
  );
}

function ImportReportPanel({ report, isImporting, onCommit }: { report: ImportValidationReport; isImporting: boolean; onCommit: () => void }) {
  return (
    <div className={report.valid ? "import-report success" : "import-report error"} role={report.valid ? "status" : "alert"}>
      <strong>
        可导入 {report.importableCount} 题，失败 {report.failedCount} 题
      </strong>
      {report.errors.length > 0 ? (
        <ul>
          {report.errors.slice(0, 6).map((error, index) => (
            <li key={`${error.row}-${error.field}-${index}`}>
              第 {error.row} 行 / {error.field}：{error.message}
            </li>
          ))}
        </ul>
      ) : null}
      <button className="primary-button" disabled={!report.valid || isImporting} onClick={onCommit} type="button">
        <Upload aria-hidden="true" size={17} />
        {isImporting ? "导入中" : "确认导入"}
      </button>
    </div>
  );
}

function OptionPreview({ option }: { option: AdminOption }) {
  return (
    <div className={option.isCorrect ? "preview-option correct" : "preview-option"}>
      {hasMarkdownCode(option.text) ? (
        <>
          <span>{option.key}.</span>
          <OptionContent value={option.text} />
        </>
      ) : (
        `${option.key}. ${option.text}`
      )}
    </div>
  );
}

function AdminFilterSelect<TValue extends Subject | Language | Level | QuestionType | QuestionStatus>({
  label,
  value,
  values,
  formatter,
  onChange
}: {
  label: string;
  value: FilterValue<TValue>;
  values: readonly TValue[];
  formatter: (value: TValue) => string;
  onChange: (value: FilterValue<TValue>) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value as FilterValue<TValue>)}>
        <option value={ALL_FILTER_VALUE}>全部</option>
        {values.map((item) => (
          <option value={item} key={item}>
            {formatter(item)}
          </option>
        ))}
      </select>
    </label>
  );
}

function adminFiltersToSearchParams(filters: AdminQuestionFilters, page = 1): URLSearchParams {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE)
  });
  appendFilterParam(params, "subject", filters.subject);
  appendFilterParam(params, "language", filters.language);
  appendFilterParam(params, "level", filters.level);
  appendFilterParam(params, "type", filters.type);
  appendFilterParam(params, "status", filters.status);
  const keyword = filters.keyword.trim();
  if (keyword.length > 0) {
    params.set("keyword", keyword);
  }
  return params;
}

function draftFromDetail(detail: AdminQuestionDetail): AdminQuestionDraft {
  return {
    sourceCode: detail.sourceCode ?? "",
    subject: detail.subject as Subject,
    language: (detail.language ?? "java") as Language,
    level: detail.level as Level,
    type: detail.type as QuestionType,
    stemMd: detail.stemMd,
    options: detail.options.map((option) => ({
      key: option.key,
      text: option.text,
      isCorrect: option.isCorrect === true || detail.correctAnswers.includes(option.key)
    })),
    explanationMd: detail.explanationMd ?? "",
    memo: detail.memo ?? "",
    tagsInput: detail.tags.join(", "),
    status: detail.status as QuestionStatus
  };
}

function isAdminQuestionDetail(value: unknown): value is AdminQuestionDetail {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<AdminQuestionDetail>).id === "string" &&
    typeof (value as Partial<AdminQuestionDetail>).stemMd === "string" &&
    Array.isArray((value as Partial<AdminQuestionDetail>).options) &&
    Array.isArray((value as Partial<AdminQuestionDetail>).correctAnswers)
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
    typeof value.sourceCode === "string" &&
    typeof value.subject === "string" &&
    typeof value.language === "string" &&
    typeof value.level === "string" &&
    typeof value.type === "string" &&
    typeof value.stemMd === "string" &&
    typeof value.explanationMd === "string" &&
    typeof value.memo === "string" &&
    typeof value.tagsInput === "string" &&
    typeof value.status === "string" &&
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

function parseTagsInput(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of value.split(",")) {
    const tag = item.trim();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function asRequestBody(value: unknown): ApiRequestBody {
  return value as ApiRequestBody;
}
