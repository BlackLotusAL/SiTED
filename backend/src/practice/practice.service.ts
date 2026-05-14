import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { and, eq, gte, sql } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { SERIALIZABLE_ISOLATION, type DbExecutor, withSerializableRetry } from "../db/query-helpers";
import { mistakes, practiceAttempts, questions, visitors, type MistakeRecord } from "../db/schema";
import { isCorrectAnswer, isValidQuestionAnswerDefinition } from "../domain/validation";
import type { RequestIdentity } from "../identity/identity.service";

export interface PracticeSubmitInput {
  questionId?: unknown;
  submittedAnswers?: unknown;
  selectedKeys?: unknown;
  durationSec?: unknown;
}

export interface MasteryStatus {
  code: "unmastered" | `consecutive_correct_${number}` | "mastered";
  label: string;
  color: "danger" | "warning" | "success";
}

type TransactionLike = DbExecutor;

type NormalizedPracticeSubmitInput = {
  questionId: string;
  submittedAnswers: string[];
  durationSec?: number;
};

type ScoreableQuestion = {
  type: unknown;
  options: unknown;
  correctAnswers: unknown;
};

type QuestionOption = {
  key: string;
  text: string;
};

const MAX_DURATION_SEC = 2147483647;

@Injectable()
export class PracticeService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async submit(input: unknown, identity: RequestIdentity) {
    const normalized = normalizeSubmitInput(input);
    return this.withSerializableRetry((tx) => this.submitInTransaction(tx, normalized, identity));
  }

  private async submitInTransaction(tx: TransactionLike, normalized: NormalizedPracticeSubmitInput, identity: RequestIdentity) {
    const [visitor] = await tx.select({ id: visitors.id }).from(visitors).where(eq(visitors.ip, identity.ip)).limit(1);
    if (visitor === undefined) {
      throw new InternalServerErrorException({ code: "VISITOR_NOT_FOUND", message: "Request visitor was not found" });
    }

    const [question] = await tx
      .select()
      .from(questions)
      .where(and(eq(questions.id, normalized.questionId), eq(questions.status, "published")))
      .limit(1);
    if (question === undefined) {
      throw new NotFoundException({ code: "QUESTION_NOT_FOUND", message: "Question was not found" });
    }

    const optionKeys = assertQuestionCanBeScored(question);
    assertSubmittedAnswersExist(normalized.submittedAnswers, optionKeys);

    const isCorrect = isCorrectAnswer({
      type: question.type,
      correctAnswers: question.correctAnswers,
      submittedAnswers: normalized.submittedAnswers
    });

    const [attempt] = await tx
      .insert(practiceAttempts)
      .values({
        visitorId: visitor.id,
        questionId: question.id,
        selectedKeys: normalized.submittedAnswers,
        isCorrect,
        mode: "practice",
        durationSec: normalized.durationSec
      })
      .returning();

    await tx
      .update(questions)
      .set({
        totalAttempts: sql`${questions.totalAttempts} + 1`,
        correctAttempts: sql`${questions.correctAttempts} + ${isCorrect ? 1 : 0}`,
        updatedAt: new Date()
      })
      .where(eq(questions.id, question.id));

    const mistake = isCorrect
      ? await this.recordCorrectAnswer(tx, visitor.id, question.id)
      : await this.recordWrongAnswer(tx, visitor.id, question.id);

    return {
      attemptId: requireAttempt(attempt).id,
      questionId: question.id,
      submittedAnswers: normalized.submittedAnswers,
      correctAnswers: question.correctAnswers,
      isCorrect,
      explanationMd: question.explanationMd,
      memo: question.memo,
      masteryStatus: mistake === null ? null : toMasteryStatus(mistake)
    };
  }

  private async withSerializableRetry<T>(operation: (tx: TransactionLike) => Promise<T>): Promise<T> {
    return withSerializableRetry(() =>
      this.db.client.transaction((tx) => operation(tx), {
        isolationLevel: SERIALIZABLE_ISOLATION
      })
    );
  }

  private async recordWrongAnswer(tx: TransactionLike, visitorId: string, questionId: string): Promise<MistakeRecord> {
    const now = new Date();
    const [mistake] = await tx
      .insert(mistakes)
      .values({
        visitorId,
        questionId,
        wrongCount: 1,
        consecutiveCorrectCount: 0,
        isMastered: false,
        lastWrongAt: now,
        masteredAt: null,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [mistakes.visitorId, mistakes.questionId],
        set: {
          wrongCount: sql`${mistakes.wrongCount} + 1`,
          consecutiveCorrectCount: 0,
          isMastered: false,
          lastWrongAt: now,
          masteredAt: null,
          updatedAt: now
        }
      })
      .returning();
    return requireMistake(mistake);
  }

  private async recordCorrectAnswer(tx: TransactionLike, visitorId: string, questionId: string): Promise<MistakeRecord | null> {
    const incremented = await tx
      .update(mistakes)
      .set({
        consecutiveCorrectCount: sql`${mistakes.consecutiveCorrectCount} + 1`,
        updatedAt: new Date()
      })
      .where(and(eq(mistakes.visitorId, visitorId), eq(mistakes.questionId, questionId), eq(mistakes.isMastered, false)))
      .returning({ id: mistakes.id });

    if (incremented.length > 0) {
      await tx
        .update(mistakes)
        .set({ isMastered: true, masteredAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(mistakes.visitorId, visitorId),
            eq(mistakes.questionId, questionId),
            eq(mistakes.isMastered, false),
            gte(mistakes.consecutiveCorrectCount, 3)
          )
        );
    }

    const [mistake] = await tx
      .select()
      .from(mistakes)
      .where(and(eq(mistakes.visitorId, visitorId), eq(mistakes.questionId, questionId)))
      .limit(1);
    return mistake ?? null;
  }
}

function requireMistake(mistake: MistakeRecord | undefined): MistakeRecord {
  if (mistake === undefined) {
    throw new InternalServerErrorException({ code: "MISTAKE_WRITE_FAILED", message: "Mistake write did not return a row" });
  }
  return mistake;
}

function requireAttempt(attempt: { id: string } | undefined): { id: string } {
  if (attempt === undefined) {
    throw new InternalServerErrorException({ code: "PRACTICE_ATTEMPT_WRITE_FAILED", message: "Practice attempt write did not return a row" });
  }
  return attempt;
}

function normalizeSubmitInput(input: unknown): NormalizedPracticeSubmitInput {
  if (!isRecord(input)) {
    throw invalidSubmission("body must be an object");
  }
  if (typeof input.questionId !== "string" || input.questionId.trim().length === 0) {
    throw invalidSubmission("questionId is required");
  }

  const questionId = input.questionId.trim();
  if (!isUuid(questionId)) {
    throw invalidSubmission("questionId must be a UUID");
  }

  const submittedAnswers = input.submittedAnswers ?? input.selectedKeys;
  if (!Array.isArray(submittedAnswers) || !submittedAnswers.every((answer) => typeof answer === "string")) {
    throw invalidSubmission("submittedAnswers must be an array of strings");
  }

  const normalizedAnswers = submittedAnswers.map((answer) => answer.trim());
  if (normalizedAnswers.length === 0 || normalizedAnswers.some((answer) => answer.length === 0)) {
    throw invalidSubmission("submittedAnswers cannot be empty");
  }
  if (!hasUniqueValues(normalizedAnswers)) {
    throw invalidSubmission("submittedAnswers cannot contain duplicates");
  }
  if (!normalizedAnswers.every(isOptionKey)) {
    throw invalidSubmission("submittedAnswers contain invalid option keys");
  }

  return {
    questionId,
    submittedAnswers: normalizedAnswers,
    durationSec: normalizeDurationSec(input.durationSec)
  };
}

function normalizeDurationSec(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "number") {
    return assertDurationSec(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return assertDurationSec(Number(value));
  }

  throw invalidSubmission("durationSec must be a non-negative integer");
}

function assertDurationSec(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DURATION_SEC) {
    throw invalidSubmission("durationSec must be a non-negative integer within database range");
  }
  return value;
}

function assertQuestionCanBeScored(question: ScoreableQuestion): Set<string> {
  if (
    !isValidQuestionAnswerDefinition({
      type: question.type,
      options: question.options,
      correctAnswers: question.correctAnswers
    })
  ) {
    throw new InternalServerErrorException({
      code: "QUESTION_DEFINITION_INVALID",
      message: "Question answer definition is invalid"
    });
  }

  return new Set((question.options as QuestionOption[]).map((option) => option.key));
}

function assertSubmittedAnswersExist(submittedAnswers: string[], optionKeys: Set<string>): void {
  if (!submittedAnswers.every((answer) => optionKeys.has(answer))) {
    throw invalidSubmission("submittedAnswers contain unknown option keys");
  }
}

function invalidSubmission(message: string): BadRequestException {
  return new BadRequestException({ code: "INVALID_PRACTICE_SUBMISSION", message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isOptionKey(value: string): boolean {
  return /^[A-Z]$/.test(value);
}

function hasUniqueValues(values: string[]): boolean {
  return new Set(values).size === values.length;
}

export function toMasteryStatus(mistake: Pick<MistakeRecord, "isMastered" | "consecutiveCorrectCount">): MasteryStatus {
  if (mistake.isMastered) {
    return { code: "mastered", label: "\u5df2\u638c\u63e1", color: "success" };
  }
  if (mistake.consecutiveCorrectCount > 0) {
    return {
      code: `consecutive_correct_${mistake.consecutiveCorrectCount}`,
      label: `\u8fde\u7eed\u7b54\u5bf9 ${mistake.consecutiveCorrectCount} \u6b21`,
      color: "warning"
    };
  }
  return { code: "unmastered", label: "\u672a\u638c\u63e1", color: "danger" };
}
