import { BadRequestException, ConflictException } from "@nestjs/common";
import { drizzleMock } from "../testing/drizzle-mock";
import { ImportExportService } from "./import-export.service";

describe("ImportExportService", () => {
  it("validates every row and reports row-level errors without importing invalid batches", async () => {
    const db = drizzleMock({ select: [[], []] });
    const service = new ImportExportService(db.service as never);
    const batch = {
      version: "1.0",
      questions: [
        validImportQuestion({ sourceCode: "SRC-1" }),
        validImportQuestion({
          sourceCode: "SRC-1",
          type: "multiple",
          correctAnswers: undefined,
          options: [
            { key: "A", text: "A", isCorrect: true },
            { key: "B", text: "B", isCorrect: false },
            { key: "C", text: "C", isCorrect: false }
          ]
        })
      ]
    };

    const report = await service.validateImport(batch);

    expect(report.valid).toBe(false);
    expect(report.importableCount).toBe(1);
    expect(report.failedCount).toBe(1);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 2, field: "sourceCode" }),
        expect.objectContaining({ row: 2, field: "options" })
      ])
    );

    await expect(service.commitImport(batch, { actorIp: "10.0.0.5", role: "content_admin" })).rejects.toThrow(
      BadRequestException
    );
    expect(db.client.transaction).not.toHaveBeenCalled();
  });

  it("reports existing database sourceCode values as row-level validation errors", async () => {
    const db = drizzleMock({ select: [[{ sourceCode: "SRC-1" }]] });
    const service = new ImportExportService(db.service as never);

    const report = await service.validateImport({ version: "1.0", questions: [validImportQuestion()] });

    expect(db.client.select).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ valid: false, importableCount: 0, failedCount: 1 });
    expect(report.errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 1, field: "sourceCode" })]));
  });

  it("keeps import atomic and maps database unique races to row-level conflict responses", async () => {
    const duplicateError = Object.assign(new Error("duplicate"), { code: "23505" });
    const db = drizzleMock({
      select: [[], [{ sourceCode: "SRC-1" }]],
      insert: [duplicateError]
    });
    const service = new ImportExportService(db.service as never);

    await expect(
      service.commitImport(
        { version: "1.0", questions: [validImportQuestion()] },
        { actorIp: "10.0.0.5", role: "content_admin" }
      )
    ).rejects.toMatchObject({
      constructor: ConflictException,
      response: expect.objectContaining({
        code: "IMPORT_SOURCE_CODE_CONFLICT",
        conflicts: ["SRC-1"],
        errors: [expect.objectContaining({ row: 1, field: "sourceCode", sourceCode: "SRC-1" })]
      })
    });
  });

  it("imports a valid batch atomically as published with correctAnswers derived from options", async () => {
    const db = drizzleMock({ select: [[]], insert: [[], []] });
    const service = new ImportExportService(db.service as never);
    const batch = { version: "1.0", questions: [validImportQuestion()] };

    const result = await service.commitImport(batch, { actorIp: "10.0.0.5", role: "content_admin" });

    expect(result).toEqual({ importedCount: 1 });
    expect(db.client.transaction).toHaveBeenCalledWith(expect.any(Function));
    const insertBuilder = db.client.insert.mock.results[0].value as { values: jest.Mock };
    expect(insertBuilder.values).toHaveBeenCalledWith(expect.objectContaining({
      correctAnswers: ["B"],
      createdByIp: "10.0.0.5",
      status: "published"
    }));
  });

  it("exports the PRD JSON shape and excludes runtime counters and audit metadata", async () => {
    const db = drizzleMock({
      select: [
        [
          {
            ...validImportQuestion(),
            id: "q1",
            correctAnswers: ["B"],
            totalAttempts: 10,
            correctAttempts: 8,
            createdByIp: "10.0.0.5",
            createdAt: new Date("2026-05-03T00:00:00.000Z"),
            updatedAt: new Date("2026-05-03T00:00:00.000Z"),
            status: "published"
          }
        ]
      ]
    });
    const service = new ImportExportService(db.service as never);

    const exported = await service.exportQuestions({ subject: "programming", status: "published" });

    const exportBuilder = db.client.select.mock.results[0]?.value as { orderBy: jest.Mock };
    expect(exportBuilder.orderBy).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(exported).toEqual({
      version: "1.0",
      questions: [
        expect.objectContaining({
          sourceCode: "SRC-1",
          subject: "programming",
          language: "java",
          level: "working",
          type: "single"
        })
      ]
    });
    expect(Object.keys(exported.questions[0])).not.toEqual(
      expect.arrayContaining(["id", "totalAttempts", "correctAttempts", "createdByIp", "createdAt", "updatedAt", "status"])
    );
  });

  it("rejects invalid export filters before calling the database", async () => {
    const db = drizzleMock();
    const service = new ImportExportService(db.service as never);

    await expect(service.exportQuestions({ subject: "bad-subject" })).rejects.toThrow(BadRequestException);
    expect(db.client.select).not.toHaveBeenCalled();
  });
});

function validImportQuestion(overrides: Record<string, unknown> = {}) {
  return {
    sourceCode: "SRC-1",
    subject: "programming",
    language: "java",
    level: "working",
    type: "single",
    tags: ["collections"],
    stemMd: "Which collection is thread-safe?",
    options: [
      { key: "A", text: "ArrayList", isCorrect: false },
      { key: "B", text: "ConcurrentHashMap", isCorrect: true }
    ],
    explanationMd: "ConcurrentHashMap supports concurrent access.",
    memo: "Concurrent prefix",
    ...overrides
  };
}
