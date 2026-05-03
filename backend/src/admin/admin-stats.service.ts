import { Inject, Injectable, Optional } from "@nestjs/common";
import type { Subject } from "../domain/constants";
import { SUBJECTS } from "../domain/constants";
import { PrismaService } from "../prisma/prisma.service";

type NowProvider = () => Date;
type TrendPoint = { date: string; count: number };
export const ADMIN_STATS_NOW_PROVIDER = Symbol("ADMIN_STATS_NOW_PROVIDER");

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
    const todayStart = startOfDay(now);
    const tomorrowStart = addDays(todayStart, 1);
    const trendStart = addDays(todayStart, -6);
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
      this.prisma.question.findMany({
        where: { totalAttempts: { gt: 0 } },
        orderBy: [{ totalAttempts: "desc" }, { updatedAt: "desc" }],
        take: 100
      }),
      this.prisma.visitor.count({ where: { lastSeenAt: { gte: todayStart, lt: tomorrowStart } } }),
      this.prisma.practiceAttempt.count({ where: { createdAt: { gte: todayStart, lt: tomorrowStart } } }),
      this.prisma.examAttempt.count({ where: { startedAt: { gte: todayStart, lt: tomorrowStart } } }),
      this.prisma.visitor.groupBy({
        by: ["lastSeenAt"],
        where: { lastSeenAt: { gte: trendStart, lt: trendEnd } },
        _count: { _all: true }
      }),
      this.prisma.practiceAttempt.groupBy({
        by: ["createdAt"],
        where: { createdAt: { gte: trendStart, lt: trendEnd } },
        _count: { _all: true }
      }),
      this.prisma.examAttempt.groupBy({
        by: ["startedAt"],
        where: { startedAt: { gte: trendStart, lt: trendEnd } },
        _count: { _all: true }
      })
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
        }))
        .sort((left, right) => left.correctRate - right.correctRate || right.totalAttempts - left.totalAttempts)
        .slice(0, 10),
      today: {
        visitors: todayVisitors,
        practiceQuestions: todayPracticeQuestions,
        exams: todayExams
      },
      trends: {
        visitors: trendSeries(trendStart, visitorTrendGroups, "lastSeenAt"),
        practiceQuestions: trendSeries(trendStart, practiceTrendGroups, "createdAt"),
        exams: trendSeries(trendStart, examTrendGroups, "startedAt")
      }
    };
  }
}

function subjectDistribution(groups: Array<{ subject: Subject; _count: { _all: number } }>) {
  const counts = new Map(groups.map((group) => [group.subject, group._count._all]));
  return SUBJECTS.map((subject) => ({ subject, count: counts.get(subject) ?? 0 }));
}

function trendSeries<T extends string>(
  start: Date,
  groups: Array<Record<T, Date> & { _count: { _all: number } }>,
  field: T
): TrendPoint[] {
  const counts = new Map<string, number>();
  for (const group of groups) {
    const key = dayKey(group[field]);
    counts.set(key, (counts.get(key) ?? 0) + group._count._all);
  }

  return Array.from({ length: 7 }, (_value, index) => {
    const date = dayKey(addDays(start, index));
    return { date, count: counts.get(date) ?? 0 };
  });
}

function correctRate(question: { totalAttempts: number; correctAttempts: number }): number {
  return question.totalAttempts === 0 ? 0 : Math.round((question.correctAttempts / question.totalAttempts) * 100);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
