import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../api/client";
import type {
  ReviewBookmarkItem,
  ReviewBookmarksResponse,
  ReviewExamRecord,
  ReviewMistakeItem,
  ReviewMistakesResponse,
  ReviewQuestionSummary,
  ReviewRecordsResponse
} from "../api/types";
import { ReviewTabs, type ReviewTab } from "../components/ReviewTabs";
import {
  getLanguageLabel,
  getLevelLabel,
  getQuestionTypeLabel,
  getSubjectLabel,
  LANGUAGES,
  LEVELS,
  QUESTION_TYPES,
  SUBJECTS,
  type Language,
  type Level,
  type QuestionType,
  type Subject
} from "../domain/labels";

type ResourceStatus = "idle" | "loading" | "ready" | "error";
type ResourceState<TItem> = {
  status: ResourceStatus;
  items: TItem[];
};

type BookmarkPatchResponse = Partial<Pick<ReviewBookmarkItem, "id" | "questionId" | "note" | "tags" | "createdAt" | "question">>;

const EMPTY_MISTAKES: ResourceState<ReviewMistakeItem> = { status: "idle", items: [] };
const EMPTY_BOOKMARKS: ResourceState<ReviewBookmarkItem> = { status: "idle", items: [] };
const EMPTY_RECORDS: ResourceState<ReviewExamRecord> = { status: "idle", items: [] };
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const DEFAULT_PAGE_SIZE = 10;

export function ReviewPage() {
  const [activeTab, setActiveTab] = useState<ReviewTab>("mistakes");
  const [mistakesState, setMistakesState] = useState<ResourceState<ReviewMistakeItem>>(EMPTY_MISTAKES);
  const [bookmarksState, setBookmarksState] = useState<ResourceState<ReviewBookmarkItem>>(EMPTY_BOOKMARKS);
  const [recordsState, setRecordsState] = useState<ResourceState<ReviewExamRecord>>(EMPTY_RECORDS);
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [bookmarkNoteDraft, setBookmarkNoteDraft] = useState("");
  const [bookmarkTagsDraft, setBookmarkTagsDraft] = useState("");

  useEffect(() => {
    let isMounted = true;

    if (activeTab === "mistakes") {
      setMistakesState((current) => ({ ...current, status: "loading" }));
      apiClient
        .get<ReviewMistakesResponse>("/review/mistakes")
        .then((payload) => {
          if (isMounted) {
            setMistakesState({ status: "ready", items: payload?.items ?? [] });
          }
        })
        .catch(() => {
          if (isMounted) {
            setMistakesState({ status: "error", items: [] });
          }
        });
    }

    if (activeTab === "bookmarks") {
      setBookmarksState((current) => ({ ...current, status: "loading" }));
      apiClient
        .get<ReviewBookmarksResponse>("/review/bookmarks")
        .then((payload) => {
          if (isMounted) {
            setBookmarksState({ status: "ready", items: payload?.items ?? [] });
          }
        })
        .catch(() => {
          if (isMounted) {
            setBookmarksState({ status: "error", items: [] });
          }
        });
    }

    if (activeTab === "records") {
      setRecordsState((current) => ({ ...current, status: "loading" }));
      apiClient
        .get<ReviewRecordsResponse>("/review/records")
        .then((payload) => {
          if (isMounted) {
            setRecordsState({ status: "ready", items: payload?.items ?? [] });
          }
        })
        .catch(() => {
          if (isMounted) {
            setRecordsState({ status: "error", items: [] });
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  async function updateMistakeMastery(item: ReviewMistakeItem) {
    const updated = await apiClient.patch<ReviewMistakeItem>(`/review/mistakes/${item.id}`, {
      isMastered: !item.isMastered
    });

    setMistakesState((current) => ({
      ...current,
      items: current.items.map((candidate) => (candidate.id === item.id ? updated ?? candidate : candidate))
    }));
  }

  async function removeMistake(item: ReviewMistakeItem) {
    await apiClient.delete<{ deleted: boolean }>(`/review/mistakes/${item.id}`);
    setMistakesState((current) => ({
      ...current,
      items: current.items.filter((candidate) => candidate.id !== item.id)
    }));
  }

  function startEditingBookmark(item: ReviewBookmarkItem) {
    setEditingBookmarkId(item.id);
    setBookmarkNoteDraft(item.note ?? "");
    setBookmarkTagsDraft(item.tags.join(", "));
  }

  async function saveBookmark(item: ReviewBookmarkItem) {
    const note = normalizeNote(bookmarkNoteDraft);
    const tags = normalizeTags(bookmarkTagsDraft);
    const updated = await apiClient.patch<BookmarkPatchResponse>(`/bookmarks/${item.questionId}`, { note, tags });

    setBookmarksState((current) => ({
      ...current,
      items: current.items.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              ...updated,
              note: hasOwn(updated, "note") ? updated.note ?? null : note,
              tags: hasOwn(updated, "tags") ? updated.tags ?? [] : tags,
              question: updated?.question ?? candidate.question,
              createdAt: updated?.createdAt ?? candidate.createdAt
            }
          : candidate
      )
    }));
    setEditingBookmarkId(null);
  }

  async function removeBookmark(item: ReviewBookmarkItem) {
    await apiClient.delete<{ deleted: boolean }>(`/bookmarks/${item.questionId}`);
    setBookmarksState((current) => ({
      ...current,
      items: current.items.filter((candidate) => candidate.id !== item.id)
    }));
    if (editingBookmarkId === item.id) {
      setEditingBookmarkId(null);
    }
  }

  return (
    <>
      <div className="review-toolbar">
        <ReviewTabs activeTab={activeTab} onChange={setActiveTab} />
      </div>

      <div className="review-panels">
        {activeTab === "mistakes" ? <MistakesPanel state={mistakesState} onUpdateMastery={updateMistakeMastery} onRemove={removeMistake} /> : null}
        {activeTab === "bookmarks" ? (
          <BookmarksPanel
            state={bookmarksState}
            editingBookmarkId={editingBookmarkId}
            noteDraft={bookmarkNoteDraft}
            tagsDraft={bookmarkTagsDraft}
            onEdit={startEditingBookmark}
            onCancelEdit={() => setEditingBookmarkId(null)}
            onChangeNote={setBookmarkNoteDraft}
            onChangeTags={setBookmarkTagsDraft}
            onSave={saveBookmark}
            onRemove={removeBookmark}
          />
        ) : null}
        {activeTab === "records" ? <RecordsPanel state={recordsState} /> : null}
      </div>
    </>
  );
}

function MistakesPanel({
  state,
  onUpdateMastery,
  onRemove
}: {
  state: ResourceState<ReviewMistakeItem>;
  onUpdateMastery: (item: ReviewMistakeItem) => void;
  onRemove: (item: ReviewMistakeItem) => void;
}) {
  const pagination = usePaginatedItems(state.items);

  if (state.status === "loading" || state.status === "idle") {
    return <PanelState message="正在加载复习数据..." />;
  }

  if (state.status === "error") {
    return <PanelState message="复习数据加载失败，请稍后重试。" isError />;
  }

  if (state.items.length === 0) {
    return <PanelState message="暂无错题记录。" />;
  }

  return (
    <section className="review-table panel" aria-label="错题列表">
      <div className="table-head">
        <span>题目</span>
        <span>题源</span>
        <span>错次</span>
        <span>掌握状态</span>
        <span className="operation-column">操作</span>
      </div>
      {pagination.items.map((item) => (
        <div className="table-row" key={item.id}>
          <strong>{questionSummaryText(item.question)}</strong>
          <span>{questionSourceLabel(item.question)}</span>
          <span>{item.wrongCount}</span>
          <span className={`status-chip ${statusClass(item.masteryStatus.color)}`}>{item.masteryStatus.label}</span>
          <span className="operation-column">
            <span className="review-actions">
              <Link className="primary-button" to={`/practice?questionId=${encodeURIComponent(item.questionId)}`}>
                重练
              </Link>
              <button className="secondary-button" type="button" onClick={() => onUpdateMastery(item)}>
                {item.isMastered ? "取消掌握" : "标记掌握"}
              </button>
              <button className="danger-button" type="button" onClick={() => onRemove(item)}>
                移除错题
              </button>
            </span>
          </span>
        </div>
      ))}
      <ReviewPagination {...pagination} />
    </section>
  );
}

function BookmarksPanel({
  state,
  editingBookmarkId,
  noteDraft,
  tagsDraft,
  onEdit,
  onCancelEdit,
  onChangeNote,
  onChangeTags,
  onSave,
  onRemove
}: {
  state: ResourceState<ReviewBookmarkItem>;
  editingBookmarkId: string | null;
  noteDraft: string;
  tagsDraft: string;
  onEdit: (item: ReviewBookmarkItem) => void;
  onCancelEdit: () => void;
  onChangeNote: (value: string) => void;
  onChangeTags: (value: string) => void;
  onSave: (item: ReviewBookmarkItem) => void;
  onRemove: (item: ReviewBookmarkItem) => void;
}) {
  const pagination = usePaginatedItems(state.items);

  if (state.status === "loading" || state.status === "idle") {
    return <PanelState message="正在加载复习数据..." />;
  }

  if (state.status === "error") {
    return <PanelState message="复习数据加载失败，请稍后重试。" isError />;
  }

  if (state.items.length === 0) {
    return <PanelState message="暂无收藏题目。" />;
  }

  return (
    <section className="review-table panel" aria-label="收藏列表">
      <div className="table-head bookmarks">
        <span>题目</span>
        <span>题源</span>
        <span>题型</span>
        <span>收藏时间</span>
        <span>备注/标签</span>
        <span className="operation-column">操作</span>
      </div>
      {pagination.items.map((item) => (
        <div className="review-row-group" key={item.id}>
          <div className="table-row bookmarks">
            <strong>{questionSummaryText(item.question)}</strong>
            <span>{questionSourceLabel(item.question)}</span>
            <span>{questionTypeLabel(item.question.type)}</span>
            <span>{formatDate(item.createdAt)}</span>
            <span className="bookmark-meta">
              <BookmarkMeta item={item} />
            </span>
            <span className="operation-column">
              <span className="review-actions">
                <Link className="primary-button" to={`/practice?questionId=${encodeURIComponent(item.questionId)}`}>
                  练习
                </Link>
                <Link className="secondary-button" to={`/practice?mode=recite&questionId=${encodeURIComponent(item.questionId)}`}>
                  背诵
                </Link>
                <button className="secondary-button" type="button" onClick={() => onEdit(item)}>
                  编辑
                </button>
                <button className="danger-button" type="button" onClick={() => onRemove(item)}>
                  取消收藏
                </button>
              </span>
            </span>
          </div>
          {editingBookmarkId === item.id ? (
            <form
              className="review-edit-row"
              onSubmit={(event) => {
                event.preventDefault();
                onSave(item);
              }}
            >
              <label>
                备注
                <input value={noteDraft} onChange={(event) => onChangeNote(event.target.value)} />
              </label>
              <label>
                标签
                <input value={tagsDraft} onChange={(event) => onChangeTags(event.target.value)} placeholder="使用逗号分隔" />
              </label>
              <div className="review-actions">
                <button className="primary-button" type="submit">
                  保存
                </button>
                <button className="secondary-button" type="button" onClick={onCancelEdit}>
                  取消
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ))}
      <ReviewPagination {...pagination} />
    </section>
  );
}

function RecordsPanel({ state }: { state: ResourceState<ReviewExamRecord> }) {
  const pagination = usePaginatedItems(state.items);

  if (state.status === "loading" || state.status === "idle") {
    return <PanelState message="正在加载复习数据..." />;
  }

  if (state.status === "error") {
    return <PanelState message="复习数据加载失败，请稍后重试。" isError />;
  }

  if (state.items.length === 0) {
    return <PanelState message="暂无模拟考记录。" />;
  }

  return (
    <section className="review-table panel" aria-label="模拟考记录">
      <div className="table-head records">
        <span>考试范围</span>
        <span>分数/状态</span>
        <span>提交时间</span>
        <span className="operation-column">操作</span>
      </div>
      {pagination.items.map((item) => (
        <ExamRecordRow item={item} key={item.id} />
      ))}
      <ReviewPagination {...pagination} />
    </section>
  );
}

function ExamRecordRow({ item }: { item: ReviewExamRecord }) {
  const isPassed = item.isPassed === true;
  const resultClass = item.status !== "submitted" ? "warning" : isPassed ? "success" : "needs-work";
  const resultLabel = item.status === "submitted" ? `${formatPercent(item.scorePercent ?? 0)} · ${isPassed ? "已通过" : "未通过"}` : "未提交";

  return (
    <div className="table-row records">
      <strong>{sourceLabel(item.subject, item.language, item.level)} 模拟考</strong>
      <span className={`status-chip ${resultClass}`}>{resultLabel}</span>
      <span>{formatDate(item.submittedAt ?? item.startedAt)}</span>
      <span className="operation-column">
        <span className="review-actions">
          <Link className="primary-button" to={`/exam?examId=${encodeURIComponent(item.id)}`}>
            查看复盘
          </Link>
        </span>
      </span>
    </div>
  );
}

function ReviewPagination({
  total,
  page,
  pageCount,
  pageSize,
  setPage,
  setPageSize
}: ReturnType<typeof usePaginatedItems>) {
  return (
    <div className="review-pagination" aria-label="分页">
      <span>共 {total} 条</span>
      <span>第 {page} / {pageCount} 页</span>
      <button className="secondary-button" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
        上一页
      </button>
      <button className="secondary-button" type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
        下一页
      </button>
      <label>
        每页数量
        <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function PanelState({ message, isError = false }: { message: string; isError?: boolean }) {
  return (
    <section className="panel review-state-panel" role={isError ? "alert" : undefined}>
      {message}
    </section>
  );
}

function usePaginatedItems<TItem>(items: TItem[]) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageCount,
    pageSize,
    setPage,
    setPageSize
  };
}

function questionSummaryText(question: ReviewQuestionSummary): string {
  return summarizeMarkdown(question.stemMd);
}

function summarizeMarkdown(value: string): string {
  const stripped = value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_~-]+/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return stripped.length > 90 ? `${stripped.slice(0, 90)}...` : stripped;
}

function questionSourceLabel(question: ReviewQuestionSummary): string {
  return sourceLabel(question.subject, question.language, question.level);
}

function sourceLabel(subject: string, language: string | null, level: string): string {
  return [
    isSubject(subject) ? getSubjectLabel(subject, "short") : subject,
    language && isLanguage(language) ? getLanguageLabel(language) : language,
    isLevel(level) ? getLevelLabel(level) : level
  ]
    .filter(Boolean)
    .join(" / ");
}

function questionTypeLabel(type: string): string {
  return isQuestionType(type) ? getQuestionTypeLabel(type) : type;
}

function statusClass(color: ReviewMistakeItem["masteryStatus"]["color"]): string {
  if (color === "success") {
    return "success";
  }
  if (color === "warning") {
    return "warning";
  }
  return "needs-work";
}

function BookmarkMeta({ item }: { item: ReviewBookmarkItem }) {
  const note = item.note?.trim() ?? "";
  const tags = item.tags.length > 0 ? item.tags.join(" / ") : "";

  if (note === "" && tags === "") {
    return <>无备注 / 无标签</>;
  }

  return (
    <>
      {note ? <span>{note}</span> : null}
      {note && tags ? <span aria-hidden="true">·</span> : null}
      {tags ? <span>{tags}</span> : null}
    </>
  );
}

function normalizeNote(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeTags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function hasOwn<TObject extends object, TKey extends PropertyKey>(value: TObject | undefined, key: TKey): value is TObject & Record<TKey, unknown> {
  return value !== undefined && Object.prototype.hasOwnProperty.call(value, key);
}

function isSubject(value: string): value is Subject {
  return (SUBJECTS as readonly string[]).includes(value);
}

function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

function isLevel(value: string): value is Level {
  return (LEVELS as readonly string[]).includes(value);
}

function isQuestionType(value: string): value is QuestionType {
  return (QUESTION_TYPES as readonly string[]).includes(value);
}
