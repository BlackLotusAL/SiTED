import { Injectable } from "@nestjs/common";
import hljs from "highlight.js";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";

const SUPPORTED_LANGUAGES: Record<string, string> = {
  java: "java",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  python: "python",
  py: "python",
  javascript: "javascript",
  js: "javascript",
  go: "go"
};

@Injectable()
export class MarkdownService {
  private readonly markdown = new MarkdownIt({
    html: true,
    linkify: true,
    highlight: (code, language) => this.highlight(code, language)
  });

  render(markdown: string | null | undefined): string {
    const unsafeHtml = this.markdown.render(markdown ?? "");

    return sanitizeHtml(unsafeHtml, {
      allowedTags: [
        "a",
        "blockquote",
        "br",
        "code",
        "em",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "img",
        "li",
        "ol",
        "p",
        "pre",
        "span",
        "strong",
        "table",
        "tbody",
        "td",
        "th",
        "thead",
        "tr",
        "ul"
      ],
      allowedAttributes: {
        a: ["href", "name", "target", "rel"],
        code: ["class"],
        img: ["src", "alt", "title"],
        span: ["class"],
        pre: ["class"],
        th: ["align"],
        td: ["align"]
      },
      allowedClasses: {
        code: [/^language-/, /^hljs$/],
        span: [/^hljs-/],
        pre: [/^hljs$/]
      },
      allowedSchemes: ["http", "https", "mailto"],
      transformTags: {
        a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true)
      },
      exclusiveFilter: (frame) => {
        if (frame.tag === "img") {
          return !isSameOriginUpload(frame.attribs.src);
        }
        if (frame.tag === "a" && frame.attribs.href?.startsWith("/")) {
          return !isSameOriginUpload(frame.attribs.href);
        }
        return false;
      }
    });
  }

  private highlight(code: string, language: string): string {
    const normalized = SUPPORTED_LANGUAGES[language.toLowerCase()];
    if (normalized === undefined) {
      return `<pre class="hljs"><code>${this.markdown.utils.escapeHtml(code)}</code></pre>`;
    }

    const highlighted = hljs.highlight(code, { language: normalized, ignoreIllegals: true }).value;
    return `<pre class="hljs"><code class="hljs language-${normalized}">${highlighted}</code></pre>`;
  }
}

function isSameOriginUpload(value: string | undefined): boolean {
  return typeof value === "string" && /^\/uploads\/questions\/\d{6}\/[A-Za-z0-9-]+\.(png|jpe?g|webp|gif)$/i.test(value);
}
