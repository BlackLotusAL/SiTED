import { Save, Upload } from "lucide-react";
import { useState } from "react";
import { MarkdownEditor, MarkdownPreview } from "../components/MarkdownEditor";

const STEM_SAMPLE = `下面哪个集合适合在并发读写场景下作为线程安全 Map 使用？

\`\`\`java
Map<String, Integer> counts = new ConcurrentHashMap<>();
counts.merge(key, 1, Integer::sum);
\`\`\``;

const OPTIONS = [
  { key: "A", label: "ArrayList" },
  { key: "B", label: "HashMap" },
  { key: "C", label: "ConcurrentHashMap", correct: true },
  { key: "D", label: "LinkedList" }
];

export function AdminQuestionsPage() {
  const [stem, setStem] = useState(STEM_SAMPLE);

  return (
    <div className="editor-layout admin-editor-layout">
      <section className="panel editor-form admin-editor-form">
        <div className="panel-heading compact">
          <h2>新增题目</h2>
          <span className="status-chip">草稿</span>
        </div>

        <div className="form-grid admin-form-grid">
          <label>
            科目
            <select defaultValue="programming">
              <option value="programming">科目二（编程知识）</option>
              <option value="security_privacy">科目三（安全质量隐私）</option>
              <option value="refactoring">科目四（重构知识）</option>
            </select>
          </label>
          <label>
            语言
            <select defaultValue="java">
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
            <select defaultValue="working">
              <option value="entry">入门级</option>
              <option value="working">工作级</option>
              <option value="professional">专业级</option>
            </select>
          </label>
          <label>
            题型
            <select defaultValue="single">
              <option value="single">单选题</option>
              <option value="multiple">多选题</option>
              <option value="judgment">判断题</option>
            </select>
          </label>
        </div>

        <MarkdownEditor onChange={setStem} value={stem} />

        <div className="option-editor" aria-label="选项编辑">
          {OPTIONS.map((option) => (
            <label className="option-entry" key={option.key}>
              <input defaultChecked={option.correct} type="checkbox" aria-label={`${option.key} 为正确答案`} />
              <span>{option.key}</span>
              <input defaultValue={option.label} />
            </label>
          ))}
        </div>

        <label className="block-label">
          解析
          <textarea defaultValue="ConcurrentHashMap 面向并发访问场景，能降低多线程读写时的锁竞争。" />
        </label>

        <div className="editor-action-strip">
          <button className="secondary-button" type="button">
            <Save aria-hidden="true" size={17} />
            保存草稿
          </button>
          <button className="primary-button" type="button">
            <Upload aria-hidden="true" size={17} />
            发布题目
          </button>
        </div>
      </section>

      <aside className="panel question-preview-card admin-preview-panel" aria-label="实时预览">
        <h2>实时预览</h2>
        <MarkdownPreview value={stem} />
        <div className="preview-options">
          {OPTIONS.map((option) => (
            <div className={option.correct ? "preview-option correct" : "preview-option"} key={option.key}>
              {option.key}. {option.label}
            </div>
          ))}
        </div>
        <p className="memo-box">速记：并发集合优先识别 Concurrent 前缀。</p>
      </aside>
    </div>
  );
}
