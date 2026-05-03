import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from "@nestjs/common";
import { Prisma, type ExamAttempt, type Question } from "@prisma/client";
import { QUESTION_TYPES, type Language, type Level, type QuestionType, type Subject } from "../domain/constants";
import { isCorrectAnswer, isValidSourceCombination } from "../domain/validation";
import type { RequestIdentity } from "../identity/identity.service";
import { PrismaService } from "../prisma/prisma.service";
import { ExamConfigService, type ExamSubjectConfig } from "./exam-config.service";

export interface ExamCreateInput {
  subject?: unknown;
  language?: unknown;
  level?: unknown;
  abandonExisting?: unknown;
}

export interface ExamAnswerSaveInput {
  answers?: unknown;
}

export interface ExamSubmitInput {
  answers?: unknown;
}

type NowProvider = () => Date;
type TransactionLike = Prisma.TransactionClient;
type AnswerMap = Record<string, string[]>;
type SourceInput = {
  subject: Subject;
  language: Language | null;
  level: Level;
};
type NormalizedCreateInput = SourceInput & {
  abandonExisting: boolean;
};
type QuestionOptionSnapshot = {
  key: string;
  text: string;
};
type QuestionSnapshot = {
  id: string;
  sourceCode: string | null;
  subject: Subject;
  language: Language | null;
  level: Level;
  type: QuestionType;
  stemMd: string;
  options: QuestionOptionSnapshot[];
  correctAnswers: string[];
  explanationMd: string | null;
  memo: string | null;
  tags: string[];
};
type ExamAttemptRecord = Omit<ExamAttempt, "configSnapshot" | "questionSnapshot" | "answers"> & {
  configSnapshot: Prisma.JsonValue;
  questionSnapshot: Prisma.JsonValue;
  answers: Prisma.JsonValue;
};
type ExamListRecord = Pick<
  ExamAttempt,
  "id" | "subject" | "language" | "level" | "status" | "scorePercent" | "isPassed" | "startedAt" | "deadlineAt" | "submittedAt"
>;

const EXAM_QUESTION_TYPES: QuestionType[] = ["single", "multiple", "judgment"];
export const EXAM_NOW_PROVIDER = Symbol("EXAM_NOW_PROVIDER");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPTION_KEY_RE = /^[A-Z]$/;

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ExamConfigService,
    @Inject(EXAM_NOW_PROVIDER) private readonly now: NowProvider
  ) {}

  async list(identity: RequestIdentity) {
    return this.withSerializableRetry(async (tx) => {
      const visitor = await this.requireVisitor(tx, identity);
      const exams = await tx.examAttempt.findMany({
        where: { visitorId: visitor.id },
        select: {
          id: true,
          subject: true,
          language: true,
          level: true,
          status: true,
          scorePercent: true,
          isPassed: true,
          startedAt: true,
          deadlineAt: true,
          submittedAt: true
        },
        orderBy: { startedAt: "desc" },
        take: 100
      });

      return { items: exams.map(toExamListItem) };
    });
  }

  async create(input: unknown, identity: RequestIdentity) {
    const normalized = normalizeCreateInput(input);
    try {
      return await this.withSerializableRetry((tx) => this.createInTransaction(tx, normalized, identity));
    } catch (error) {
      if (!isPrismaUniqueConflict(error)) {
        throw error;
      }

      return this.withSerializableRetry(async (tx) => {
        const visitor = await this.requireVisitor(tx, identity);
        const active = await this.findActiveExam(tx, visitor.id);
        if (active === null) {
          throw error;
        }

        return this.toExamResponse(await this.submitExpiredExamIfNeeded(tx, visitor.id, active));
      });
    }
  }

  async get(id: string, identity: RequestIdentity) {
    return this.withSerializableRetry(async (tx) => {
      const visitor = await this.requireVisitor(tx, identity);
      const exam = await this.findVisitorExam(tx, id, visitor.id);
      return this.toExamResponse(await this.submitExpiredExamIfNeeded(tx, visitor.id, exam));
    });
  }

  async saveAnswers(id: string, input: unknown, identity: RequestIdentity) {
    return this.withSerializableRetry(async (tx) => {
      const visitor = await this.requireVisitor(tx, identity);
      const current = await this.findVisitorExam(tx, id, visitor.id);
      const exam = await this.submitExpiredExamIfNeeded(tx, visitor.id, current);
      if (exam.status !== "in_progress") {
        if (current.status === "in_progress" && exam.status === "submitted") {
          return this.toExamResponse(exam);
        }
        throw invalidExamRequest("Only active exams can save answers");
      }

      const questions = parseQuestionSnapshot(exam.questionSnapshot);
      const answers = normalizeAnswersInput(input, questions, parseAnswers(exam.answers));
      const updated = await tx.examAttempt.update({
        where: { id },
        data: { answers }
      });

      return this.toExamResponse(updated as ExamAttemptRecord);
    });
  }

  async submit(id: string, input: unknown, identity: RequestIdentity) {
    return this.withSerializableRetry(async (tx) => {
      const visitor = await this.requireVisitor(tx, identity);
      const exam = await this.findVisitorExam(tx, id, visitor.id);

      if (exam.status === "submitted") {
        return this.toExamResponse(exam);
      }
      if (exam.status !== "in_progress") {
        throw invalidExamRequest("Only active exams can be submitted");
      }
      if (this.isExpired(exam)) {
        return this.toExamResponse(await this.submitExam(tx, visitor.id, exam, parseAnswers(exam.answers), this.now()));
      }

      const questions = parseQuestionSnapshot(exam.questionSnapshot);
      const answers = normalizeAnswersInput(input, questions, parseAnswers(exam.answers), true);
      return this.toExamResponse(await this.submitExam(tx, visitor.id, exam, answers, this.now()));
    });
  }

  async abandon(id: string, identity: RequestIdentity) {
    return this.withSerializableRetry(async (tx) => {
      const visitor = await this.requireVisitor(tx, identity);
      const exam = await this.submitExpiredExamIfNeeded(tx, visitor.id, await this.findVisitorExam(tx, id, visitor.id));
      if (exam.status !== "in_progress") {
        return this.toExamResponse(exam);
      }

      const updated = await tx.examAttempt.update({
        where: { id },
        data: { status: "abandoned" }
      });

      return this.toExamResponse(updated as ExamAttemptRecord);
    });
  }

  private async createInTransaction(tx: TransactionLike, normalized: NormalizedCreateInput, identity: RequestIdentity) {
    const visitor = await this.requireVisitor(tx, identity);
    const active = await this.findActiveExam(tx, visitor.id);

    if (active !== null) {
      const activeExam = await this.submitExpiredExamIfNeeded(tx, visitor.id, active as ExamAttemptRecord);
      if (activeExam.status === "in_progress" && !normalized.abandonExisting) {
        return this.toExamResponse(activeExam);
      }
      if (activeExam.status === "in_progress") {
        await tx.examAttempt.update({ where: { id: activeExam.id }, data: { status: "abandoned" } });
      }
    }

    const config = this.configService.getSubjectConfig(normalized.subject);
    const selectedQuestions = await this.selectQuestions(tx, normalized, config, visitor.id);
    const now = this.now();
    const deadlineAt = new Date(now.getTime() + config.durationMinutes * 60 * 1000);
    const questionSnapshot = selectedQuestions.map(toQuestionSnapshot);

    const created = await tx.examAttempt.create({
      data: {
        visitorId: visitor.id,
        subject: normalized.subject,
        language: normalized.language,
        level: normalized.level,
        configSnapshot: configToJson(config),
        questionSnapshot: questionSnapshot as unknown as Prisma.InputJsonValue,
        answers: {},
        status: "in_progress",
        startedAt: now,
        deadlineAt
      }
    });

    return this.toExamResponse(created as ExamAttemptRecord);
  }

  private async selectQuestions(tx: TransactionLike, source: SourceInput, config: ExamSubjectConfig, visitorId: string) {
    const pools = new Map<QuestionType, Question[]>();
    const missing: Array<{ type: QuestionType; required: number; available: number; missing: number }> = [];

    for (const type of EXAM_QUESTION_TYPES) {
      const required = config.questionCounts[type];
      const questions = await tx.question.findMany({
        where: {
          status: "published",
          subject: source.subject,
          language: source.language,
          level: source.level,
          type
        }
      });
      pools.set(type, questions);
      if (questions.length < required) {
        missing.push({ type, required, available: questions.length, missing: required - questions.length });
      }
    }

    if (missing.length > 0) {
      throw new BadRequestException({
        code: "EXAM_QUESTIONS_INSUFFICIENT",
        message: "Not enough published questions to create exam",
        missing
      });
    }

    const seed = `${visitorId}|${source.subject}|${source.language ?? ""}|${source.level}|${this.now().toISOString()}`;
    return EXAM_QUESTION_TYPES.flatMap((type) =>
      stableShuffle(pools.get(type) ?? [], `${seed}|${type}`).slice(0, config.questionCounts[type])
    );
  }

  private async requireVisitor(tx: TransactionLike, identity: RequestIdentity): Promise<{ id: string }> {
    const visitor = await tx.visitor.findUnique({ where: { ip: identity.ip }, select: { id: true } });
    if (visitor === null) {
      throw new InternalServerErrorException({ code: "VISITOR_NOT_FOUND", message: "Request visitor was not found" });
    }
    return visitor;
  }

  private async findVisitorExam(tx: TransactionLike, id: string, visitorId: string): Promise<ExamAttemptRecord> {
    const exam = await tx.examAttempt.findUnique({ where: { id } });
    if (exam === null || exam.visitorId !== visitorId) {
      throw new NotFoundException({ code: "EXAM_NOT_FOUND", message: "Exam was not found" });
    }
    return exam as ExamAttemptRecord;
  }

  private async findActiveExam(tx: TransactionLike, visitorId: string): Promise<ExamAttemptRecord | null> {
    const active = await tx.examAttempt.findFirst({
      where: {
        visitorId,
        status: "in_progress"
      },
      orderBy: { startedAt: "desc" }
    });

    return active === null ? null : (active as ExamAttemptRecord);
  }

  private async submitExpiredExamIfNeeded(
    tx: TransactionLike,
    visitorId: string,
    exam: ExamAttemptRecord
  ): Promise<ExamAttemptRecord> {
    if (exam.status !== "in_progress" || !this.isExpired(exam)) {
      return exam;
    }

    return this.submitExam(tx, visitorId, exam, parseAnswers(exam.answers), this.now());
  }

  private isExpired(exam: Pick<ExamAttemptRecord, "deadlineAt">): boolean {
    return this.now().getTime() >= exam.deadlineAt.getTime();
  }

  private async submitExam(
    tx: TransactionLike,
    visitorId: string,
    exam: ExamAttemptRecord,
    answers: AnswerMap,
    submittedAt: Date
  ): Promise<ExamAttemptRecord> {
    const questions = parseQuestionSnapshot(exam.questionSnapshot);
    const results = scoreQuestions(questions, answers);
    const scorePercent = percentage(results.filter((result) => result.isCorrect).length, results.length);
    const config = parseConfigSnapshot(exam.configSnapshot);

    for (const result of results) {
      if (!result.isCorrect) {
        await tx.mistake.upsert({
          where: { visitorId_questionId: { visitorId, questionId: result.question.id } },
          create: {
            visitorId,
            questionId: result.question.id,
            wrongCount: 1,
            consecutiveCorrectCount: 0,
            isMastered: false,
            lastWrongAt: submittedAt,
            masteredAt: null
          },
          update: {
            wrongCount: { increment: 1 },
            consecutiveCorrectCount: 0,
            isMastered: false,
            lastWrongAt: submittedAt,
            masteredAt: null
          }
        });
      }
    }

    const updated = await tx.examAttempt.update({
      where: { id: exam.id },
      data: {
        answers,
        status: "submitted",
        scorePercent: new Prisma.Decimal(scorePercent.toFixed(2)),
        isPassed: scorePercent >= config.passScorePercent,
        submittedAt
      }
    });

    return updated as ExamAttemptRecord;
  }

  private async withSerializableRetry<T>(operation: (tx: TransactionLike) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction((tx) => operation(tx), {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        });
      } catch (error) {
        if (!isSerializableConflict(error)) {
          throw error;
        }
        lastError = error;
      }
    }

    throw lastError;
  }

  private toExamResponse(exam: ExamAttemptRecord) {
    const questions = parseQuestionSnapshot(exam.questionSnapshot);
    const answers = parseAnswers(exam.answers);
    const config = parseConfigSnapshot(exam.configSnapshot);
    const base = {
      id: exam.id,
      subject: exam.subject,
      language: exam.language,
      level: exam.level,
      status: exam.status,
      config,
      answers,
      flaggedQuestionIds: exam.flaggedQuestionIds,
      startedAt: exam.startedAt,
      deadlineAt: exam.deadlineAt,
      submittedAt: exam.submittedAt,
      scorePercent: decimalToNumber(exam.scorePercent),
      isPassed: exam.isPassed
    };

    if (exam.status === "submitted") {
      return {
        ...base,
        questions: scoreQuestions(questions, answers).map((result) => ({
          ...result.question,
          submittedAnswers: result.submittedAnswers,
          isCorrect: result.isCorrect
        }))
      };
    }

    return {
      ...base,
      questions: questions.map(toActiveQuestion)
    };
  }
}

function normalizeCreateInput(input: unknown): NormalizedCreateInput {
  if (!isRecord(input)) {
    throw invalidExamRequest("body must be an object");
  }

  const language = input.language === undefined || input.language === null || input.language === "" ? null : input.language;
  const source = { subject: input.subject, language, level: input.level };
  if (!isValidSourceCombination(source)) {
    throw invalidExamRequest("subject, language, and level do not form a valid exam source");
  }

  return {
    subject: source.subject,
    language: source.language,
    level: source.level,
    abandonExisting: input.abandonExisting === true
  };
}

function normalizeAnswersInput(
  input: unknown,
  questions: QuestionSnapshot[],
  existingAnswers: AnswerMap,
  allowEmptyBody = false
): AnswerMap {
  if (!isRecord(input)) {
    throw invalidExamRequest("body must be an object");
  }
  if (input.answers === undefined && allowEmptyBody) {
    return existingAnswers;
  }
  if (!isRecord(input.answers)) {
    throw invalidExamRequest("answers must be an object");
  }

  const normalized: AnswerMap = { ...existingAnswers };
  const questionMap = new Map(questions.map((question) => [question.id, question]));

  for (const [questionId, value] of Object.entries(input.answers)) {
    const question = questionMap.get(questionId);
    if (question === undefined || !Array.isArray(value) || !value.every((answer) => typeof answer === "string")) {
      throw invalidExamRequest("answers contain invalid question ids or answer arrays");
    }

    const answers = value.map((answer) => answer.trim());
    if (!hasUniqueValues(answers) || !answers.every((answer) => OPTION_KEY_RE.test(answer))) {
      throw invalidExamRequest("answers contain invalid option keys");
    }
    if ((question.type === "single" || question.type === "judgment") && answers.length > 1) {
      throw invalidExamRequest("single and judgment questions accept at most one answer");
    }
    if (!answers.every((answer) => question.options.some((option) => option.key === answer))) {
      throw invalidExamRequest("answers contain unknown option keys");
    }

    normalized[questionId] = answers;
  }

  return normalized;
}

function parseAnswers(value: Prisma.JsonValue): AnswerMap {
  if (!isRecord(value)) {
    return {};
  }

  const answers: AnswerMap = {};
  for (const [questionId, rawAnswers] of Object.entries(value)) {
    if (UUID_RE.test(questionId) && Array.isArray(rawAnswers) && rawAnswers.every((answer) => typeof answer === "string")) {
      answers[questionId] = rawAnswers;
    }
  }
  return answers;
}

function parseConfigSnapshot(value: Prisma.JsonValue): ExamSubjectConfig {
  if (
    !isRecord(value) ||
    typeof value.durationMinutes !== "number" ||
    typeof value.passScorePercent !== "number" ||
    !isRecord(value.questionCounts)
  ) {
    throw new InternalServerErrorException({ code: "EXAM_SNAPSHOT_INVALID", message: "Exam config snapshot is invalid" });
  }

  return {
    durationMinutes: value.durationMinutes,
    passScorePercent: value.passScorePercent,
    questionCounts: {
      single: numberFromRecord(value.questionCounts, "single"),
      multiple: numberFromRecord(value.questionCounts, "multiple"),
      judgment: numberFromRecord(value.questionCounts, "judgment")
    }
  };
}

function parseQuestionSnapshot(value: Prisma.JsonValue): QuestionSnapshot[] {
  if (!Array.isArray(value)) {
    throw new InternalServerErrorException({ code: "EXAM_SNAPSHOT_INVALID", message: "Exam question snapshot is invalid" });
  }

  return value.map((item) => {
    if (!isQuestionSnapshot(item)) {
      throw new InternalServerErrorException({ code: "EXAM_SNAPSHOT_INVALID", message: "Exam question snapshot is invalid" });
    }
    return item;
  });
}

function isQuestionSnapshot(value: unknown): value is QuestionSnapshot {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.subject === "string" &&
    (typeof value.language === "string" || value.language === null) &&
    typeof value.level === "string" &&
    isQuestionType(value.type) &&
    typeof value.stemMd === "string" &&
    Array.isArray(value.options) &&
    value.options.every(isQuestionOptionSnapshot) &&
    Array.isArray(value.correctAnswers) &&
    value.correctAnswers.every((answer) => typeof answer === "string") &&
    (typeof value.explanationMd === "string" || value.explanationMd === null) &&
    (typeof value.memo === "string" || value.memo === null) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string")
  );
}

function isQuestionOptionSnapshot(value: unknown): value is QuestionOptionSnapshot {
  return isRecord(value) && typeof value.key === "string" && typeof value.text === "string";
}

function scoreQuestions(questions: QuestionSnapshot[], answers: AnswerMap) {
  return questions.map((question) => {
    const submittedAnswers = answers[question.id] ?? [];
    return {
      question,
      submittedAnswers,
      isCorrect: isCorrectAnswer({
        type: question.type,
        correctAnswers: question.correctAnswers,
        submittedAnswers
      })
    };
  });
}

function toQuestionSnapshot(question: Question): QuestionSnapshot {
  return {
    id: question.id,
    sourceCode: question.sourceCode,
    subject: question.subject,
    language: question.language,
    level: question.level,
    type: question.type,
    stemMd: question.stemMd,
    options: publicOptions(question.options),
    correctAnswers: question.correctAnswers,
    explanationMd: question.explanationMd,
    memo: question.memo,
    tags: question.tags
  };
}

function toActiveQuestion(question: QuestionSnapshot) {
  return {
    id: question.id,
    sourceCode: question.sourceCode,
    subject: question.subject,
    language: question.language,
    level: question.level,
    type: question.type,
    stemMd: question.stemMd,
    options: question.options,
    tags: question.tags
  };
}

function publicOptions(options: Prisma.JsonValue): QuestionOptionSnapshot[] {
  if (!Array.isArray(options)) {
    return [];
  }
  return options
    .map((option) => {
      if (!isQuestionOptionSnapshot(option)) {
        return null;
      }
      return { key: option.key, text: option.text };
    })
    .filter((option): option is QuestionOptionSnapshot => option !== null);
}

function configToJson(config: ExamSubjectConfig): Prisma.InputJsonValue {
  return {
    durationMinutes: config.durationMinutes,
    passScorePercent: config.passScorePercent,
    questionCounts: {
      single: config.questionCounts.single,
      multiple: config.questionCounts.multiple,
      judgment: config.questionCounts.judgment
    }
  };
}

function stableShuffle<T extends { id: string }>(items: T[], seed: string): T[] {
  return [...items].sort((left, right) => hashString(`${seed}|${left.id}`) - hashString(`${seed}|${right.id}`));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function percentage(correct: number, total: number): number {
  return total === 0 ? 0 : Math.round((correct / total) * 10000) / 100;
}

function decimalToNumber(value: ExamAttempt["scorePercent"]): number | null {
  return value === null ? null : Number(value);
}

function toExamListItem(exam: ExamListRecord) {
  return {
    id: exam.id,
    subject: exam.subject,
    language: exam.language,
    level: exam.level,
    status: exam.status,
    scorePercent: decimalToNumber(exam.scorePercent),
    isPassed: exam.isPassed,
    startedAt: exam.startedAt,
    deadlineAt: exam.deadlineAt,
    submittedAt: exam.submittedAt
  };
}

function numberFromRecord(record: Record<string, unknown>, key: QuestionType): number {
  const value = record[key];
  if (typeof value !== "number") {
    throw new InternalServerErrorException({ code: "EXAM_SNAPSHOT_INVALID", message: "Exam config snapshot is invalid" });
  }
  return value;
}

function isQuestionType(value: unknown): value is QuestionType {
  return typeof value === "string" && QUESTION_TYPES.includes(value as QuestionType);
}

function invalidExamRequest(message: string): BadRequestException {
  return new BadRequestException({ code: "INVALID_EXAM_REQUEST", message });
}

function isSerializableConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2034";
}

function isPrismaUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUniqueValues(values: string[]): boolean {
  return new Set(values).size === values.length;
}
