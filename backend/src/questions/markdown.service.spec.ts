import { MarkdownService } from "./markdown.service";

describe("MarkdownService", () => {
  const service = new MarkdownService();

  it("renders fenced code blocks with supported language highlighting", () => {
    const html = service.render("```java\npublic class Demo {}\n```");

    expect(html).toContain("<pre");
    expect(html).toContain("<code");
    expect(html).toContain("language-java");
    expect(html).toContain("hljs");
    expect(html).toContain("class");
  });

  it("strips scripts, event handlers, unsafe links, iframes, and external images", () => {
    const html = service.render(`
<script>alert("x")</script>
<iframe src="/uploads/questions/202605/a.png"></iframe>
<img src="https://example.com/a.png" onerror="alert(1)">
<img src="/uploads/questions/202605/a.png" alt="local" onload="alert(1)">
<a href="javascript:alert(1)">bad</a>
<a href="/uploads/questions/202605/a.png">good</a>
`);

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("onload");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("https://example.com");
    expect(html).toContain('src="/uploads/questions/202605/a.png"');
    expect(html).toContain('href="/uploads/questions/202605/a.png"');
  });
});
