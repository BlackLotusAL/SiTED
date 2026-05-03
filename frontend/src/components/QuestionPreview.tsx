import { Bookmark, BookOpenCheck, Play } from "lucide-react";
import { Link } from "react-router-dom";

export interface PreviewOption {
  key: string;
  label: string;
  correct?: boolean;
}

export interface QuestionPreviewProps {
  title: string;
  code?: string;
  description: string;
  options: PreviewOption[];
  tags: string[];
}

export function QuestionPreview({ title, code, description, options, tags }: QuestionPreviewProps) {
  return (
    <aside className="detail-panel panel question-preview-card" aria-label="题目预览">
      <h2>题目预览</h2>
      <h3>{title}</h3>
      {code ? (
        <pre>
          <code>{code}</code>
        </pre>
      ) : null}
      <p>{description}</p>
      <div className="preview-options">
        {options.map((option) => (
          <div className={option.correct ? "preview-option correct" : "preview-option"} key={option.key}>
            {option.key}. {option.label}
          </div>
        ))}
      </div>
      <div className="tag-row">
        {tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <div className="button-row">
        <Link className="primary-button" to="/practice">
          <Play aria-hidden="true" size={17} />
          练习此题
        </Link>
        <Link className="secondary-button" to="/recite">
          <BookOpenCheck aria-hidden="true" size={17} />
          背诵
        </Link>
        <button className="icon-button" type="button" aria-label="收藏题目">
          <Bookmark aria-hidden="true" size={17} />
        </button>
      </div>
    </aside>
  );
}
