import { INestApplication, Module, NestMiddleware } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NextFunction, Request, Response } from "express";
import { AuditService } from "../audit/audit.service";
import { DbService } from "../db/db.service";
import type { Role } from "../domain/constants";
import { IdentityModule } from "../identity/identity.module";
import { QuestionsService } from "../questions/questions.service";
import { drizzleMock } from "../testing/drizzle-mock";
import { AdminQuestionsController } from "./admin-questions.controller";
import { ImportExportService } from "./import-export.service";

describe("AdminQuestionsController HTTP", () => {
  it("requires content admin role for admin question APIs", async () => {
    const app = await createApp("learner");

    try {
      const response = await fetchJson(app, "/api/admin/questions");

      expect(response.status).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("routes admin list, update, publish, archive, import, and export APIs for content admins", async () => {
    const questionsService = questionsServiceMock();
    const importExportService = importExportServiceMock();
    const app = await createApp("content_admin", questionsService, importExportService);

    try {
      expect((await fetchJson(app, "/api/admin/questions?status=draft")).status).toBe(200);
      expect((await fetchJson(app, "/api/admin/questions/q1", { method: "PATCH", body: { memo: "new" } })).status).toBe(200);
      expect((await fetchJson(app, "/api/admin/questions/q1/publish", { method: "POST" })).status).toBe(201);
      expect((await fetchJson(app, "/api/admin/questions/q1/archive", { method: "POST" })).status).toBe(201);
      expect((await fetchJson(app, "/api/admin/questions/import/validate", { method: "POST", body: { version: "1.0", questions: [] } })).status).toBe(201);
      expect((await fetchJson(app, "/api/admin/questions/import/commit", { method: "POST", body: { version: "1.0", questions: [] } })).status).toBe(201);
      expect((await fetchJson(app, "/api/admin/questions/export?status=published")).status).toBe(200);

      expect(questionsService.listAdmin).toHaveBeenCalledWith(expect.objectContaining({ status: "draft" }));
      expect(questionsService.updateAdmin).toHaveBeenCalledWith("q1", { memo: "new" });
      expect(questionsService.publishAdmin).toHaveBeenCalledWith("q1");
      expect(questionsService.archiveAdmin).toHaveBeenCalledWith("q1");
      expect(importExportService.commitImport).toHaveBeenCalledWith(expect.anything(), {
        actorIp: "10.0.0.5",
        role: "content_admin"
      });
    } finally {
      await app.close();
    }
  });

  it("does not fail successful admin question writes when best-effort audit logging fails", async () => {
    const questionsService = questionsServiceMock();
    const auditService = { record: jest.fn().mockRejectedValue(new Error("audit down")) };
    const app = await createApp("content_admin", questionsService, importExportServiceMock(), auditService);

    try {
      const response = await fetchJson(app, "/api/admin/questions/q1", { method: "PATCH", body: { memo: "new" } });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: "q1" });
      expect(questionsService.updateAdmin).toHaveBeenCalledWith("q1", { memo: "new" });
      expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "question_update", target: "q1" }));
    } finally {
      await app.close();
    }
  });
});

@Module({})
class TestModule {}

class IdentityTestMiddleware implements NestMiddleware {
  constructor(private readonly role: Role) {}

  use(req: Request & { identity?: unknown }, _res: Response, next: NextFunction): void {
    req.identity = { ip: "10.0.0.5", role: this.role, roleLabel: this.role, permissions: [] };
    next();
  }
}

async function createApp(
  role: Role,
  questionsService = questionsServiceMock(),
  importExportService = importExportServiceMock(),
  auditService = { record: jest.fn().mockResolvedValue({}) }
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [IdentityModule, TestModule],
    controllers: [AdminQuestionsController],
    providers: [
      { provide: QuestionsService, useValue: questionsService },
      { provide: ImportExportService, useValue: importExportService },
      { provide: AuditService, useValue: auditService }
    ]
  })
    .overrideProvider(DbService)
    .useValue(drizzleMock().service)
    .compile();
  const app = moduleRef.createNestApplication();
  app.use(new IdentityTestMiddleware(role).use.bind(new IdentityTestMiddleware(role)));
  app.setGlobalPrefix("api");
  await app.listen(0);
  return app;
}

async function fetchJson(app: INestApplication, path: string, init: { method?: string; body?: unknown } = {}) {
  const server = app.getHttpServer() as { address: () => { port: number } };
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method: init.method,
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

function questionsServiceMock() {
  return {
    listAdmin: jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 }),
    createAdmin: jest.fn().mockResolvedValue({ id: "q1" }),
    getAdminDetail: jest.fn().mockResolvedValue({ id: "q1" }),
    updateAdmin: jest.fn().mockResolvedValue({ id: "q1" }),
    publishAdmin: jest.fn().mockResolvedValue({ id: "q1", status: "published" }),
    archiveAdmin: jest.fn().mockResolvedValue({ id: "q1", status: "archived" })
  };
}

function importExportServiceMock() {
  return {
    validateImport: jest.fn().mockResolvedValue({ valid: false, errors: [] }),
    commitImport: jest.fn().mockResolvedValue({ importedCount: 0 }),
    exportQuestions: jest.fn().mockResolvedValue({ version: "1.0", questions: [] })
  };
}
