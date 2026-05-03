import { Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Subject } from "../domain/constants";
import { SUBJECTS } from "../domain/constants";
import { PrismaService } from "../prisma/prisma.service";

type NowProvider = () => Date;
type TrendPoint = { date: string; count: number };
export const ADMIN_STATS_NOW_PROVIDER = Symbol("ADMIN_STATS_NOW_PROVIDER");
const BUSINESS_TIME_ZONE = "Asia/Hong_Kong";
const HONG_KONG_OFFSET_MS = 8 * 60 * 60 * 1000;

@Injectable()
export class AdminStatsService {
  private readonly now: NowProvider;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(ADMIN_STATS_NOW_PROVIDER) nowProvider?: NowProvider
  ) {
    this.now = nowProvider ?? (() => new Date());
  }

  async getStats() {
    const now = this.now();
    const todayStart = startOfBusinessDayUtc(now);
    const tomorrowStart = addDaysUtc(todayStart, 1);
    const trendStart = addDaysUtc(todayStart, -6);
    const trendEnd = tomorrowStart;

    const [
      totalQuestions,
      publishedQuestions,
      questionsBySubject,
      lowCorrectRateCandidates,
      todayVisitors,
      todayPracticeQuestions,
      todayExams,
      visitorTrendGroups,
      practiceTrendGroups,
      examTrendGroups
    ] = await Promise.all([
      this.prisma.question.count(),
      this.prisma.question.count({ where: { status: "published" } }),
      this.prisma.question.groupBy({ by: ["subject"], _count: { _all: true } }),
      this.findLowCorrectRateQuestions(),
      this.prisma.visitor.count({ where: { lastSeenAt: { gte: todayStart, lt: tomorrowStart } } }),
      this.prisma.practiceAttempt.count({ where: { createdAt: { gte: todayStart, lt: tomorrowStart } } }),
      this.prisma.examAttempt.count({ where: { startedAt: { gte: todayStart, lt: tomorrowStart } } }),
      this.trendRows("Visitor", "lastSeenAt", trendStart, trendEnd),
      this.trendRows("PracticeAttempt", "createdAt", trendStart, trendEnd),
      this.trendRows("ExamAttempt", "startedAt", trendStart, trendEnd)
    ]);

    return {
      questions: {
        total: totalQuestions,
        published: publishedQuestions,
        bySubject: subjectDistribution(questionsBySubject)
      },
      lowCorrectRateQuestions: lowCorrectRateCandidates
        .map((question) => ({
          id: question.id,
          sourceCode: question.sourceCode,
          subject: question.subject,
          language: question.language,
          level: question.level,
          type: question.type,
          stemMd: question.stemMd,
          totalAttempts: question.totalAttempts,
          correctAttempts: question.correctAttempts,
          correctRate: correctRate(question)
        })),
      today: {
        visitors: todayVisitors,
        practiceQuestions: todayPracticeQuestions,
        exams: todayExams
      },
      trends: {
        visitors: trendSeries(trendStart, visitorTrendGroups),
        practiceQuestions: trendSeries(trendStart, practiceTrendGroups),
        exams: trendSeries(trendStart, examTrendGroups)
      }
    };
  }

  private findLowCorrectRateQuestions() {
    return this.prisma.$queryRaw<LowCorrectRateQuestion[]>(Prisma.sql`
      SELECT
        id,
        "sourceCode",
        subject,
        language,
        level,
        type,
        "stemMd",
        "totalAttempts",
        "correctAttempts",
        "updatedAt"
      FROM "Question"
      WHERE "totalAttempts" > 0
      ORDER BY ("correctAttempts"::double precision / "totalAttempts"::double precision) ASC,
        "totalAttempts" DESC,
        "updatedAt" DESC
      LIMIT 10
    `);
  }

  private trendRows(table: "Visitor" | "PracticeAttempt" | "ExamAttempt", field: "lastSeenAt" | "createdAt" | "startedAt", start: Date, end: Date) {
    return this.prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      SELECT
        to_char(
          date_trunc(
            'day',
            (${Prisma.raw(`"${field}"`)} AT TIME ZONE 'UTC') AT TIME ZONE ${Prisma.raw(`'${BUSINESS_TIME_ZONE}'`)}
          ),
          'YYYY-MM-DD'
        ) AS date,
        COUNT(*)::int AS count
      FROM ${Prisma.raw(`"${table}"`)}
      WHERE ${Prisma.raw(`"${field}"`)} >= ${start} AND ${Prisma.raw(`"${field}"`)} < ${end}
      GROUP BY date
      ORDER BY date ASC
    `);
  }
}

function subjectDistribution(groups: Array<{ subject: Subject; _count: { _all: number } }>) {
  const counts = new Map(groups.map((group) => [group.subject, group._count._all]));
  return SUBJECTS.map((subject) => ({ subject, count: counts.get(subject) ?? 0 }));
}

type TrendRow = { date: string; count: number | bigint };
type LowCorrectRateQuestion = {
  id: string;
  sourceCode: string | null;
  subject: Subject;
  language: string | null;
  level: string;
  type: string;
  stemMd: string;
  totalAttempts: number;
  correctAttempts: number;
};

function trendSeries(
  start: Date,
  groups: TrendRow[]
): TrendPoint[] {
  const counts = new Map<string, number>();
  for (const group of groups) {
    counts.set(group.date, Number(group.count));
  }

  return Array.from({ length: 7 }, (_value, index) => {
    const date = dayKey(addDaysUtc(start, index));
    return { date, count: counts.get(date) ?? 0 };
  });
}

function correctRate(question: { totalAttempts: number; correctAttempts: number }): number {
  return question.totalAttempts === 0 ? 0 : Math.round((question.correctAttempts / question.totalAttempts) * 100);
}

function startOfBusinessDayUtc(date: Date): Date {
  const businessDate = new Date(date.getTime() + HONG_KONG_OFFSET_MS);
  return new Date(
    Date.UTC(businessDate.getUTCFullYear(), businessDate.getUTCMonth(), businessDate.getUTCDate()) - HONG_KONG_OFFSET_MS
  );
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function dayKey(date: Date): string {
  const businessDate = new Date(date.getTime() + HONG_KONG_OFFSET_MS);
  const year = businessDate.getUTCFullYear();
  const month = String(businessDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(businessDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
