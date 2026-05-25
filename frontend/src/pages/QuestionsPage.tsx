import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import type { QuestionDetail, QuestionListItem, QuestionListResponse, ReviewBookmarksResponse } from "../api/types";
import { BookmarkStateIcon } from "../components/BookmarkStateIcon";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { markdownToPlainText } from "../components/markdownContent";
import { QuestionPreview } from "../components/QuestionPreview";
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
import { ALL_FILTER_VALUE, appendFilterParam, isFilterValue, type FilterValue } from "../domain/filtering";
import { invalidateStaleResource, useStaleResource } from "../hooks/useStaleResource";
import { uniqueByQuestionId } from "../domain/questionLists";

const PAGE_SIZE = 100;
const FILTER_STORAGE_KEY = "sited.questions.filters.v2";

interface QuestionFilters {
  subject: FilterValue<Subject>;
  language: FilterValue<Language>;
  level: FilterValue<Level>;
  type: FilterValue<QuestionType>;
  keyword: string;
}

const DEFAULT_FILTERS: QuestionFilters = {
  subject: ALL_FILTER_VALUE,
  language: ALL_FILTER_VALUE,
  level: ALL_FILTER_VALUE,
  type: ALL_FILTER_VALUE,
  keyword: ""
};

export function QuestionsPage() {
  const [filters, setFilters] = useState<QuestionFilters>(() => loadStoredFilters());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bookmarkedQuestionIds, setBookmarkedQuestionIds] = useState<Set<string>>(() => new Set());
  const [bookmarkingQuestionIds, setBookmarkingQuestionIds] = useState<Set<string>>(() => new Set());
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const practiceHref = useMemo(() => `/practice?${filtersToSearchParams(filters).toString()}`, [filters]);
  const questionListKey = useMemo(() => `/questions?${filtersToSearchParams(filters).toString()}`, [filters]);
  const questionListResource = useStaleResource<QuestionListItem[]>({
    key: questionListKey,
    load: () => fetchAllQuestions(filters)
  });
  const detailResource = useStaleResource<QuestionDetail | null>({
    key: selectedId === null ? "/questions:none" : `/questions/${selectedId}`,
    enabled: selectedId !== null,
    load: async () => (selectedId === null ? null : (await apiClient.get<QuestionDetail>(`/questions/${selectedId}`)) ?? null)
  });
  const bookmarkResource = useStaleResource<ReviewBookmarksResponse>({
    key: "/review/bookmarks",
    load: async () => (await apiClient.get<ReviewBookmarksResponse>("/review/bookmarks")) ?? { items: [] }
  });
  const questions = questionListResource.data ?? [];
  const detail = detailResource.data ?? null;

  useEffect(() => {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    if (bookmarkResource.data) {
      setBookmarkedQuestionIds(new Set(bookmarkResource.data.items.map((item) => item.questionId)));
    }
  }, [bookmarkResource.data]);

  useEffect(() => {
    if (bookmarkResource.error && bookmarkResource.data === undefined) {
      setBookmarkError("收藏状态加载失败，请稍后重试。");
    }
  }, [bookmarkResource.data, bookmarkResource.error]);

  useEffect(() => {
    if (questionListResource.data === undefined) {
      setSelectedId(null);
      return;
    }

    setSelectedId((current) => {
      if (current && questionListResource.data?.some((question) => question.id === current)) {
        return current;
      }
      return questionListResource.data?.[0]?.id ?? null;
    });
  }, [questionListResource.data]);

  async function toggleBookmark(questionId: string) {
    if (bookmarkingQuestionIds.has(questionId)) {
      return;
    }

    const isBookmarked = bookmarkedQuestionIds.has(questionId);
    setBookmarkError(null);
    setBookmarkingQuestionIds((current) => new Set(current).add(questionId));

    try {
      if (isBookmarked) {
        await apiClient.delete<{ deleted: boolean }>(`/bookmarks/${questionId}`);
        setBookmarkedQuestionIds((current) => {
          const next = new Set(current);
          next.delete(questionId);
          return next;
        });
      } else {
        await apiClient.post(`/bookmarks/${questionId}`, {});
        setBookmarkedQuestionIds((current) => new Set(current).add(questionId));
      }
      invalidateStaleResource("/review/bookmarks");
    } catch {
      setBookmarkError("收藏操作失败，请稍后重试。");
    } finally {
      setBookmarkingQuestionIds((current) => {
        const next = new Set(current);
        next.delete(questionId);
        return next;
      });
    }
  }

  return (
    <>
      <section className="panel">
        <div className="panel-heading compact">
          <h2>按题源组合快速筛选</h2>
          <Link className="primary-button" to={practiceHref}>
            按当前筛选练习
          </Link>
        </div>
        <div className="filter-bar">
          <FilterSelect label="科目" value={filters.subject} values={SUBJECTS} formatter={(value) => getSubjectLabel(value)} onChange={(subject) => setFilters((current) => ({ ...current, subject }))} />
          <FilterSelect label="语言" value={filters.language} values={LANGUAGES} formatter={(value) => getLanguageLabel(value)} onChange={(language) => setFilters((current) => ({ ...current, language }))} />
          <FilterSelect label="级别" value={filters.level} values={LEVELS} formatter={(value) => getLevelLabel(value)} onChange={(level) => setFilters((current) => ({ ...current, level }))} />
          <FilterSelect label="题型" value={filters.type} values={QUESTION_TYPES} formatter={(value) => getQuestionTypeLabel(value)} onChange={(type) => setFilters((current) => ({ ...current, type }))} />
          <label className="search-field">
            关键词
            <input
              type="search"
              value={filters.keyword}
              onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
              placeholder="题干、解析、编号或标签"
            />
          </label>
        </div>
      </section>

      <div className="question-layout">
        <section className="question-list" aria-label="题目列表">
          {bookmarkError ? (
            <div className="bookmark-error" role="alert">
              {bookmarkError}
            </div>
          ) : null}
          {questionListResource.isInitialLoading ? <LoadingSkeleton variant="question-list" /> : null}
          {questionListResource.error && questionListResource.data === undefined ? <div className="panel" role="alert">题目加载失败，请稍后重试。</div> : null}
          {questionListResource.data !== undefined && questions.length === 0 ? <div className="panel">当前筛选条件下暂无已发布题目。</div> : null}
          {questions.map((question) => {
            const summary = markdownToPlainText(question.stemMd);
            const isBookmarked = bookmarkedQuestionIds.has(question.id);
            const isBookmarking = bookmarkingQuestionIds.has(question.id);
            return (
              <motion.article
                className={question.id === selectedId ? "question-card selected" : "question-card"}
                onClick={() => setSelectedId(question.id)}
                layout
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.995 }}
                key={question.id}
              >
                <div className="question-meta">
                  <span>{getSubjectLabel(question.subject as Subject, "short")}</span>
                  {question.language ? <span>{getLanguageLabel(question.language as Language)}</span> : null}
                  <span>{getLevelLabel(question.level as Level)}</span>
                  <span>{getQuestionTypeLabel(question.type as QuestionType)}</span>
                  {question.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <h3>{summary}</h3>
                {question.memo ? <p>{question.memo}</p> : null}
                <div className="question-footer">
                  <span>正确率 {question.correctRate}%</span>
                  <button
                    className={isBookmarked ? "icon-button small active" : "icon-button small"}
                    type="button"
                    aria-label={`${isBookmarked ? "取消收藏" : "收藏"}：${summary}`}
                    aria-pressed={isBookmarked}
                    disabled={isBookmarking}
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggleBookmark(question.id);
                    }}
                  >
                    <BookmarkStateIcon isBookmarked={isBookmarked} size={16} />
                  </button>
                </div>
              </motion.article>
            );
          })}
        </section>

        <QuestionPreview
          detail={detailResource.error && detailResource.data === undefined ? null : detail}
          loading={detailResource.isInitialLoading}
          isBookmarked={detail !== null && bookmarkedQuestionIds.has(detail.id)}
          isBookmarking={detail !== null && bookmarkingQuestionIds.has(detail.id)}
          onToggleBookmark={(questionId) => {
            void toggleBookmark(questionId);
          }}
        />
      </div>
    </>
  );
}

function FilterSelect<TValue extends Subject | Language | Level | QuestionType>({
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

async function fetchAllQuestions(filters: QuestionFilters): Promise<QuestionListItem[]> {
  const firstPage = await fetchQuestionPage(filters, 1);
  const total = firstPage.total;
  const pageCount = Math.ceil(total / PAGE_SIZE);

  if (pageCount <= 1) {
    return uniqueByQuestionId(firstPage.items);
  }

  const rest = await Promise.all(Array.from({ length: pageCount - 1 }, (_value, index) => fetchQuestionPage(filters, index + 2)));
  return uniqueByQuestionId([firstPage, ...rest].flatMap((page) => page.items));
}

async function fetchQuestionPage(filters: QuestionFilters, page: number): Promise<QuestionListResponse> {
  const payload = await apiClient.get<QuestionListResponse>(`/questions?${filtersToSearchParams(filters, page).toString()}`);
  return payload ?? { items: [], page, pageSize: PAGE_SIZE, total: 0 };
}

function filtersToSearchParams(filters: QuestionFilters, page = 1): URLSearchParams {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE)
  });
  appendFilterParam(params, "subject", filters.subject);
  appendFilterParam(params, "language", filters.language);
  appendFilterParam(params, "level", filters.level);
  appendFilterParam(params, "type", filters.type);
  const keyword = filters.keyword.trim();
  if (keyword.length > 0) {
    params.set("keyword", keyword);
  }
  return params;
}

function loadStoredFilters(): QuestionFilters {
  try {
    const rawFilters = localStorage.getItem(FILTER_STORAGE_KEY);
    if (rawFilters === null) {
      return DEFAULT_FILTERS;
    }

    const parsed = JSON.parse(rawFilters) as Partial<QuestionFilters>;
    if (!isValidFilters(parsed)) {
      return DEFAULT_FILTERS;
    }

    return parsed;
  } catch {
    return DEFAULT_FILTERS;
  }
}

function isValidFilters(value: Partial<QuestionFilters>): value is QuestionFilters {
  return (
    isFilterValue(value.subject, SUBJECTS) &&
    isFilterValue(value.language, LANGUAGES) &&
    isFilterValue(value.level, LEVELS) &&
    isFilterValue(value.type, QUESTION_TYPES) &&
    typeof value.keyword === "string"
  );
}
