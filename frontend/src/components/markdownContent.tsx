import type { ReactNode } from "react";

interface MarkdownBlock {
  type: "paragraph" | "code";
  content: string;
  language?: string;
}

export function hasMarkdownCode(value: string): boolean {
  return /```/.test(value);
}

export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\-[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const paragraph: string[] = [];
  const code: string[] = [];
  let codeLanguage: string | undefined;

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", content: paragraph.join(" ") });
      paragraph.length = 0;
    }
  }

  function flushCode() {
    blocks.push({ type: "code", content: code.join("\n"), language: codeLanguage });
    code.length = 0;
    codeLanguage = undefined;
  }

  for (const line of markdown.split("\n")) {
    const fence = line.match(/^```([a-zA-Z0-9+#-]*)\s*$/);

    if (fence && codeLanguage === undefined) {
      flushParagraph();
      codeLanguage = fence[1] || "text";
      continue;
    }

    if (fence && codeLanguage !== undefined) {
      flushCode();
      continue;
    }

    if (codeLanguage !== undefined) {
      code.push(line);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      continue;
    }

    paragraph.push(line.trim());
  }

  if (codeLanguage !== undefined) {
    flushCode();
  }
  flushParagraph();

  return blocks;
}

export function renderMarkdownBlock(block: MarkdownBlock, index: number): ReactNode {
  if (block.type === "code") {
    return (
      <pre className={`code-block language-${block.language ?? "text"}`} key={`${block.type}-${index}`}>
        <code>{highlightCode(block.content)}</code>
      </pre>
    );
  }

  return <p key={`${block.type}-${index}`}>{block.content}</p>;
}

function highlightCode(code: string): ReactNode[] {
  const parts = code.split(/(\b(?:Map|String|Integer|new|ConcurrentHashMap|merge|return|if|const|let|var|function)\b|\b\d+\b)/g);

  return parts.map((part, index) => {
    if (/^(Map|new|return|if|const|let|var|function)$/.test(part)) {
      return (
        <span className="token keyword" key={`${part}-${index}`}>
          {part}
        </span>
      );
    }

    if (/^(String|Integer|ConcurrentHashMap)$/.test(part)) {
      return (
        <span className="token type" key={`${part}-${index}`}>
          {part}
        </span>
      );
    }

    if (/^merge$/.test(part)) {
      return (
        <span className="token function" key={`${part}-${index}`}>
          {part}
        </span>
      );
    }

    if (/^\d+$/.test(part)) {
      return (
        <span className="token number" key={`${part}-${index}`}>
          {part}
        </span>
      );
    }

    return part;
  });
}
