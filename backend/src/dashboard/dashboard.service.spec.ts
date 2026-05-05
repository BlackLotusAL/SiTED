import { DashboardService } from "./dashboard.service";

describe("DashboardService", () => {
  it("returns zero learner activity and real coverage when the visitor has no records", async () => {
    const prisma = prismaMock({
      visitor: { id: "visitor-1" },
      coverageGroups: [{ subject: "programming", _count: { _all: 3 } }]
    });
    const service = new DashboardService(prisma as never, () => new Date("2026-05-05T03:00:00.000Z"));

    const summary = await service.getSummary(identity());

    expect(summary.today).toEqual({ answered: 0, correct: 0, incorrect: 0, correctRate: 0 });
    expect(summary.mistakes).toEqual({ unmastered: 0 });
    expect(summary.latestExam).toBeNull();
    expect(summary.calendar).toMatchObject({ year: 2026, month: 5, total: 0 });
    expect(summary.calendar.days).toHaveLength(31);
    expect(summary.coverage).toEqual([
      { subject: "programming", count: 3 },
      { subject: "security_privacy", count: 0 },
      { subject: "refactoring", count: 0 }
    ]);
  });

  it("summarizes today's attempts, unmastered mistakes, latest exam, calendar, and coverage for the current visitor", async () => {
    const prisma = prismaMock({
      visitor: { id: "visitor-1" },
      todayAttempts: [{ isCorrect: true }, { isCorrect: false }, { isCorrect: true }],
      unmasteredMistakes: 2,
      latestExam: {
        id: "exam-1",
        subject: "programming",
        language: "java",
        level: "working",
        status: "submitted",
        scorePercent: 76.5,
        isPassed: true,
        startedAt: new Date("2026-05-04T13:00:00.000Z"),
        submittedAt: new Date("2026-05-04T13:40:00.000Z")
      },
      monthAttempts: [
        { createdAt: new Date("2026-05-01T02:00:00.000Z") },
        { createdAt: new Date("2026-05-01T03:00:00.000Z") },
        { createdAt: new Date("2026-05-04T16:30:00.000Z") }
      ],
      coverageGroups: [
        { subject: "programming", _count: { _all: 5 } },
        { subject: "security_privacy", _count: { _all: 4 } }
      ]
    });
    const service = new DashboardService(prisma as never, () => new Date("2026-05-05T03:00:00.000Z"));

    const summary = await service.getSummary(identity());

    expect(summary.today).toEqual({ answered: 3, correct: 2, incorrect: 1, correctRate: 67 });
    expect(summary.mistakes).toEqual({ unmastered: 2 });
    expect(summary.latestExam).toEqual(
      expect.objectContaining({
        id: "exam-1",
        subject: "programming",
        language: "java",
        level: "working",
        status: "submitted",
        scorePercent: 76.5,
        isPassed: true
      })
    );
    expect(summary.calendar.days[0]).toEqual({ day: 1, count: 2 });
    expect(summary.calendar.days[4]).toEqual({ day: 5, count: 1 });
    expect(summary.calendar.total).toBe(3);
    expect(summary.coverage).toEqual([
      { subject: "programming", count: 5 },
      { subject: "security_privacy", count: 4 },
      { subject: "refactoring", count: 0 }
    ]);
    expect(prisma.practiceAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          visitorId: "visitor-1",
          createdAt: { gte: new Date("2026-05-04T16:00:00.000Z"), lt: new Date("2026-05-05T16:00:00.000Z") }
        }),
        select: { isCorrect: true }
      })
    );
  });
});

function identity() {
  return {
    ip: "10.42.11.10",
    role: "learner" as const,
    roleLabel: "learner",
    permissions: []
  };
}

function prismaMock(
  options: {
    visitor?: { id: string } | null;
    todayAttempts?: Array<{ isCorrect: boolean }>;
    monthAttempts?: Array<{ createdAt: Date }>;
    unmasteredMistakes?: number;
    latestExam?: Record<string, unknown> | null;
    coverageGroups?: Array<{ subject: string; _count: { _all: number } }>;
  } = {}
) {
  return {
    visitor: {
      findUnique: jest.fn().mockResolvedValue(options.visitor ?? null)
    },
    practiceAttempt: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(options.todayAttempts ?? [])
        .mockResolvedValueOnce(options.monthAttempts ?? [])
    },
    mistake: {
      count: jest.fn().mockResolvedValue(options.unmasteredMistakes ?? 0)
    },
    examAttempt: {
      findFirst: jest.fn().mockResolvedValue(options.latestExam ?? null)
    },
    question: {
      groupBy: jest.fn().mockResolvedValue(options.coverageGroups ?? [])
    }
  };
}
