import { arrayContains, eq, inArray, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  SEED_EXAM_FLAG,
  SEED_PRACTICE_MODE,
  SEED_SOURCE_PREFIX,
  SEED_TAG,
  buildSeedAuditLogs,
  buildSeedQuestions,
  examConfigSnapshot,
  examReadySource,
  seedIps,
  seedRoleBindings,
  seedVisitors
} from "../testing/fixtures";
import { auditLogs, bookmarks, examAttempts, ipRoleBindings, mistakes, practiceAttempts, questions, schema, visitors, type QuestionRecord } from "./schema";
import type { InputJsonValue } from "./json";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  await cleanupSeedData();

  await upsertVisitors();
  await upsertRoleBindings();

  const savedQuestions = await createQuestions();
  const visitorRows = await db.select({ id: visitors.id, ip: visitors.ip }).from(visitors).where(inArray(visitors.ip, Object.values(seedIps)));
  const learner = requireByIp(visitorRows, seedIps.learner);
  const learnerAlt = requireByIp(visitorRows, seedIps.learnerAlt);

  await seedActivity(learner.id, learnerAlt.id, savedQuestions);
  await db.insert(auditLogs).values(buildSeedAuditLogs());

  console.info(`Seeded ${savedQuestions.size} questions, ${seedVisitors.length} visitors, and local readiness activity.`);
}

async function cleanupSeedData() {
  const seedVisitorIds = (
    await db.select({ id: visitors.id }).from(visitors).where(inArray(visitors.ip, Object.values(seedIps)))
  ).map((visitor) => visitor.id);

  await db
    .delete(auditLogs)
    .where(or(like(auditLogs.target, `${SEED_SOURCE_PREFIX}%`), sql`${auditLogs.detail}->>'seedTag' = ${SEED_TAG}`));

  if (seedVisitorIds.length > 0) {
    await db.delete(practiceAttempts).where(inArray(practiceAttempts.visitorId, seedVisitorIds));
    await db.delete(mistakes).where(inArray(mistakes.visitorId, seedVisitorIds));
    await db.delete(bookmarks).where(inArray(bookmarks.visitorId, seedVisitorIds));
    await db.delete(examAttempts).where(inArray(examAttempts.visitorId, seedVisitorIds));
  }

  await db.delete(practiceAttempts).where(eq(practiceAttempts.mode, SEED_PRACTICE_MODE));
  await db.delete(examAttempts).where(arrayContains(examAttempts.flaggedQuestionIds, [SEED_EXAM_FLAG]));
}

async function upsertVisitors() {
  for (const visitor of seedVisitors) {
    await db
      .insert(visitors)
      .values(visitor)
      .onConflictDoUpdate({
        target: visitors.ip,
        set: {
          firstSeenAt: visitor.firstSeenAt,
          lastSeenAt: visitor.lastSeenAt
        }
      });
  }
}

async function upsertRoleBindings() {
  for (const binding of seedRoleBindings) {
    await db
      .insert(ipRoleBindings)
      .values({ ...binding, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: ipRoleBindings.ip,
        set: {
          role: binding.role,
          note: binding.note,
          updatedByIp: binding.updatedByIp,
          updatedAt: new Date()
        }
      });
  }
}

async function createQuestions(): Promise<Map<string, SeedQuestionRecord>> {
  const savedQuestions = new Map<string, SeedQuestionRecord>();

  for (const seedQuestion of buildSeedQuestions()) {
    const data = {
      subject: seedQuestion.subject,
      language: seedQuestion.language,
      level: seedQuestion.level,
      type: seedQuestion.type,
      stemMd: seedQuestion.stemMd,
      options: seedQuestion.options as unknown as InputJsonValue,
      correctAnswers: seedQuestion.correctAnswers,
      explanationMd: seedQuestion.explanationMd,
      memo: seedQuestion.memo,
      tags: seedQuestion.tags,
      totalAttempts: seedQuestion.totalAttempts,
      correctAttempts: seedQuestion.correctAttempts,
      status: seedQuestion.status,
      createdByIp: seedQuestion.createdByIp,
      updatedAt: new Date()
    };
    const [saved] = await db
      .insert(questions)
      .values({
        sourceCode: seedQuestion.sourceCode,
        ...data
      })
      .onConflictDoUpdate({
        target: questions.sourceCode,
        set: data
      })
      .returning();
    const question = requireQuestion(saved, seedQuestion.sourceCode);
    savedQuestions.set(question.sourceCode ?? question.id, question);
  }

  return savedQuestions;
}

async function seedActivity(
  learnerId: string,
  learnerAltId: string,
  savedQuestions: Map<string, SeedQuestionRecord>
) {
  const examQuestions = Array.from(savedQuestions.values()).filter(
    (question) =>
      question.subject === examReadySource.subject &&
      question.language === examReadySource.language &&
      question.level === examReadySource.level &&
      question.status === "published"
  );
  const firstSingle = requireBySource(savedQuestions, `${SEED_SOURCE_PREFIX}-EXAM-JAVA-WORKING-SINGLE-01`);
  const secondSingle = requireBySource(savedQuestions, `${SEED_SOURCE_PREFIX}-EXAM-JAVA-WORKING-SINGLE-02`);
  const firstMultiple = requireBySource(savedQuestions, `${SEED_SOURCE_PREFIX}-EXAM-JAVA-WORKING-MULTIPLE-01`);
  const firstJudgment = requireBySource(savedQuestions, `${SEED_SOURCE_PREFIX}-EXAM-JAVA-WORKING-JUDGMENT-01`);

  await db.insert(practiceAttempts).values([
    attempt(learnerId, firstSingle.id, ["C"], true, 42),
    attempt(learnerId, secondSingle.id, ["A"], false, 51),
    attempt(learnerId, firstMultiple.id, ["A", "C"], true, 64),
    attempt(learnerAltId, firstJudgment.id, ["A"], false, 28)
  ]);

  await upsertMistake(learnerId, secondSingle.id, {
    wrongCount: 2,
    consecutiveCorrectCount: 0,
    isMastered: false,
    lastWrongAt: new Date(),
    masteredAt: null
  });
  await upsertMistake(learnerId, firstJudgment.id, {
    wrongCount: 3,
    consecutiveCorrectCount: 2,
    isMastered: false,
    lastWrongAt: new Date(),
    masteredAt: null
  });
  await upsertMistake(learnerAltId, firstMultiple.id, {
    wrongCount: 1,
    consecutiveCorrectCount: 3,
    isMastered: true,
    lastWrongAt: daysAgo(3),
    masteredAt: daysAgo(1)
  });

  await upsertBookmark(learnerId, firstSingle.id, "Review concurrent collection choice", [SEED_TAG]);
  await upsertBookmark(learnerId, firstMultiple.id, "Security practice reminder", [SEED_TAG, "security"]);

  await db.insert(examAttempts).values([
    submittedExam(learnerId, examQuestions),
    abandonedExam(learnerAltId, examQuestions.slice(0, 5))
  ]);
}

function submittedExam(visitorId: string, examQuestions: SeedQuestionRecord[]) {
  const answers = Object.fromEntries(
    examQuestions.map((question, index) => [question.id, index < 24 ? question.correctAnswers : ["A"]])
  );
  const startedAt = daysAgo(1, 7);

  return {
    visitorId,
    subject: examReadySource.subject,
    language: examReadySource.language,
    level: examReadySource.level,
    configSnapshot: examConfigSnapshot,
    questionSnapshot: examQuestions.map(toQuestionSnapshot) as unknown as InputJsonValue,
    answers,
    flaggedQuestionIds: [SEED_EXAM_FLAG],
    status: "submitted" as const,
    scorePercent: "60.00",
    isPassed: true,
    startedAt,
    deadlineAt: new Date(startedAt.getTime() + 45 * 60 * 1000),
    submittedAt: new Date(startedAt.getTime() + 28 * 60 * 1000),
    updatedAt: new Date(startedAt.getTime() + 28 * 60 * 1000)
  };
}

function abandonedExam(visitorId: string, examQuestions: SeedQuestionRecord[]) {
  const startedAt = daysAgo(2, 6);

  return {
    visitorId,
    subject: examReadySource.subject,
    language: examReadySource.language,
    level: examReadySource.level,
    configSnapshot: examConfigSnapshot,
    questionSnapshot: examQuestions.map(toQuestionSnapshot) as unknown as InputJsonValue,
    answers: {},
    flaggedQuestionIds: [SEED_EXAM_FLAG],
    status: "abandoned" as const,
    scorePercent: null,
    isPassed: null,
    startedAt,
    deadlineAt: new Date(startedAt.getTime() + 45 * 60 * 1000),
    submittedAt: null,
    updatedAt: startedAt
  };
}

function toQuestionSnapshot(question: SeedQuestionRecord) {
  return {
    id: question.id,
    sourceCode: question.sourceCode,
    subject: question.subject,
    language: question.language,
    level: question.level,
    type: question.type,
    stemMd: question.stemMd,
    options: question.options,
    correctAnswers: question.correctAnswers,
    explanationMd: question.explanationMd,
    memo: question.memo,
    tags: question.tags
  };
}

function attempt(visitorId: string, questionId: string, selectedKeys: string[], isCorrect: boolean, durationSec: number) {
  return {
    visitorId,
    questionId,
    selectedKeys,
    isCorrect,
    mode: SEED_PRACTICE_MODE,
    durationSec,
    createdAt: new Date()
  };
}

async function upsertMistake(
  visitorId: string,
  questionId: string,
  data: {
    wrongCount: number;
    consecutiveCorrectCount: number;
    isMastered: boolean;
    lastWrongAt: Date;
    masteredAt: Date | null;
  }
) {
  await db
    .insert(mistakes)
    .values({ visitorId, questionId, ...data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [mistakes.visitorId, mistakes.questionId],
      set: { ...data, updatedAt: new Date() }
    });
}

async function upsertBookmark(visitorId: string, questionId: string, note: string, tags: string[]) {
  await db
    .insert(bookmarks)
    .values({ visitorId, questionId, note, tags, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [bookmarks.visitorId, bookmarks.questionId],
      set: { note, tags, updatedAt: new Date() }
    });
}

function requireBySource(savedQuestions: Map<string, SeedQuestionRecord>, sourceCode: string): SeedQuestionRecord {
  const question = savedQuestions.get(sourceCode);
  if (question === undefined) {
    throw new Error(`Missing seed question ${sourceCode}`);
  }
  return question;
}

function requireByIp(visitorRows: Array<{ id: string; ip: string }>, ip: string): { id: string; ip: string } {
  const visitor = visitorRows.find((item) => item.ip === ip);
  if (visitor === undefined) {
    throw new Error(`Missing seed visitor ${ip}`);
  }
  return visitor;
}

function requireQuestion(question: QuestionRecord | undefined, sourceCode: string): QuestionRecord {
  if (question === undefined) {
    throw new Error(`Question upsert did not return ${sourceCode}`);
  }
  return question;
}

function daysAgo(days: number, hour = 8): Date {
  const date = new Date();
  date.setUTCHours(hour, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

type SeedQuestionRecord = QuestionRecord;

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
