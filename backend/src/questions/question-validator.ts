import { BadRequestException } from "@nestjs/common";
import {
  isValidQuestionAnswerDefinition,
  isValidQuestionStatus,
  isValidSourceCombination
} from "../domain/validation";
import type { Language, Level, QuestionStatus, QuestionType, Subject } from "../domain/constants";

export interface QuestionOptionInput {
  key: string;
  text: string;
  isCorrect?: boolean;
}

export interface QuestionUpsertInput {
  sourceCode?: string | null;
  subject: Subject;
  language?: Language | null;
  level: Level;
  type: QuestionType;
  tags?: string[];
  stemMd: string;
  options: QuestionOptionInput[];
  correctAnswers?: string[];
  explanationMd?: string | null;
  memo?: string | null;
  status?: QuestionStatus;
}

export interface NormalizedQuestionInput {
  sourceCode?: string;
  subject: Subject;
  language: Language | null;
  level: Level;
  type: QuestionType;
  tags: string[];
  stemMd: string;
  options: QuestionOptionInput[];
  correctAnswers: string[];
  explanationMd?: string;
  memo?: string;
  status: QuestionStatus;
}

export interface QuestionValidationError {
  field: string;
  message: string;
}

const STEM_MAX = 5000;
const EXPLANATION_MAX = 10000;
const MEMO_MAX = 200;
const OPTION_TEXT_MAX = 500;
const TAG_MAX = 30;
const TAG_COUNT_MAX = 10;
const SOURCE_CODE_MAX = 120;

export function normalizeQuestionInput(input: unknown, defaultStatus: QuestionStatus = "draft"): NormalizedQuestionInput {
  const errors = validateQuestionInput(input, defaultStatus);
  if (errors.length > 0) {
    throw new BadRequestException({
      code: "QUESTION_VALIDATION_FAILED",
      message: "Question validation failed",
      errors
    });
  }

  return buildNormalizedQuestion(input as QuestionUpsertInput, defaultStatus);
}

export function validateQuestionInput(input: unknown, defaultStatus: QuestionStatus = "draft"): QuestionValidationError[] {
  const errors: QuestionValidationError[] = [];
  if (typeof input !== "object" || input === null) {
    return [{ field: "question", message: "Question must be an object" }];
  }

  const question = input as Partial<QuestionUpsertInput>;
  const normalized = buildNormalizedQuestion(question, defaultStatus);

  if (!isValidSourceCombination({ subject: question.subject, language: question.language, level: question.level })) {
    errors.push({ field: "source", message: "Invalid subject, language, and level combination" });
  }

  if (!isValidQuestionStatus(normalized.status)) {
    errors.push({ field: "status", message: "Invalid question status" });
  }

  if (normalized.sourceCode !== undefined && normalized.sourceCode.length > SOURCE_CODE_MAX) {
    errors.push({ field: "sourceCode", message: `sourceCode must be at most ${SOURCE_CODE_MAX} characters` });
  }

  if (normalized.stemMd.length === 0 || normalized.stemMd.length > STEM_MAX) {
    errors.push({ field: "stemMd", message: `stemMd must be 1-${STEM_MAX} characters` });
  }

  if ((normalized.explanationMd?.length ?? 0) > EXPLANATION_MAX) {
    errors.push({ field: "explanationMd", message: `explanationMd must be at most ${EXPLANATION_MAX} characters` });
  }

  if ((normalized.memo?.length ?? 0) > MEMO_MAX) {
    errors.push({ field: "memo", message: `memo must be at most ${MEMO_MAX} characters` });
  }

  if (!isValidTagsInput(question.tags)) {
    errors.push({ field: "tags", message: "tags must be an array of strings" });
  }

  if (normalized.tags.length > TAG_COUNT_MAX || normalized.tags.some((tag) => tag.length > TAG_MAX)) {
    errors.push({ field: "tags", message: `tags must be at most ${TAG_COUNT_MAX} items and ${TAG_MAX} characters each` });
  }

  if (!Array.isArray(question.options)) {
    errors.push({ field: "options", message: "options must be an array" });
  } else if (!question.options.every(isOptionObject)) {
    errors.push({ field: "options", message: "each option must be an object with key, text, and isCorrect fields" });
  }

  if (normalized.options.some((option) => option.text.length === 0 || option.text.length > OPTION_TEXT_MAX)) {
    errors.push({ field: "options", message: `option text must be 1-${OPTION_TEXT_MAX} characters` });
  }

  if (
    !isValidQuestionAnswerDefinition({
      type: normalized.type,
      options: normalized.options,
      correctAnswers: normalized.correctAnswers
    })
  ) {
    errors.push({ field: "options", message: "Options and correct answers do not match question type rules" });
  }

  return errors;
}

function buildNormalizedQuestion(
  input: Partial<QuestionUpsertInput>,
  defaultStatus: QuestionStatus
): NormalizedQuestionInput {
  const options = Array.isArray(input.options)
    ? input.options.map((option) => {
        if (!isOptionObject(option)) {
          return { key: "", text: "", isCorrect: false };
        }
        return {
          key: typeof option.key === "string" ? option.key.trim() : "",
          text: typeof option.text === "string" ? option.text.trim() : "",
          isCorrect: option.isCorrect === true
        };
      })
    : [];
  const derivedAnswers = options.filter((option) => option.isCorrect).map((option) => option.key);
  const correctAnswers = Array.isArray(input.correctAnswers)
    ? input.correctAnswers.filter((answer): answer is string => typeof answer === "string").map((answer) => answer.trim())
    : derivedAnswers;

  return {
    sourceCode: optionalTrim(input.sourceCode),
    subject: input.subject as Subject,
    language: input.language === undefined ? null : (input.language as Language | null),
    level: input.level as Level,
    type: input.type as QuestionType,
    tags: normalizeTags(input.tags),
    stemMd: requiredTrim(input.stemMd),
    options,
    correctAnswers,
    explanationMd: optionalTrim(input.explanationMd),
    memo: optionalTrim(input.memo),
    status: (input.status ?? defaultStatus) as QuestionStatus
  };
}

function isValidTagsInput(tags: unknown): boolean {
  return tags === undefined || (Array.isArray(tags) && tags.every((tag) => typeof tag === "string"));
}

function isOptionObject(option: unknown): option is Partial<QuestionOptionInput> {
  return typeof option === "object" && option !== null && !Array.isArray(option);
}

export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== "string") {
      continue;
    }
    const trimmed = tag.trim();
    if (trimmed.length > 0 && !seen.has(trimmed)) {
      seen.add(trimmed);
      normalized.push(trimmed);
    }
  }
  return normalized;
}

function requiredTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalTrim(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
