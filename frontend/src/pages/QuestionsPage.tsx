import { Bookmark } from "lucide-react";
import { Link } from "react-router-dom";
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

const QUESTIONS: Array<{
  id: string;
  type: QuestionType;
  subject: Subject;
  language: Language;
  level: Level;
  tags: string[];
  title: string;
  summary: string;
  accuracy: string;
}> = [
  {
    id: "q-1",
    type: "single",
    subject: "programming",
    language: "java",
    level: "working",
    tags: ["集合", "线程安全"],
    title: "下面哪个集合适合在并发读写场景下作为线程安全 Map 使用？",
    summary: "考察 Java 集合框架中的并发容器选择。",
    accuracy: "74%"
  },
  {
    id: "q-2",
    type: "multiple",
    subject: "programming",
    language: "java",
    level: "working",
    tags: ["异常处理"],
    title: "关于 checked exception 和 unchecked exception，下列说法正确的是？",
    summary: "考察异常分类、编译期约束和 API 设计边界。",
    accuracy: "61%"
  },
  {
    id: "q-3",
    type: "judgment",
    subject: "security_privacy",
    language: "python",
    level: "professional",
    tags: ["内存模型"],
    title: "volatile 能保证复合操作的原子性。",
    summary: "用于辨析可见性、有序性和原子性的差异。",
    accuracy: "58%"
  }
];

export function QuestionsPage() {
  return (
    <>
      <section className="panel">
        <div className="panel-heading compact">
          <h2>按题源组合快速筛选</h2>
          <Link className="primary-button" to="/practice">
            按当前筛选练习
          </Link>
        </div>
        <div className="filter-bar">
          <FilterSelect label="科目" values={SUBJECTS} formatter={(value) => getSubjectLabel(value)} />
          <FilterSelect label="语言" values={LANGUAGES} formatter={(value) => getLanguageLabel(value)} />
          <FilterSelect label="级别" values={LEVELS} formatter={(value) => getLevelLabel(value)} />
          <FilterSelect label="题型" values={QUESTION_TYPES} formatter={(value) => getQuestionTypeLabel(value)} />
          <label className="search-field">
            关键词
            <input type="search" defaultValue="线程安全" />
          </label>
        </div>
      </section>

      <div className="question-layout">
        <section className="question-list" aria-label="题目列表">
          {QUESTIONS.map((question, index) => (
            <article className={index === 0 ? "question-card selected" : "question-card"} key={question.id}>
              <div className="question-meta">
                <span>{getSubjectLabel(question.subject, "short")}</span>
                <span>{getLanguageLabel(question.language)}</span>
                <span>{getLevelLabel(question.level)}</span>
                <span>{getQuestionTypeLabel(question.type)}</span>
                {question.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <h3>{question.title}</h3>
              <p>{question.summary}</p>
              <div className="question-footer">
                <span>正确率 {question.accuracy}</span>
                <button className="icon-button small" type="button" aria-label={`收藏：${question.title}`}>
                  <Bookmark aria-hidden="true" size={16} />
                </button>
              </div>
            </article>
          ))}
        </section>

        <QuestionPreview
          title="ConcurrentHashMap 的适用场景"
          code="Map<String, Integer> counts = new ConcurrentHashMap<>();"
          description="这道题命中“科目二 / Java / 工作级”组合，适合作为集合和并发基础的练习题。"
          options={[
            { key: "A", label: "ArrayList" },
            { key: "B", label: "HashMap" },
            { key: "C", label: "ConcurrentHashMap", correct: true },
            { key: "D", label: "LinkedList" }
          ]}
          tags={["集合", "线程安全", "并发容器"]}
        />
      </div>
    </>
  );
}

function FilterSelect<TValue extends Subject | Language | Level | QuestionType>({
  label,
  values,
  formatter
}: {
  label: string;
  values: readonly TValue[];
  formatter: (value: TValue) => string;
}) {
  return (
    <label>
      {label}
      <select defaultValue={values[0]}>
        {values.map((value) => (
          <option value={value} key={value}>
            {formatter(value)}
          </option>
        ))}
      </select>
    </label>
  );
}
