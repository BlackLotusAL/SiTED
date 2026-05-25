import { BookOpenCheck, Play } from "lucide-react";
import { Link } from "react-router-dom";
import type { QuestionDetail } from "../api/types";
import { getLanguageLabel, getLevelLabel, getQuestionTypeLabel, getSubjectLabel, type Language, type Level, type QuestionType, type Subject } from "../domain/labels";
import { BookmarkStateIcon } from "./BookmarkStateIcon";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { OptionContent } from "./MarkdownEditor";
import { hasMarkdownCode } from "./markdownContent";

export interface QuestionPreviewProps {
  detail?: QuestionDetail | null;
  loading?: boolean;
  isBookmarked?: boolean;
  isBookmarking?: boolean;
  onToggleBookmark?: (questionId: string) => void;
}

export function QuestionPreview({ detail, loading = false, isBookmarked = false, isBookmarking = false, onToggleBookmark }: QuestionPreviewProps) {
  if (loading) {
    return <LoadingSkeleton variant="question-preview" />;
  }

  if (!detail) {
    return (
      <aside className="detail-panel panel question-preview-card" aria-label="题目预览">
        <h2>题目预览</h2>
        <p>请选择左侧真实题目查看预览。</p>
      </aside>
    );
  }

  const practiceHref = `/practice?questionId=${encodeURIComponent(detail.id)}`;
  const reciteHref = `/practice?mode=recite&questionId=${encodeURIComponent(detail.id)}`;
  const bookmarkLabel = isBookmarked ? "取消收藏题目" : "收藏题目";

  return (
    <aside className="detail-panel panel question-preview-card" aria-label="题目预览">
      <h2>题目预览</h2>
      <div className="question-meta">
        <span>{getSubjectLabel(detail.source.subject as Subject, "short")}</span>
        {detail.source.language ? <span>{getLanguageLabel(detail.source.language as Language)}</span> : null}
        <span>{getLevelLabel(detail.source.level as Level)}</span>
        <span>{getQuestionTypeLabel(detail.source.type as QuestionType)}</span>
      </div>
      <div className="markdown-preview-body question-stem-preview" dangerouslySetInnerHTML={{ __html: detail.stemHtml }} />
      {detail.memo ? <p>{detail.memo}</p> : null}
      <div className="preview-options">
        {detail.options.map((option) => (
          <div className="preview-option" key={option.key}>
            {hasMarkdownCode(option.text) ? (
              <>
                <span>{option.key}.</span>
                <OptionContent value={option.text} />
              </>
            ) : (
              `${option.key}. ${option.text}`
            )}
          </div>
        ))}
      </div>
      <div className="tag-row">
        {detail.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <p>
        真实练习统计：作答 {detail.stats.totalAttempts} 次，正确率 {detail.stats.correctRate}%。
      </p>
      <div className="button-row">
        <Link className="primary-button" to={practiceHref}>
          <Play aria-hidden="true" size={17} />
          练习此题
        </Link>
        <Link className="secondary-button" to={reciteHref}>
          <BookOpenCheck aria-hidden="true" size={17} />
          背诵此题
        </Link>
        <button
          className={isBookmarked ? "icon-button active" : "icon-button"}
          type="button"
          aria-label={bookmarkLabel}
          aria-pressed={isBookmarked}
          disabled={isBookmarking}
          onClick={() => onToggleBookmark?.(detail.id)}
        >
          <BookmarkStateIcon isBookmarked={isBookmarked} size={17} />
        </button>
      </div>
    </aside>
  );
}
