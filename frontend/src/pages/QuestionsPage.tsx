import { Bookmark } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import type { QuestionDetail, QuestionListItem, QuestionListResponse } from "../api/types";
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

const PAGE_SIZE = 100;
const FILTER_STORAGE_KEY = "sited.questions.filters.v1";

interface QuestionFilters {
  subject: Subject;
  language: Language;
  level: Level;
  type: QuestionType;
  keyword: string;
}

const DEFAULT_FILTERS: QuestionFilters = {
  subject: "programming",
  language: "java",
  level: "working",
  type: "single",
  keyword: ""
};

export function QuestionsPage() {
  const [filters, setFilters] = useState<QuestionFilters>(() => loadStoredFilters());
  const [questions, setQuestions] = useState<QuestionListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuestionDetail | null>(null);
  const [listStatus, setListStatus] = useState<"loading" | "ready" | "error">("loading");
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const practiceHref = useMemo(() => `/practice?${filtersToSearchParams(filters).toString()}`, [filters]);

  useEffect(() => {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    let isMounted = true;
    setListStatus("loading");
    setSelectedId(null);
    setDetail(null);
    setDetailStatus("idle");

    fetchAllQuestions(filters)
      .then((items) => {
        if (!isMounted) {
          return;
        }
        setQuestions(items);
        setSelectedId(items[0]?.id ?? null);
        setListStatus("ready");
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setQuestions([]);
        setSelectedId(null);
        setListStatus("error");
      });

    return () => {
      isMounted = false;
    };
  }, [filters]);

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      setDetailStatus("idle");
      return;
    }

    let isMounted = true;
    setDetailStatus("loading");
    apiClient
      .get<QuestionDetail>(`/questions/${selectedId}`)
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
  }, [selectedId]);

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
          {listStatus === "loading" ? <div className="panel">正在加载真实题目...</div> : null}
          {listStatus === "error" ? <div className="panel" role="alert">题目加载失败，请稍后重试。</div> : null}
          {listStatus === "ready" && questions.length === 0 ? <div className="panel">当前筛选条件下暂无已发布题目。</div> : null}
          {questions.map((question) => (
            <article
              className={question.id === selectedId ? "question-card selected" : "question-card"}
              onClick={() => setSelectedId(question.id)}
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
              <h3>{plainText(question.stemMd)}</h3>
              {question.memo ? <p>{question.memo}</p> : null}
              <div className="question-footer">
                <span>正确率 {question.correctRate}%</span>
                <button className="icon-button small" type="button" aria-label={`收藏：${plainText(question.stemMd)}`} onClick={(event) => event.stopPropagation()}>
                  <Bookmark aria-hidden="true" size={16} />
                </button>
              </div>
            </article>
          ))}
        </section>

        <QuestionPreview detail={detailStatus === "error" ? null : detail} loading={detailStatus === "loading"} />
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

async function fetchAllQuestions(filters: QuestionFilters): Promise<QuestionListItem[]> {
  const firstPage = await fetchQuestionPage(filters, 1);
  const total = firstPage.total;
  const pageCount = Math.ceil(total / PAGE_SIZE);

  if (pageCount <= 1) {
    return firstPage.items;
  }

  const rest = await Promise.all(Array.from({ length: pageCount - 1 }, (_value, index) => fetchQuestionPage(filters, index + 2)));
  return [firstPage, ...rest].flatMap((page) => page.items);
}

async function fetchQuestionPage(filters: QuestionFilters, page: number): Promise<QuestionListResponse> {
  const payload = await apiClient.get<QuestionListResponse>(`/questions?${filtersToSearchParams(filters, page).toString()}`);
  return payload ?? { items: [], page, pageSize: PAGE_SIZE, total: 0 };
}

function filtersToSearchParams(filters: QuestionFilters, page = 1): URLSearchParams {
  const params = new URLSearchParams({
    subject: filters.subject,
    language: filters.language,
    level: filters.level,
    type: filters.type,
    page: String(page),
    pageSize: String(PAGE_SIZE)
  });
  const keyword = filters.keyword.trim();
  if (keyword.length > 0) {
    params.set("keyword", keyword);
  }
  return params;
}

function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\-[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    isOneOf(value.subject, SUBJECTS) &&
    isOneOf(value.language, LANGUAGES) &&
    isOneOf(value.level, LEVELS) &&
    isOneOf(value.type, QUESTION_TYPES) &&
    typeof value.keyword === "string"
  );
}

function isOneOf<TValue extends string>(value: unknown, values: readonly TValue[]): value is TValue {
  return typeof value === "string" && values.includes(value as TValue);
}
