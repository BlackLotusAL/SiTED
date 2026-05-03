import { Prisma, PrismaClient } from "@prisma/client";
import {
  SEED_SOURCE_PREFIX,
  buildSeedAuditLogs,
  buildSeedQuestions,
  examConfigSnapshot,
  examReadySource,
  seedIps,
  seedRoleBindings,
  seedVisitors
} from "../src/testing/fixtures";

const prisma = new PrismaClient();

async function main() {
  await cleanupSeedData();

  await prisma.visitor.createMany({ data: seedVisitors });
  await prisma.ipRoleBinding.createMany({ data: seedRoleBindings });

  const questions = await createQuestions();
  const visitors = await prisma.visitor.findMany({ where: { ip: { in: Object.values(seedIps) } } });
  const learner = requireByIp(visitors, seedIps.learner);
  const learnerAlt = requireByIp(visitors, seedIps.learnerAlt);

  await seedActivity(learner.id, learnerAlt.id, questions);
  await prisma.auditLog.createMany({ data: buildSeedAuditLogs() });

  console.info(`Seeded ${questions.size} questions, ${seedVisitors.length} visitors, and local readiness activity.`);
}

async function cleanupSeedData() {
  const [questions, visitors] = await Promise.all([
    prisma.question.findMany({
      where: { sourceCode: { startsWith: SEED_SOURCE_PREFIX } },
      select: { id: true }
    }),
    prisma.visitor.findMany({
      where: { ip: { in: Object.values(seedIps) } },
      select: { id: true }
    })
  ]);
  const questionIds = questions.map((question) => question.id);
  const visitorIds = visitors.map((visitor) => visitor.id);

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorIp: { in: Object.values(seedIps) } },
        { target: { startsWith: SEED_SOURCE_PREFIX } },
        { target: { in: Object.values(seedIps) } }
      ]
    }
  });
  await prisma.bookmark.deleteMany({ where: seedRelationWhere(visitorIds, questionIds) });
  await prisma.mistake.deleteMany({ where: seedRelationWhere(visitorIds, questionIds) });
  await prisma.practiceAttempt.deleteMany({ where: seedRelationWhere(visitorIds, questionIds) });
  await prisma.examAttempt.deleteMany({ where: { visitorId: { in: visitorIds } } });
  await prisma.question.deleteMany({ where: { sourceCode: { startsWith: SEED_SOURCE_PREFIX } } });
  await prisma.ipRoleBinding.deleteMany({ where: { ip: { in: seedRoleBindings.map((binding) => binding.ip) } } });
  await prisma.visitor.deleteMany({ where: { ip: { in: Object.values(seedIps) } } });
}

async function createQuestions(): Promise<Map<string, SeedQuestionRecord>> {
  const questions = new Map<string, SeedQuestionRecord>();

  for (const seedQuestion of buildSeedQuestions()) {
    const created = await prisma.question.create({
      data: {
        sourceCode: seedQuestion.sourceCode,
        subject: seedQuestion.subject,
        language: seedQuestion.language,
        level: seedQuestion.level,
        type: seedQuestion.type,
        stemMd: seedQuestion.stemMd,
        options: seedQuestion.options as unknown as Prisma.InputJsonValue,
        correctAnswers: seedQuestion.correctAnswers,
        explanationMd: seedQuestion.explanationMd,
        memo: seedQuestion.memo,
        tags: seedQuestion.tags,
        totalAttempts: seedQuestion.totalAttempts,
        correctAttempts: seedQuestion.correctAttempts,
        status: seedQuestion.status,
        createdByIp: seedQuestion.createdByIp
      }
    });
    questions.set(created.sourceCode ?? created.id, created);
  }

  return questions;
}

async function seedActivity(
  learnerId: string,
  learnerAltId: string,
  questions: Map<string, SeedQuestionRecord>
) {
  const examQuestions = Array.from(questions.values()).filter(
    (question) =>
      question.subject === examReadySource.subject &&
      question.language === examReadySource.language &&
      question.level === examReadySource.level &&
      question.status === "published"
  );
  const firstSingle = requireBySource(questions, `${SEED_SOURCE_PREFIX}-EXAM-JAVA-WORKING-SINGLE-01`);
  const secondSingle = requireBySource(questions, `${SEED_SOURCE_PREFIX}-EXAM-JAVA-WORKING-SINGLE-02`);
  const firstMultiple = requireBySource(questions, `${SEED_SOURCE_PREFIX}-EXAM-JAVA-WORKING-MULTIPLE-01`);
  const firstJudgment = requireBySource(questions, `${SEED_SOURCE_PREFIX}-EXAM-JAVA-WORKING-JUDGMENT-01`);

  await prisma.practiceAttempt.createMany({
    data: [
      attempt(learnerId, firstSingle.id, ["C"], true, 42),
      attempt(learnerId, secondSingle.id, ["A"], false, 51),
      attempt(learnerId, firstMultiple.id, ["A", "C"], true, 64),
      attempt(learnerAltId, firstJudgment.id, ["A"], false, 28)
    ]
  });

  await prisma.mistake.createMany({
    data: [
      {
        visitorId: learnerId,
        questionId: secondSingle.id,
        wrongCount: 2,
        consecutiveCorrectCount: 0,
        isMastered: false,
        lastWrongAt: new Date()
      },
      {
        visitorId: learnerId,
        questionId: firstJudgment.id,
        wrongCount: 3,
        consecutiveCorrectCount: 2,
        isMastered: false,
        lastWrongAt: new Date()
      },
      {
        visitorId: learnerAltId,
        questionId: firstMultiple.id,
        wrongCount: 1,
        consecutiveCorrectCount: 3,
        isMastered: true,
        lastWrongAt: daysAgo(3),
        masteredAt: daysAgo(1)
      }
    ]
  });

  await prisma.bookmark.createMany({
    data: [
      { visitorId: learnerId, questionId: firstSingle.id, note: "Review concurrent collection choice", tags: ["seed"] },
      { visitorId: learnerId, questionId: firstMultiple.id, note: "Security practice reminder", tags: ["seed", "security"] }
    ]
  });

  await prisma.examAttempt.createMany({
    data: [
      submittedExam(learnerId, examQuestions),
      abandonedExam(learnerAltId, examQuestions.slice(0, 5))
    ]
  });
}

function submittedExam(visitorId: string, questions: SeedQuestionRecord[]) {
  const answers = Object.fromEntries(
    questions.map((question, index) => [question.id, index < 24 ? question.correctAnswers : ["A"]])
  );
  const startedAt = daysAgo(1, 7);

  return {
    visitorId,
    subject: examReadySource.subject,
    language: examReadySource.language,
    level: examReadySource.level,
    configSnapshot: examConfigSnapshot,
    questionSnapshot: questions.map(toQuestionSnapshot) as unknown as Prisma.InputJsonValue,
    answers,
    status: "submitted" as const,
    scorePercent: new Prisma.Decimal("60.00"),
    isPassed: true,
    startedAt,
    deadlineAt: new Date(startedAt.getTime() + 45 * 60 * 1000),
    submittedAt: new Date(startedAt.getTime() + 28 * 60 * 1000)
  };
}

function abandonedExam(visitorId: string, questions: SeedQuestionRecord[]) {
  const startedAt = daysAgo(2, 6);

  return {
    visitorId,
    subject: examReadySource.subject,
    language: examReadySource.language,
    level: examReadySource.level,
    configSnapshot: examConfigSnapshot,
    questionSnapshot: questions.map(toQuestionSnapshot) as unknown as Prisma.InputJsonValue,
    answers: {},
    status: "abandoned" as const,
    scorePercent: null,
    isPassed: null,
    startedAt,
    deadlineAt: new Date(startedAt.getTime() + 45 * 60 * 1000),
    submittedAt: null
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
    mode: "practice",
    durationSec,
    createdAt: new Date()
  };
}

function requireBySource(questions: Map<string, SeedQuestionRecord>, sourceCode: string): SeedQuestionRecord {
  const question = questions.get(sourceCode);
  if (question === undefined) {
    throw new Error(`Missing seed question ${sourceCode}`);
  }
  return question;
}

function requireByIp(visitors: Array<{ id: string; ip: string }>, ip: string): { id: string; ip: string } {
  const visitor = visitors.find((item) => item.ip === ip);
  if (visitor === undefined) {
    throw new Error(`Missing seed visitor ${ip}`);
  }
  return visitor;
}

function seedRelationWhere(visitorIds: string[], questionIds: string[]) {
  return {
    OR: [
      { visitorId: { in: visitorIds } },
      { questionId: { in: questionIds } }
    ]
  };
}

function daysAgo(days: number, hour = 8): Date {
  const date = new Date();
  date.setUTCHours(hour, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

type SeedQuestionRecord = Awaited<ReturnType<typeof prisma.question.create>>;

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
