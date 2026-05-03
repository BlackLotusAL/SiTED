import { BadRequestException } from "@nestjs/common";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AdminSettingsService, DATA_CLEAR_CONFIRMATION_PHRASE } from "./admin-settings.service";

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
    process.env.SYSTEM_ADMIN_IPS = "10.0.0.1";
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
    expect(result.items).toEqual([
      expect.objectContaining({
        ip: "10.0.0.1",
        role: "system_admin",
        roleLabel: "System admin",
        permissions: expect.arrayContaining(["Clear data", "View audit logs"]),
        description: "From SYSTEM_ADMIN_IPS"
      }),
      expect.objectContaining({
        ip: "10.0.0.8",
        role: "content_admin",
        roleLabel: "Content admin",
        permissions: expect.arrayContaining(["Create questions", "Import questions", "View basic stats"]),
        description: "Question maintainer"
      })
    ]);
    expect(prisma.ipRoleBinding.findMany).toHaveBeenCalledWith({ orderBy: [{ updatedAt: "desc" }, { ip: "asc" }] });
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

    expect(result).toMatchObject({ ip: "10.0.0.9", role: "content_admin", roleLabel: "Content admin" });
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

  it("deletes role bindings with audit output", async () => {
    const prisma = prismaMock();
    const service = new AdminSettingsService(prisma as never);

    const result = await service.deleteRoleBinding("10.0.0.9", { ip: "10.0.0.1", role: "system_admin" });

    expect(result).toEqual({ deleted: true });
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

    expect(result).toEqual({ scope: "activity", result: "success" });
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

  it("clears questions after dependent activity, deletes only files under the question upload root, and keeps visitors", async () => {
    const questionDir = join(uploadRoot, "questions", "202605");
    await writeFileSafe(join(questionDir, "image.png"), "image");
    const prisma = prismaMock();
    const service = new AdminSettingsService(prisma as never);

    await service.clearData(
      { scope: "questions", confirmationPhrase: DATA_CLEAR_CONFIRMATION_PHRASE },
      { ip: "10.0.0.1", role: "system_admin" }
    );

    expect(prisma.practiceAttempt.deleteMany).toHaveBeenCalled();
    expect(prisma.question.deleteMany).toHaveBeenCalled();
    expect(prisma.visitor.deleteMany).not.toHaveBeenCalled();
    await expect(readdir(resolve(uploadRoot, "questions"))).rejects.toThrow();
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
  auditLog: { create: jest.Mock; findMany: jest.Mock; deleteMany: jest.Mock };
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
      deleteMany: jest.fn().mockResolvedValue({ count: 1 })
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma))
  };
  return prisma;
}
