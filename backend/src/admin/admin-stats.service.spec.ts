import { drizzleMock } from "../testing/drizzle-mock";
import { AdminStatsService } from "./admin-stats.service";

describe("AdminStatsService", () => {
  it("returns question totals, subject distribution, low-correct-rate top 10, today's counts, and split seven-day trends", async () => {
    const db = statsDbMock();
    const service = new AdminStatsService(db.service as never, () => new Date("2026-05-03T12:00:00.000Z"));

    const stats = await service.getStats();

    expect(stats.questions).toEqual({
      total: 42,
      published: 30,
      bySubject: [
        { subject: "programming", count: 18 },
        { subject: "security_privacy", count: 9 },
        { subject: "refactoring", count: 0 }
      ]
    });
    expect(stats.lowCorrectRateQuestions).toHaveLength(2);
    expect(stats.lowCorrectRateQuestions[0]).toEqual(
      expect.objectContaining({
        id: "q-low",
        sourceCode: "SRC-LOW",
        totalAttempts: 10,
        correctAttempts: 2,
        correctRate: 20
      })
    );
    expect(stats.today).toEqual({ visitors: 3, practiceQuestions: 7, exams: 2 });
    expect(stats.trends).toEqual({
      visitors: expect.arrayContaining([{ date: "2026-05-03", count: 3 }]),
      practiceQuestions: expect.arrayContaining([{ date: "2026-05-03", count: 7 }]),
      exams: expect.arrayContaining([{ date: "2026-05-03", count: 2 }])
    });
    expect(stats.trends.visitors).toHaveLength(7);
    expect(stats.trends.practiceQuestions).toHaveLength(7);
    expect(stats.trends.exams).toHaveLength(7);
    expect(db.client.execute).toHaveBeenCalledTimes(4);
    expect(db.client.select).toHaveBeenCalledTimes(6);
  });

  it("builds low-correct-rate ranking from actual practice attempts instead of question counters", async () => {
    const db = statsDbMock();
    const service = new AdminStatsService(db.service as never, () => new Date("2026-05-03T12:00:00.000Z"));

    await service.getStats();

    const lowRateSql = sqlDebug(db.client.execute.mock.calls[0][0]);
    expect(lowRateSql).toContain('FROM "Question" q');
    expect(lowRateSql).toContain('JOIN "PracticeAttempt" pa');
    expect(lowRateSql).toContain('COUNT(pa.id)::int AS "totalAttempts"');
    expect(lowRateSql).toContain('COUNT(pa.id) FILTER (WHERE pa."isCorrect")::int AS "correctAttempts"');
    expect(lowRateSql).not.toContain('"totalAttempts" > 0');
  });

  it("does not lose low-correct-rate questions outside the first 100 most-attempted rows", async () => {
    const db = statsDbMock({
      execute: [[questionRecord({ id: "q-rare-low", totalAttempts: 1, correctAttempts: 0 })], [], [], []]
    });
    const service = new AdminStatsService(db.service as never, () => new Date("2026-05-03T12:00:00.000Z"));

    const stats = await service.getStats();

    expect(stats.lowCorrectRateQuestions).toEqual([expect.objectContaining({ id: "q-rare-low", correctRate: 0 })]);
    expect(sqlDebug(db.client.execute.mock.calls[0][0])).toContain("ORDER BY");
    expect(sqlDebug(db.client.execute.mock.calls[0][0])).toContain("LIMIT 10");
  });

  it("aggregates trends in the Asia/Hong_Kong business timezone instead of grouping every raw timestamp", async () => {
    const db = statsDbMock();
    const service = new AdminStatsService(db.service as never, () => new Date("2026-05-03T16:30:00.000Z"));

    await service.getStats();

    const trendSql = sqlDebug(db.client.execute.mock.calls[1][0]);
    expect(trendSql).toContain("Asia/Hong_Kong");
    expect(trendSql).toContain("AT TIME ZONE 'UTC') AT TIME ZONE");
    expect(trendSql).toContain("date_trunc");
    expect(db.client.select).toHaveBeenCalledTimes(6);
  });

  it("preserves exact database low-rate ordering when displayed rounded percentages tie", async () => {
    const db = statsDbMock({
      execute: [
        [
        questionRecord({ id: "q-exact-lower", totalAttempts: 100, correctAttempts: 33 }),
        questionRecord({ id: "q-rounded-tie", totalAttempts: 1000, correctAttempts: 334 })
        ],
        [],
        [],
        []
      ]
    });
    const service = new AdminStatsService(db.service as never, () => new Date("2026-05-03T12:00:00.000Z"));

    const stats = await service.getStats();

    expect(stats.lowCorrectRateQuestions.map((question) => question.id)).toEqual(["q-exact-lower", "q-rounded-tie"]);
    expect(stats.lowCorrectRateQuestions.map((question) => question.correctRate)).toEqual([33, 33]);
  });
});

function statsDbMock(overrides: { execute?: unknown[]; select?: unknown[] } = {}) {
  return drizzleMock({
    execute: overrides.execute ?? [
      [
        questionRecord({ id: "q-low", sourceCode: "SRC-LOW", totalAttempts: 10, correctAttempts: 2 }),
        questionRecord({ id: "q-high", sourceCode: "SRC-HIGH", totalAttempts: 20, correctAttempts: 18 })
      ],
      [{ date: "2026-05-03", count: 3 }],
      [{ date: "2026-05-03", count: 7 }],
      [{ date: "2026-05-03", count: 2 }]
    ],
    select: overrides.select ?? [
      [{ value: 42 }],
      [{ value: 30 }],
      [{ value: 3 }],
      [{ value: 7 }],
      [{ value: 2 }],
      [
        { subject: "programming", count: 18 },
        { subject: "security_privacy", count: 9 }
      ]
    ]
  });
}

function questionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "q1",
    sourceCode: "SRC-1",
    subject: "programming",
    language: "java",
    level: "working",
    type: "single",
    stemMd: "Stem",
    totalAttempts: 10,
    correctAttempts: 5,
    updatedAt: new Date("2026-05-03T00:00:00.000Z"),
    ...overrides
  };
}

function sqlDebug(query: unknown): string {
  return JSON.stringify(query, (_key, value) => (typeof value === "bigint" ? Number(value) : value))
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, "\n");
}
