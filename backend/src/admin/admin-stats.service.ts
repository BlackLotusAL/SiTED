import { Inject, Injectable, Optional } from "@nestjs/common";
import { count, eq, sql, type SQL } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { examAttempts, practiceAttempts, questions, visitors } from "../db/schema";
import type { Subject } from "../domain/constants";
import { SUBJECTS } from "../domain/constants";

type NowProvider = () => Date;
type TrendPoint = { date: string; count: number };
export const ADMIN_STATS_NOW_PROVIDER = Symbol("ADMIN_STATS_NOW_PROVIDER");
const BUSINESS_TIME_ZONE = "Asia/Hong_Kong";
const HONG_KONG_OFFSET_MS = 8 * 60 * 60 * 1000;

@Injectable()
export class AdminStatsService {
  private readonly now: NowProvider;

  constructor(
    @Inject(DbService)
    private readonly db: DbService,
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
      this.countRows(questions),
      this.countRows(questions, eq(questions.status, "published")),
      this.db.client.select({ subject: questions.subject, count: count() }).from(questions).groupBy(questions.subject),
      this.findLowCorrectRateQuestions(),
      this.countRows(visitors, sql`${visitors.lastSeenAt} >= ${todayStart} AND ${visitors.lastSeenAt} < ${tomorrowStart}`),
      this.countRows(practiceAttempts, sql`${practiceAttempts.createdAt} >= ${todayStart} AND ${practiceAttempts.createdAt} < ${tomorrowStart}`),
      this.countRows(examAttempts, sql`${examAttempts.startedAt} >= ${todayStart} AND ${examAttempts.startedAt} < ${tomorrowStart}`),
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
    return executeRows<LowCorrectRateQuestion>(this.db.client.execute(sql`
      SELECT
        q.id,
        q."sourceCode",
        q.subject,
        q.language,
        q.level,
        q.type,
        q."stemMd",
        COUNT(pa.id)::int AS "totalAttempts",
        COUNT(pa.id) FILTER (WHERE pa."isCorrect")::int AS "correctAttempts",
        MAX(pa."createdAt") AS "updatedAt"
      FROM "Question" q
      JOIN "PracticeAttempt" pa ON pa."questionId" = q.id
      GROUP BY q.id, q."sourceCode", q.subject, q.language, q.level, q.type, q."stemMd"
      ORDER BY (COUNT(pa.id) FILTER (WHERE pa."isCorrect"))::double precision / COUNT(pa.id)::double precision ASC,
        COUNT(pa.id) DESC,
        MAX(pa."createdAt") DESC
      LIMIT 10
    `));
  }

  private trendRows(table: "Visitor" | "PracticeAttempt" | "ExamAttempt", field: "lastSeenAt" | "createdAt" | "startedAt", start: Date, end: Date) {
    return executeRows<TrendRow>(this.db.client.execute(sql`
      SELECT
        to_char(
          date_trunc(
            'day',
            (${sql.raw(`"${field}"`)} AT TIME ZONE 'UTC') AT TIME ZONE ${sql.raw(`'${BUSINESS_TIME_ZONE}'`)}
          ),
          'YYYY-MM-DD'
        ) AS date,
        COUNT(*)::int AS count
      FROM ${sql.raw(`"${table}"`)}
      WHERE ${sql.raw(`"${field}"`)} >= ${start} AND ${sql.raw(`"${field}"`)} < ${end}
      GROUP BY date
      ORDER BY date ASC
    `));
  }

  private async countRows(table: typeof questions | typeof visitors | typeof practiceAttempts | typeof examAttempts, where?: SQL): Promise<number> {
    const rows = await this.db.client.select({ value: count() }).from(table).where(where);
    return rows[0]?.value ?? 0;
  }
}

function subjectDistribution(groups: Array<{ subject: Subject; count: number }>) {
  const counts = new Map(groups.map((group) => [group.subject, group.count]));
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

async function executeRows<T>(query: Promise<T[] | { rows: T[] }>): Promise<T[]> {
  const result = await query;
  return Array.isArray(result) ? result : result.rows;
}
