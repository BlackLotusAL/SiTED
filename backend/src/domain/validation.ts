import {
  LANGUAGES,
  LEVELS,
  P0_SOURCE_LANGUAGES,
  QUESTION_STATUSES,
  QUESTION_TYPES,
  SUBJECTS,
  type Language,
  type Level,
  type QuestionStatus,
  type QuestionType,
  type Subject
} from "./constants";

export interface SourceCombinationInput {
  subject: unknown;
  language?: unknown;
  level: unknown;
}

export interface QuestionOptionInput {
  key: string;
  text: string;
}

export interface QuestionAnswerDefinitionInput {
  type: unknown;
  options: unknown;
  correctAnswers: unknown;
}

export interface AnswerComparisonInput {
  type: unknown;
  correctAnswers: unknown;
  submittedAnswers: unknown;
}

function includes<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

export function isValidSubject(value: unknown): value is Subject {
  return includes(SUBJECTS, value);
}

export function isValidLanguage(value: unknown): value is Language {
  return includes(LANGUAGES, value);
}

export function isValidLevel(value: unknown): value is Level {
  return includes(LEVELS, value);
}

export function isValidQuestionType(value: unknown): value is QuestionType {
  return includes(QUESTION_TYPES, value);
}

export function isValidQuestionStatus(value: unknown): value is QuestionStatus {
  return includes(QUESTION_STATUSES, value);
}

export function isValidSourceCombination(input: SourceCombinationInput): input is {
  subject: Subject;
  language: Language | null;
  level: Level;
} {
  if (!isValidSubject(input.subject) || !isValidLevel(input.level)) {
    return false;
  }

  if (input.subject === "refactoring") {
    return (input.language === null || input.language === undefined) && input.level === "professional";
  }

  if (!includes(P0_SOURCE_LANGUAGES, input.language)) {
    return false;
  }

  if (input.subject === "programming") {
    return true;
  }

  return input.subject === "security_privacy" && input.level !== "entry";
}

export function isValidQuestionAnswerDefinition(input: QuestionAnswerDefinitionInput): boolean {
  if (!isValidQuestionType(input.type) || !hasUniqueOptionKeys(input.options)) {
    return false;
  }

  if (!isQuestionOptionArray(input.options) || !isStringArray(input.correctAnswers)) {
    return false;
  }

  const optionCount = input.options.length;
  const optionKeys = new Set(input.options.map((option) => option.key));
  if (!hasUniqueAnswers(input.correctAnswers) || !answersExistInOptions(input.correctAnswers, optionKeys)) {
    return false;
  }

  if (input.type === "single") {
    return optionCount >= 2 && optionCount <= 10 && input.correctAnswers.length === 1;
  }

  if (input.type === "multiple") {
    return optionCount >= 3 && optionCount <= 10 && input.correctAnswers.length >= 2;
  }

  return optionCount === 2 && input.correctAnswers.length === 1;
}

export function isCorrectAnswer(input: AnswerComparisonInput): boolean {
  if (!isValidQuestionType(input.type)) {
    return false;
  }

  const expectedCount = input.type === "multiple" ? { min: 2, max: Number.POSITIVE_INFINITY } : { min: 1, max: 1 };
  if (!isStringArray(input.correctAnswers) || !isStringArray(input.submittedAnswers)) {
    return false;
  }
  if (!hasUniqueAnswers(input.correctAnswers) || !hasUniqueAnswers(input.submittedAnswers)) {
    return false;
  }
  if (input.correctAnswers.length < expectedCount.min || input.correctAnswers.length > expectedCount.max) {
    return false;
  }
  if (input.submittedAnswers.length < expectedCount.min || input.submittedAnswers.length > expectedCount.max) {
    return false;
  }
  if (input.correctAnswers.length !== input.submittedAnswers.length) {
    return false;
  }

  const submitted = new Set(input.submittedAnswers);
  return input.correctAnswers.every((answer) => submitted.has(answer));
}

function isQuestionOptionArray(options: unknown): options is QuestionOptionInput[] {
  return (
    Array.isArray(options) &&
    options.every(
      (option): option is QuestionOptionInput =>
        typeof option === "object" &&
        option !== null &&
        typeof (option as Partial<QuestionOptionInput>).key === "string" &&
        typeof (option as Partial<QuestionOptionInput>).text === "string"
    )
  );
}

function hasUniqueOptionKeys(options: unknown): boolean {
  if (!isQuestionOptionArray(options)) {
    return false;
  }

  return options.every((option, index) => option.key === expectedOptionKey(index));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function hasUniqueAnswers(answers: string[]): boolean {
  return answers.every((answer) => answer.trim().length > 0) && new Set(answers).size === answers.length;
}

function answersExistInOptions(answers: string[], optionKeys: Set<string>): boolean {
  return answers.every((answer) => optionKeys.has(answer));
}

function expectedOptionKey(index: number): string {
  return String.fromCharCode("A".charCodeAt(0) + index);
}
