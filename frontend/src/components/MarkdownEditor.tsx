import { parseMarkdown, renderMarkdownBlock } from "./markdownContent";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  return (
    <div className="markdown-editor-shell">
      <label className="block-label">
        题干（支持 Markdown 语法）
        <textarea
          aria-label="题干（支持 Markdown 语法）"
          className="markdown-editor-input"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      </label>
    </div>
  );
}

export function MarkdownPreview({ value }: { value: string }) {
  return <div className="markdown-preview-body">{parseMarkdown(value).map(renderMarkdownBlock)}</div>;
}

export function OptionContent({ value }: { value: string }) {
  return <div className="option-content">{parseMarkdown(value).map(renderMarkdownBlock)}</div>;
}
