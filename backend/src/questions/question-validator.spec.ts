import { validateQuestionInput } from "./question-validator";

describe("question-validator", () => {
  it("reports tags field errors instead of silently dropping malformed tags", () => {
    expect(errorsFor({ tags: "collections" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "tags" })])
    );
    expect(errorsFor({ tags: ["collections", 1] })).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "tags" })])
    );
  });

  it("reports malformed option rows instead of throwing", () => {
    expect(() => errorsFor({ options: [null, undefined, "A"] })).not.toThrow();
    expect(errorsFor({ options: [null, undefined, "A"] })).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "options" })])
    );
  });
});

function errorsFor(overrides: Record<string, unknown>) {
  return validateQuestionInput({
    sourceCode: "SRC-1",
    subject: "programming",
    language: "java",
    level: "working",
    type: "single",
    tags: ["collections"],
    stemMd: "Stem",
    options: [
      { key: "A", text: "A", isCorrect: true },
      { key: "B", text: "B", isCorrect: false }
    ],
    explanationMd: "Explanation",
    memo: "Memo",
    ...overrides
  });
}
