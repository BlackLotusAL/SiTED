import { BadRequestException } from "@nestjs/common";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzleMock } from "../testing/drizzle-mock";
import {
  AdminSettingsService,
  DATA_CLEAR_CONFIRMATION_PHRASE,
  UI_DATA_CLEAR_CONFIRMATION_PHRASE,
  type QuestionUploadRemover
} from "./admin-settings.service";

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

  it("lists role bindings with system-admin entries from env and persisted bindings from the database", async () => {
    process.env.SYSTEM_ADMIN_IPS = "10.0.0.1,10.0.0.8,10.0.0.8";
    const db = drizzleMock({ select: [[bindingRecord({ ip: "10.0.0.9", note: "Question maintainer" })]] });
    const service = new AdminSettingsService(db.service as never);

    const result = await service.listRoleBindings();

    expect(result.headers).toEqual(["IP", "fixed role", "permission scope", "description", "updated time"]);
    expect(result.items).toHaveLength(3);
    expect(result.items).toEqual([
      expect.objectContaining({ ip: "10.0.0.1", role: "system_admin", source: "system", canDelete: false }),
      expect.objectContaining({ ip: "10.0.0.8", role: "system_admin", source: "system", canDelete: false }),
      expect.objectContaining({
        ip: "10.0.0.9",
        role: "content_admin",
        source: "binding",
        canDelete: true,
        permissionKeys: expect.arrayContaining(["question:create", "question:import", "question:export"])
      })
    ]);
    expect(db.client.select).toHaveBeenCalledTimes(1);
  });

  it("rejects persisted system_admin role bindings and audits valid role binding changes", async () => {
    const db = drizzleMock({
      insert: [[bindingRecord({ ip: "10.0.0.9", note: "Maintainer" })], [{ id: "audit1" }]]
    });
    const service = new AdminSettingsService(db.service as never);

    await expect(
      service.upsertRoleBinding({ ip: "10.0.0.9", role: "system_admin" }, { ip: "10.0.0.1", role: "system_admin" })
    ).rejects.toThrow(BadRequestException);

    const result = await service.upsertRoleBinding(
      { ip: "10.0.0.9", role: "content_admin", description: "Maintainer" },
      { ip: "10.0.0.1", role: "system_admin" }
    );

    expect(result).toMatchObject({ ip: "10.0.0.9", role: "content_admin", source: "binding" });
    expect(db.client.transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(insertValues(db, 0)).toEqual(expect.objectContaining({ ip: "10.0.0.9", role: "content_admin", updatedByIp: "10.0.0.1" }));
    expect(insertValues(db, 1)).toEqual(
      expect.objectContaining({
        actorIp: "10.0.0.1",
        role: "system_admin",
        action: "ip_role_upsert",
        target: "10.0.0.9",
        detail: expect.objectContaining({ role: "content_admin", result: "success" })
      })
    );
  });

  it("rolls back role binding upsert when audit creation fails inside the transaction", async () => {
    const db = drizzleMock({
      insert: [[bindingRecord({ ip: "10.0.0.9", note: "Maintainer" })], new Error("audit down")]
    });
    const service = new AdminSettingsService(db.service as never);

    await expect(
      service.upsertRoleBinding(
        { ip: "10.0.0.9", role: "content_admin", description: "Maintainer" },
        { ip: "10.0.0.1", role: "system_admin" }
      )
    ).rejects.toThrow("audit down");

    expect(db.client.transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(db.client.insert).toHaveBeenCalledTimes(2);
  });

  it("rejects upsert and delete for env system admin IPs", async () => {
    process.env.SYSTEM_ADMIN_IPS = "10.0.0.9";
    const db = drizzleMock();
    const service = new AdminSettingsService(db.service as never);

    await expect(
      service.upsertRoleBinding(
        { ip: "10.0.0.9", role: "content_admin", description: "downgrade" },
        { ip: "10.0.0.1", role: "system_admin" }
      )
    ).rejects.toThrow(BadRequestException);
    await expect(service.deleteRoleBinding("10.0.0.9", { ip: "10.0.0.1", role: "system_admin" })).rejects.toThrow(
      BadRequestException
    );

    expect(db.client.insert).not.toHaveBeenCalled();
    expect(db.client.delete).not.toHaveBeenCalled();
  });

  it("deletes role bindings with audit output", async () => {
    const db = drizzleMock({ delete: [[]], insert: [[{ id: "audit1" }]] });
    const service = new AdminSettingsService(db.service as never);

    const result = await service.deleteRoleBinding("10.0.0.9", { ip: "10.0.0.1", role: "system_admin" });

    expect(result).toEqual({ deleted: true });
    expect(db.client.transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(db.client.delete).toHaveBeenCalledTimes(1);
    expect(insertValues(db, 0)).toEqual(expect.objectContaining({ action: "ip_role_delete", target: "10.0.0.9" }));
  });

  it("rolls back role binding delete when audit creation fails inside the transaction", async () => {
    const db = drizzleMock({ delete: [[]], insert: [new Error("audit down")] });
    const service = new AdminSettingsService(db.service as never);

    await expect(service.deleteRoleBinding("10.0.0.9", { ip: "10.0.0.1", role: "system_admin" })).rejects.toThrow(
      "audit down"
    );

    expect(db.client.transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(db.client.delete).toHaveBeenCalledTimes(1);
    expect(db.client.insert).toHaveBeenCalledTimes(1);
  });

  it("requires the documented confirmation phrase and writes a failed data_clear audit without deleting data", async () => {
    const db = drizzleMock({ insert: [[{ id: "audit1" }]] });
    const service = new AdminSettingsService(db.service as never);

    await expect(
      service.clearData({ scope: "activity", confirmationPhrase: "wrong" }, { ip: "10.0.0.1", role: "system_admin" })
    ).rejects.toThrow(BadRequestException);

    expect(db.client.transaction).not.toHaveBeenCalled();
    expect(insertValues(db, 0)).toEqual(
      expect.objectContaining({
        action: "data_clear",
        target: "activity",
        detail: { scope: "activity", result: "rejected", reason: "confirmation_phrase_mismatch" }
      })
    );
  });

  it("clears activity transactionally while preserving visitors and audit history", async () => {
    const db = drizzleMock({ delete: [[], [], [], []], insert: [[{ id: "audit1" }]] });
    const service = new AdminSettingsService(db.service as never);

    const result = await service.clearData(
      { scope: "activity", confirmationPhrase: DATA_CLEAR_CONFIRMATION_PHRASE },
      { ip: "10.0.0.1", role: "system_admin" }
    );

    expect(result).toEqual({ scope: "activity", result: "success", dbResult: "success" });
    expect(db.client.transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(db.client.delete).toHaveBeenCalledTimes(4);
    expect(insertValues(db, 0)).toEqual(expect.objectContaining({ action: "data_clear", target: "activity" }));
  });

  it("accepts the Chinese UI confirmation phrase for data clear", async () => {
    const db = drizzleMock({ delete: [[], [], [], []], insert: [[{ id: "audit1" }]] });
    const service = new AdminSettingsService(db.service as never);

    const result = await service.clearData(
      { scope: "activity", confirmationPhrase: UI_DATA_CLEAR_CONFIRMATION_PHRASE },
      { ip: "10.0.0.1", role: "system_admin" }
    );

    expect(result).toEqual({ scope: "activity", result: "success", dbResult: "success" });
    expect(db.client.delete).toHaveBeenCalledTimes(4);
  });

  it("clears questions and required question-bound records without clearing exam history", async () => {
    const questionDir = join(uploadRoot, "questions", "202605");
    await writeFileSafe(join(questionDir, "image.png"), "image");
    const db = drizzleMock({ delete: [[], [], [], []], insert: [[{ id: "audit1" }]] });
    const service = new AdminSettingsService(db.service as never);

    await service.clearData(
      { scope: "questions", confirmationPhrase: DATA_CLEAR_CONFIRMATION_PHRASE },
      { ip: "10.0.0.1", role: "system_admin" }
    );

    expect(db.client.delete).toHaveBeenCalledTimes(4);
    expect(insertValues(db, 0)).toEqual(
      expect.objectContaining({
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
    );
    await expect(readdir(resolve(uploadRoot, "questions"))).rejects.toThrow();
  });

  it("returns and audits partial_success when question upload deletion fails after database clear", async () => {
    const db = drizzleMock({ delete: [[], [], [], []], insert: [[{ id: "audit1" }]] });
    const removeQuestionUploads = jest.fn<ReturnType<QuestionUploadRemover>, Parameters<QuestionUploadRemover>>().mockRejectedValue(
      new Error("delete failed")
    );
    const service = new AdminSettingsService(db.service as never, undefined, removeQuestionUploads);

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
    expect(insertValues(db, 0)).toEqual(
      expect.objectContaining({
        action: "data_clear",
        target: "questions",
        detail: expect.objectContaining({ result: "partial_success", fileError: "delete failed" })
      })
    );
  });

  it("does not clear data when audit creation fails inside the clear transaction", async () => {
    const db = drizzleMock({ delete: [[], [], [], []], insert: [new Error("audit down"), [{ id: "failed-audit" }]] });
    const service = new AdminSettingsService(db.service as never);

    await expect(
      service.clearData(
        { scope: "activity", confirmationPhrase: DATA_CLEAR_CONFIRMATION_PHRASE },
        { ip: "10.0.0.1", role: "system_admin" }
      )
    ).rejects.toThrow("audit down");

    expect(db.client.transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(db.client.delete).toHaveBeenCalledTimes(4);
    expect(db.client.insert).toHaveBeenCalledTimes(2);
  });

  it("clears all P0 data including role bindings while still preserving visitors and audit history", async () => {
    const db = drizzleMock({ delete: [[], [], [], [], [], []], insert: [[{ id: "audit1" }]] });
    const service = new AdminSettingsService(db.service as never);

    await service.clearData(
      { scope: "all", confirmationPhrase: DATA_CLEAR_CONFIRMATION_PHRASE },
      { ip: "10.0.0.1", role: "system_admin" }
    );

    expect(db.client.delete).toHaveBeenCalledTimes(6);
    expect(insertValues(db, 0)).toEqual(expect.objectContaining({ action: "data_clear", target: "all" }));
  });
});

async function writeFileSafe(path: string, content: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

function bindingRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "binding1",
    ip: "10.0.0.9",
    role: "content_admin",
    note: "Question maintainer",
    updatedByIp: "10.0.0.1",
    createdAt: new Date("2026-05-03T00:00:00.000Z"),
    updatedAt: new Date("2026-05-03T00:00:00.000Z"),
    ...overrides
  };
}

function insertValues(db: ReturnType<typeof drizzleMock>, index: number) {
  return (db.client.insert.mock.results[index].value as { values: jest.Mock }).values.mock.calls[0][0];
}
