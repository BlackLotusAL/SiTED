import {
  isCorrectAnswer,
  isValidQuestionAnswerDefinition,
  isValidQuestionStatus,
  isValidQuestionType,
  isValidSourceCombination,
  isValidSubject,
  isValidLanguage,
  isValidLevel
} from "./validation";

describe("domain validation", () => {
  describe("source combinations", () => {
    it("accepts the 21 P0 source combinations", () => {
      const programming = ["c", "cpp", "python", "java"].flatMap((language) =>
        ["entry", "working", "professional"].map((level) => ({
          subject: "programming",
          language,
          level
        }))
      );
      const securityPrivacy = ["c", "cpp", "python", "java"].flatMap((language) =>
        ["working", "professional"].map((level) => ({
          subject: "security_privacy",
          language,
          level
        }))
      );
      const refactoring = [{ subject: "refactoring", language: null, level: "professional" }];

      const combinations = [...programming, ...securityPrivacy, ...refactoring];

      expect(combinations).toHaveLength(21);
      expect(combinations.every((combo) => isValidSourceCombination(combo))).toBe(true);
    });

    it("rejects future languages and invalid refactoring language/level combinations", () => {
      expect(
        isValidSourceCombination({
          subject: "programming",
          language: "javascript",
          level: "entry"
        })
      ).toBe(false);
      expect(
        isValidSourceCombination({
          subject: "security_privacy",
          language: "go",
          level: "working"
        })
      ).toBe(false);
      expect(
        isValidSourceCombination({
          subject: "refactoring",
          language: "java",
          level: "professional"
        })
      ).toBe(false);
      expect(
        isValidSourceCombination({
          subject: "refactoring",
          language: null,
          level: "working"
        })
      ).toBe(false);
    });

    it("accepts refactoring professional source when language is absent", () => {
      expect(
        isValidSourceCombination({
          subject: "refactoring",
          level: "professional"
        })
      ).toBe(true);
    });
  });

  describe("enum validation", () => {
    it("validates domain enum values", () => {
      expect(isValidSubject("programming")).toBe(true);
      expect(isValidSubject("security_privacy")).toBe(true);
      expect(isValidLanguage("go")).toBe(true);
      expect(isValidLevel("professional")).toBe(true);
      expect(isValidQuestionType("judgment")).toBe(true);
      expect(isValidQuestionStatus("published")).toBe(true);

      expect(isValidSubject("security")).toBe(false);
      expect(isValidLanguage("ruby")).toBe(false);
      expect(isValidLevel("senior")).toBe(false);
      expect(isValidQuestionType("essay")).toBe(false);
      expect(isValidQuestionStatus("deleted")).toBe(false);
    });
  });

  describe("answer validation", () => {
    const fourOptions = [
      { key: "A", text: "Option A" },
      { key: "B", text: "Option B" },
      { key: "C", text: "Option C" },
      { key: "D", text: "Option D" }
    ];

    it("returns false instead of throwing for malformed answer definition input", () => {
      const malformedDefinitions = [
        { type: "single", options: null, correctAnswers: ["A"] },
        { type: "single", options: "not-array", correctAnswers: ["A"] },
        { type: "single", options: [1, { key: "B", text: "Option B" }], correctAnswers: ["B"] },
        { type: "single", options: [{ key: 1, text: "Option A" }], correctAnswers: ["A"] },
        { type: "single", options: [{ key: "", text: "Option A" }], correctAnswers: [""] },
        { type: "single", options: fourOptions, correctAnswers: null },
        { type: "single", options: fourOptions, correctAnswers: "A" },
        { type: "single", options: fourOptions, correctAnswers: [1] }
      ];

      for (const definition of malformedDefinitions) {
        expect(() => isValidQuestionAnswerDefinition(definition as never)).not.toThrow();
        expect(isValidQuestionAnswerDefinition(definition as never)).toBe(false);
      }
    });

    it("returns false instead of throwing for malformed submitted answer input", () => {
      const malformedAnswers = [
        { type: "single", correctAnswers: null, submittedAnswers: ["A"] },
        { type: "single", correctAnswers: ["A"], submittedAnswers: null },
        { type: "single", correctAnswers: "A", submittedAnswers: ["A"] },
        { type: "single", correctAnswers: ["A"], submittedAnswers: "A" },
        { type: "single", correctAnswers: [1], submittedAnswers: ["A"] },
        { type: "single", correctAnswers: ["A"], submittedAnswers: [1] }
      ];

      for (const answer of malformedAnswers) {
        expect(() => isCorrectAnswer(answer as never)).not.toThrow();
        expect(isCorrectAnswer(answer as never)).toBe(false);
      }
    });

    it("requires option keys to be uppercase sequential letters by option order", () => {
      expect(
        isValidQuestionAnswerDefinition({
          type: "single",
          options: [
            { key: "A", text: "Option A" },
            { key: "C", text: "Option C" }
          ],
          correctAnswers: ["A"]
        })
      ).toBe(false);
      expect(
        isValidQuestionAnswerDefinition({
          type: "single",
          options: [
            { key: "B", text: "Option B" },
            { key: "A", text: "Option A" }
          ],
          correctAnswers: ["A"]
        })
      ).toBe(false);
      expect(
        isValidQuestionAnswerDefinition({
          type: "single",
          options: [
            { key: "A", text: "Option A" },
            { key: "A", text: "Option A again" }
          ],
          correctAnswers: ["A"]
        })
      ).toBe(false);
      expect(
        isValidQuestionAnswerDefinition({
          type: "single",
          options: [
            { key: "A", text: "Option A" },
            { key: "b", text: "Option B" }
          ],
          correctAnswers: ["A"]
        })
      ).toBe(false);
    });

    it("validates single choice definitions and answers by complete match", () => {
      expect(
        isValidQuestionAnswerDefinition({
          type: "single",
          options: fourOptions,
          correctAnswers: ["B"]
        })
      ).toBe(true);
      expect(
        isValidQuestionAnswerDefinition({
          type: "single",
          options: fourOptions,
          correctAnswers: ["A", "B"]
        })
      ).toBe(false);

      expect(isCorrectAnswer({ type: "single", correctAnswers: ["B"], submittedAnswers: ["B"] })).toBe(true);
      expect(isCorrectAnswer({ type: "single", correctAnswers: ["B"], submittedAnswers: ["A"] })).toBe(false);
      expect(isCorrectAnswer({ type: "single", correctAnswers: ["B"], submittedAnswers: ["B", "B"] })).toBe(false);
    });

    it("validates multiple choice definitions and answers order-insensitively without duplicates", () => {
      expect(
        isValidQuestionAnswerDefinition({
          type: "multiple",
          options: fourOptions,
          correctAnswers: ["A", "C"]
        })
      ).toBe(true);
      expect(
        isValidQuestionAnswerDefinition({
          type: "multiple",
          options: fourOptions,
          correctAnswers: ["A"]
        })
      ).toBe(false);

      expect(isCorrectAnswer({ type: "multiple", correctAnswers: ["A", "C"], submittedAnswers: ["C", "A"] })).toBe(
        true
      );
      expect(isCorrectAnswer({ type: "multiple", correctAnswers: ["A", "C"], submittedAnswers: ["A"] })).toBe(false);
      expect(isCorrectAnswer({ type: "multiple", correctAnswers: ["A", "C"], submittedAnswers: ["A", "A"] })).toBe(
        false
      );
    });

    it("validates judgment definitions and answers like single choice with exactly two options", () => {
      const judgmentOptions = [
        { key: "A", text: "correct" },
        { key: "B", text: "incorrect" }
      ];

      expect(
        isValidQuestionAnswerDefinition({
          type: "judgment",
          options: judgmentOptions,
          correctAnswers: ["A"]
        })
      ).toBe(true);
      expect(
        isValidQuestionAnswerDefinition({
          type: "judgment",
          options: fourOptions,
          correctAnswers: ["A"]
        })
      ).toBe(false);

      expect(isCorrectAnswer({ type: "judgment", correctAnswers: ["A"], submittedAnswers: ["A"] })).toBe(true);
      expect(isCorrectAnswer({ type: "judgment", correctAnswers: ["A"], submittedAnswers: ["B"] })).toBe(false);
    });
  });
});
