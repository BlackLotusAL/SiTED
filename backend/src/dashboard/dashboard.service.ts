import { Inject, Injectable, Optional } from "@nestjs/common";
import { and, count, desc, eq, gte, lt } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { examAttempts, mistakes, practiceAttempts, questions, visitors, type ExamAttemptRecord } from "../db/schema";
import { SUBJECTS, type Subject } from "../domain/constants";
import type { RequestIdentity } from "../identity/identity.service";

type NowProvider = () => Date;
type PracticeAttemptSummary = { isCorrect: boolean };
type PracticeAttemptDay = { createdAt: Date };
type CoverageGroup = { subject: Subject; count: number };
type LatestExamRecord = Pick<
  ExamAttemptRecord,
  "id" | "subject" | "language" | "level" | "status" | "scorePercent" | "isPassed" | "startedAt" | "submittedAt"
>;

const HONG_KONG_OFFSET_MS = 8 * 60 * 60 * 1000;

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DbService)
    private readonly db: DbService,
    @Optional() @Inject("DASHBOARD_NOW_PROVIDER") nowProvider?: NowProvider
  ) {
    this.now = nowProvider ?? (() => new Date());
  }

  private readonly now: NowProvider;

  async getSummary(identity: RequestIdentity) {
    const now = this.now();
    const coveragePromise = this.coverage();
    const [visitor] = await this.db.client.select({ id: visitors.id }).from(visitors).where(eq(visitors.ip, identity.ip)).limit(1);

    if (visitor === undefined) {
      return {
        today: emptyToday(),
        mistakes: { unmastered: 0 },
        latestExam: null,
        calendar: calendarForMonth(now, []),
        coverage: await coveragePromise
      };
    }

    const todayStart = startOfBusinessDayUtc(now);
    const tomorrowStart = addDaysUtc(todayStart, 1);
    const monthStart = startOfBusinessMonthUtc(now);
    const nextMonthStart = addBusinessMonthsUtc(monthStart, 1);

    const [todayAttempts, unmasteredMistakes, latestExam, monthAttempts, coverage] = await Promise.all([
      this.db.client
        .select({ isCorrect: practiceAttempts.isCorrect })
        .from(practiceAttempts)
        .where(and(eq(practiceAttempts.visitorId, visitor.id), gte(practiceAttempts.createdAt, todayStart), lt(practiceAttempts.createdAt, tomorrowStart))),
      this.countUnmasteredMistakes(visitor.id),
      this.latestExam(visitor.id),
      this.db.client
        .select({ createdAt: practiceAttempts.createdAt })
        .from(practiceAttempts)
        .where(and(eq(practiceAttempts.visitorId, visitor.id), gte(practiceAttempts.createdAt, monthStart), lt(practiceAttempts.createdAt, nextMonthStart))),
      coveragePromise
    ]);

    return {
      today: todaySummary(todayAttempts),
      mistakes: { unmastered: unmasteredMistakes },
      latestExam: latestExam === null ? null : toLatestExam(latestExam),
      calendar: calendarForMonth(now, monthAttempts),
      coverage
    };
  }

  private async coverage() {
    const groups = await this.db.client
      .select({ subject: questions.subject, count: count() })
      .from(questions)
      .where(eq(questions.status, "published"))
      .groupBy(questions.subject);

    return coverageFromGroups(groups);
  }

  private async countUnmasteredMistakes(visitorId: string): Promise<number> {
    const rows = await this.db.client
      .select({ value: count() })
      .from(mistakes)
      .where(and(eq(mistakes.visitorId, visitorId), eq(mistakes.isMastered, false)));
    return rows[0]?.value ?? 0;
  }

  private async latestExam(visitorId: string): Promise<LatestExamRecord | null> {
    const [exam] = await this.db.client
      .select({
        id: examAttempts.id,
        subject: examAttempts.subject,
        language: examAttempts.language,
        level: examAttempts.level,
        status: examAttempts.status,
        scorePercent: examAttempts.scorePercent,
        isPassed: examAttempts.isPassed,
        startedAt: examAttempts.startedAt,
        submittedAt: examAttempts.submittedAt
      })
      .from(examAttempts)
      .where(eq(examAttempts.visitorId, visitorId))
      .orderBy(desc(examAttempts.startedAt))
      .limit(1);
    return exam ?? null;
  }
}

function todaySummary(attempts: PracticeAttemptSummary[]) {
  const answered = attempts.length;
  const correct = attempts.filter((attempt) => attempt.isCorrect).length;
  const incorrect = answered - correct;

  return {
    answered,
    correct,
    incorrect,
    correctRate: answered === 0 ? 0 : Math.round((correct / answered) * 100)
  };
}

function emptyToday() {
  return { answered: 0, correct: 0, incorrect: 0, correctRate: 0 };
}

function calendarForMonth(now: Date, attempts: PracticeAttemptDay[]) {
  const { year, month } = businessDateParts(now);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const counts = new Map<number, number>();

  for (const attempt of attempts) {
    const parts = businessDateParts(attempt.createdAt);
    if (parts.year === year && parts.month === month) {
      counts.set(parts.day, (counts.get(parts.day) ?? 0) + 1);
    }
  }

  const days = Array.from({ length: daysInMonth }, (_value, index) => {
    const day = index + 1;
    return { day, count: counts.get(day) ?? 0 };
  });

  return {
    year,
    month,
    total: attempts.length,
    days
  };
}

function coverageFromGroups(groups: CoverageGroup[]) {
  const counts = new Map(groups.map((group) => [group.subject, group.count]));
  return SUBJECTS.map((subject) => ({ subject, count: counts.get(subject) ?? 0 }));
}

function toLatestExam(exam: LatestExamRecord) {
  return {
    id: exam.id,
    subject: exam.subject,
    language: exam.language,
    level: exam.level,
    status: exam.status,
    scorePercent: exam.scorePercent === null ? null : Number(exam.scorePercent),
    isPassed: exam.isPassed,
    startedAt: exam.startedAt,
    submittedAt: exam.submittedAt
  };
}

function businessDateParts(date: Date) {
  const businessDate = new Date(date.getTime() + HONG_KONG_OFFSET_MS);
  return {
    year: businessDate.getUTCFullYear(),
    month: businessDate.getUTCMonth() + 1,
    day: businessDate.getUTCDate()
  };
}

function startOfBusinessDayUtc(date: Date): Date {
  const { year, month, day } = businessDateParts(date);
  return new Date(Date.UTC(year, month - 1, day) - HONG_KONG_OFFSET_MS);
}

function startOfBusinessMonthUtc(date: Date): Date {
  const { year, month } = businessDateParts(date);
  return new Date(Date.UTC(year, month - 1, 1) - HONG_KONG_OFFSET_MS);
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addBusinessMonthsUtc(date: Date, months: number): Date {
  const businessDate = new Date(date.getTime() + HONG_KONG_OFFSET_MS);
  return new Date(Date.UTC(businessDate.getUTCFullYear(), businessDate.getUTCMonth() + months, 1) - HONG_KONG_OFFSET_MS);
}
