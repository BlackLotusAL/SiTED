import { BadRequestException } from "@nestjs/common";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AdminSettingsService, DATA_CLEAR_CONFIRMATION_PHRASE, type QuestionUploadRemover } from "./admin-settings.service";

describe("AdminSettingsService", () => {
  const originalEnv = process.env;
  let uploadRoot: string;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    uploadRoot = await mkdtemp(join(tmpdir(), "sited-admin-settings-"));
    process.env.UPLOAD_ROOT = uploadRoot;
  });

  afterEach(async () => {
    process.env = originalEnv;
    await rm(uploadRoot, { recursive: true, force: true });
  });

  it("lists IP role bindings with readable role labels, concrete permission names, table headers, and system admins from env only", async () => {
    process.env.SYSTEM_ADMIN_IPS = "10.0.0.1,10.0.0.8,10.0.0.8";
    const prisma = prismaMock();
    prisma.ipRoleBinding.findMany.mockResolvedValue([
      {
        id: "binding1",
        ip: "10.0.0.8",
        role: "content_admin",
        note: "Question maintainer",
        updatedAt: new Date("2026-05-03T00:00:00.000Z")
      }
    ]);
    const service = new AdminSettingsService(prisma as never);

    const result = await service.listRoleBindings();

    expect(result.headers).toEqual(["IP", "fixed role", "permission scope", "description", "updated time"]);
    expect(result.items).toHaveLength(2);
    expect(result.items).toEqual([
      expect.objectContaining({
        ip: "10.0.0.1",
        role: "system_admin",
        fixedRole: "系统管理员",
        source: "system",
        canDelete: false,
        permissionKeys: expect.arrayContaining(["data:clear", "audit:view"]),
        permissionScope: expect.arrayContaining(["数据清空", "审计日志查看"]),
        permissions: expect.arrayContaining(["数据清空", "审计日志查看"]),
        description: "From SYSTEM_ADMIN_IPS"
      }),
      expect.objectContaining({
        ip: "10.0.0.8",
        role: "system_admin",
        fixedRole: "系统管理员",
        source: "system",
        canDelete: false,
        permissionKeys: expect.arrayContaining(["data:clear", "audit:view"]),
        permissionScope: expect.arrayContaining(["数据清空", "审计日志查看"]),
        description: "From SYSTEM_ADMIN_IPS"
      })
    ]);
    expect(result.items.map((item) => item.fixedRole)).toEqual(["系统管理员", "系统管理员"]);
    expect(prisma.ipRoleBinding.findMany).toHaveBeenCalledWith({ orderBy: [{ updatedAt: "desc" }, { ip: "asc" }] });
  });

  it("marks persisted role bindings as deletable and exposes machine-readable roles and permissions", async () => {
    process.env.SYSTEM_ADMIN_IPS = "10.0.0.1";
    const prisma = prismaMock();
    prisma.ipRoleBinding.findMany.mockResolvedValue([
      {
        id: "binding1",
        ip: "10.0.0.9",
        role: "content_admin",
        note: "Question maintainer",
        updatedAt: new Date("2026-05-03T00:00:00.000Z")
      }
    ]);
    const service = new AdminSettingsService(prisma as never);

    const result = await service.listRoleBindings();

    expect(result.items).toEqual([
      expect.objectContaining({
        ip: "10.0.0.1",
        role: "system_admin",
        source: "system",
        canDelete: false,
        permissionKeys: expect.arrayContaining(["ip_role:write", "data:clear"])
      }),
      expect.objectContaining({
        ip: "10.0.0.9",
        role: "content_admin",
        fixedRole: "题库管理员",
        source: "binding",
        canDelete: true,
        permissionKeys: expect.arrayContaining(["question:create", "question:import", "question:export"])
      })
    ]);
  });

  it("rejects persisted system_admin role bindings and audits valid role binding changes", async () => {
    const prisma = prismaMock();
    const service = new AdminSettingsService(prisma as never);

    await expect(
      service.upsertRoleBinding({ ip: "10.0.0.9", role: "system_admin" }, { ip: "10.0.0.1", role: "system_admin" })
    ).rejects.toThrow(BadRequestException);

    const result = await service.upsertRoleBinding(
      { ip: "10.0.0.9", role: "content_admin", description: "Maintainer" },
      { ip: "10.0.0.1", role: "system_admin" }
    );

    expect(result).toMatchObject({ ip: "10.0.0.9", fixedRole: "题库管理员" });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(prisma.ipRoleBinding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ip: "10.0.0.9" },
        create: expect.objectContaining({ ip: "10.0.0.9", role: "content_admin", updatedByIp: "10.0.0.1" }),
        update: expect.objectContaining({ role: "content_admin", note: "Maintainer", updatedByIp: "10.0.0.1" })
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorIp: "10.0.0.1",
        role: "system_admin",
        action: "ip_role_upsert",
        target: "10.0.0.9",
        detail: expect.objectContaining({ role: "content_admin", result: "success" })
      })
    });
  });

  it("rolls back role binding upsert when audit creation fails inside the transaction", async () => {
    const prisma = prismaMock();
    prisma.auditLog.create.mockRejectedValueOnce(new Error("audit down"));
    const service = new AdminSettingsService(prisma as never);

    await expect(
      service.upsertRoleBinding(
        { ip: "10.0.0.9", role: "content_admin", description: "Maintainer" },
        { ip: "10.0.0.1", role: "system_admin" }
      )
    ).rejects.toThrow("audit down");

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(prisma.ipRoleBinding.upsert).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "ip_role_upsert", target: "10.0.0.9" })
    });
  });

  it("rejects upsert and delete for env system admin IPs", async () => {
    process.env.SYSTEM_ADMIN_IPS = "10.0.0.9";
    const prisma = prismaMock();
    const service = new AdminSettingsService(prisma as never);

    await expect(
      service.upsertRoleBinding(
        { ip: "10.0.0.9", role: "content_admin", description: "downgrade" },
        { ip: "10.0.0.1", role: "system_admin" }
      )
    ).rejects.toThrow(BadRequestException);
    await expect(service.deleteRoleBinding("10.0.0.9", { ip: "10.0.0.1", role: "system_admin" })).rejects.toThrow(
      BadRequestException
    );

    expect(prisma.ipRoleBinding.upsert).not.toHaveBeenCalled();
    expect(prisma.ipRoleBinding.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes role bindings with audit output", async () => {
    const prisma = prismaMock();
    const service = new AdminSettingsService(prisma as never);

    const result = await service.deleteRoleBinding("10.0.0.9", { ip: "10.0.0.1", role: "system_admin" });

    expect(result).toEqual({ deleted: true });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(prisma.ipRoleBinding.deleteMany).toHaveBeenCalledWith({ where: { ip: "10.0.0.9" } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorIp: "10.0.0.1",
        role: "system_admin",
        action: "ip_role_delete",
        target: "10.0.0.9",
        detail: { result: "success" }
      })
    });
  });

  it("rolls back role binding delete when audit creation fails inside the transaction", async () => {
    const prisma = prismaMock();
    prisma.auditLog.create.mockRejectedValueOnce(new Error("audit down"));
    const service = new AdminSettingsService(prisma as never);

    await expect(service.deleteRoleBinding("10.0.0.9", { ip: "10.0.0.1", role: "system_admin" })).rejects.toThrow(
      "audit down"
    );

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(prisma.ipRoleBinding.deleteMany).toHaveBeenCalledWith({ where: { ip: "10.0.0.9" } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "ip_role_delete", target: "10.0.0.9" })
    });
  });

  it("requires the documented confirmation phrase and writes a failed data_clear audit without deleting data", async () => {
    const prisma = prismaMock();
    const service = new AdminSettingsService(prisma as never);

    await expect(
      service.clearData({ scope: "activity", confirmationPhrase: "wrong" }, { ip: "10.0.0.1", role: "system_admin" })
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorIp: "10.0.0.1",
        role: "system_admin",
        action: "data_clear",
        target: "activity",
        detail: { scope: "activity", result: "rejected", reason: "confirmation_phrase_mismatch" }
      })
    });
  });

  it("clears activity transactionally while preserving visitors and audit history", async () => {
    const prisma = prismaMock();
    const service = new AdminSettingsService(prisma as never);

    const result = await service.clearData(
      { scope: "activity", confirmationPhrase: DATA_CLEAR_CONFIRMATION_PHRASE },
      { ip: "10.0.0.1", role: "system_admin" }
    );

    expect(result).toEqual({ scope: "activity", result: "success", dbResult: "success" });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(prisma.bookmark.deleteMany).toHaveBeenCalled();
    expect(prisma.mistake.deleteMany).toHaveBeenCalled();
    expect(prisma.practiceAttempt.deleteMany).toHaveBeenCalled();
    expect(prisma.examAttempt.deleteMany).toHaveBeenCalled();
    expect(prisma.visitor.deleteMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "data_clear",
        target: "activity",
        detail: expect.objectContaining({ scope: "activity", result: "success" })
      })
    });
  });

  it("accepts the Chinese UI confirmation phrase for data clear", async () => {
    const prisma = prismaMock();
    const service = new AdminSettingsService(prisma as never);

    const result = await service.clearData(
      { scope: "activity", confirmationPhrase: "确认清空" },
      { ip: "10.0.0.1", role: "system_admin" }
    );

    expect(result).toEqual({ scope: "activity", result: "success", dbResult: "success" });
    expect(prisma.examAttempt.deleteMany).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "data_clear",
        target: "activity",
        detail: expect.objectContaining({ scope: "activity", result: "success" })
      })
    });
  });

  it("clears questions and required question-bound records without clearing exam history, visitors, or role bindings", async () => {
    const questionDir = join(uploadRoot, "questions", "202605");
    await writeFileSafe(join(questionDir, "image.png"), "image");
    const prisma = prismaMock();
    const service = new AdminSettingsService(prisma as never);

    await service.clearData(
      { scope: "questions", confirmationPhrase: DATA_CLEAR_CONFIRMATION_PHRASE },
      { ip: "10.0.0.1", role: "system_admin" }
    );

    expect(prisma.practiceAttempt.deleteMany).toHaveBeenCalled();
    expect(prisma.bookmark.deleteMany).toHaveBeenCalled();
    expect(prisma.mistake.deleteMany).toHaveBeenCalled();
    expect(prisma.question.deleteMany).toHaveBeenCalled();
    expect(prisma.examAttempt.deleteMany).not.toHaveBeenCalled();
    expect(prisma.ipRoleBinding.deleteMany).not.toHaveBeenCalled();
    expect(prisma.visitor.deleteMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "data_clear",
        target: "questions",
        detail: expect.objectContaining({
          scope: "questions",
          result: "success",
          dbResult: "success",
          fileResult: "success",
          deletedQuestionBoundRecords: ["bookmarks", "mistakes", "practiceAttempts"]
        })
      })
    });
    await expect(readdir(resolve(uploadRoot, "questions"))).rejects.toThrow();
  });

  it("returns and audits partial_success when question upload deletion fails after database clear", async () => {
    const prisma = prismaMock();
    const removeQuestionUploads = jest.fn<ReturnType<QuestionUploadRemover>, Parameters<QuestionUploadRemover>>().mockRejectedValue(
      new Error("delete failed")
    );
    const service = new AdminSettingsService(prisma as never, undefined, removeQuestionUploads);

    const result = await service.clearData(
      { scope: "questions", confirmationPhrase: DATA_CLEAR_CONFIRMATION_PHRASE },
      { ip: "10.0.0.1", role: "system_admin" }
    );

    expect(result).toEqual({
      scope: "questions",
      result: "partial_success",
      dbResult: "success",
      fileResult: "failed",
      fileError: "delete failed",
      deletedQuestionBoundRecords: ["bookmarks", "mistakes", "practiceAttempts"]
    });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "data_clear",
        target: "questions",
        detail: expect.objectContaining({
          scope: "questions",
          result: "partial_success",
          dbResult: "success",
          fileResult: "failed",
          fileError: "delete failed"
        })
      })
    });
  });

  it("does not clear data when audit creation fails inside the clear transaction", async () => {
    const prisma = prismaMock();
    prisma.auditLog.create.mockRejectedValueOnce(new Error("audit down"));
    const service = new AdminSettingsService(prisma as never);

    await expect(
      service.clearData(
        { scope: "activity", confirmationPhrase: DATA_CLEAR_CONFIRMATION_PHRASE },
        { ip: "10.0.0.1", role: "system_admin" }
      )
    ).rejects.toThrow("audit down");

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(prisma.examAttempt.deleteMany).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "data_clear",
        target: "activity",
        detail: expect.objectContaining({ scope: "activity", result: "success", dbResult: "success" })
      })
    });
  });

  it("clears all P0 data including role bindings but still preserves visitors and audit history", async () => {
    const prisma = prismaMock();
    const service = new AdminSettingsService(prisma as never);

    await service.clearData(
      { scope: "all", confirmationPhrase: DATA_CLEAR_CONFIRMATION_PHRASE },
      { ip: "10.0.0.1", role: "system_admin" }
    );

    expect(prisma.ipRoleBinding.deleteMany).toHaveBeenCalled();
    expect(prisma.question.deleteMany).toHaveBeenCalled();
    expect(prisma.visitor.deleteMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });
});

async function writeFileSafe(path: string, content: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

interface PrismaMock {
  ipRoleBinding: { findMany: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
  bookmark: { deleteMany: jest.Mock };
  mistake: { deleteMany: jest.Mock };
  practiceAttempt: { deleteMany: jest.Mock };
  examAttempt: { deleteMany: jest.Mock };
  question: { deleteMany: jest.Mock };
  visitor: { deleteMany: jest.Mock };
  auditLog: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock; deleteMany: jest.Mock };
  $transaction: jest.Mock;
}

function prismaMock(): PrismaMock {
  const prisma: PrismaMock = {
    ipRoleBinding: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockImplementation(({ create }) =>
        Promise.resolve({ id: "binding1", note: create.note, updatedAt: new Date("2026-05-03T00:00:00.000Z"), ...create })
      ),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 })
    },
    bookmark: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    mistake: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    practiceAttempt: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    examAttempt: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    question: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    visitor: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 })
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma))
  };
  return prisma;
}
