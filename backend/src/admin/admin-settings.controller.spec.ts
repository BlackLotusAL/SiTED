import { INestApplication, Module, NestMiddleware } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NextFunction, Request, Response } from "express";
import { DbService } from "../db/db.service";
import type { Role } from "../domain/constants";
import { IdentityModule } from "../identity/identity.module";
import { drizzleMock } from "../testing/drizzle-mock";
import { AdminSettingsController } from "./admin-settings.controller";
import { AdminSettingsService } from "./admin-settings.service";

describe("AdminSettingsController HTTP", () => {
  it("requires system_admin for settings, data clear, and audit log endpoints", async () => {
    const learnerApp = await createApp("learner");
    const contentAdminApp = await createApp("content_admin");
    const systemAdminApp = await createApp("system_admin");

    try {
      expect((await fetchJson(learnerApp, "/api/admin/settings/ip-role-bindings")).status).toBe(403);
      expect((await fetchJson(contentAdminApp, "/api/admin/settings/ip-role-bindings")).status).toBe(403);
      expect((await fetchJson(contentAdminApp, "/api/admin/audit-logs")).status).toBe(403);
      expect((await fetchJson(contentAdminApp, "/api/admin/settings/data-clear", { method: "POST", body: {} })).status).toBe(403);

      expect((await fetchJson(systemAdminApp, "/api/admin/settings/ip-role-bindings")).status).toBe(200);
      expect((await fetchJson(systemAdminApp, "/api/admin/audit-logs")).status).toBe(200);
    } finally {
      await learnerApp.close();
      await contentAdminApp.close();
      await systemAdminApp.close();
    }
  });

  it("serves PRD admin IP role and data clear paths", async () => {
    const app = await createApp("system_admin");

    try {
      expect((await fetchJson(app, "/api/admin/ip-roles")).status).toBe(200);
      expect((await fetchJson(app, "/api/admin/ip-roles/10.0.0.8", { method: "PUT", body: { role: "content_admin" } })).status).toBe(
        200
      );
      expect((await fetchJson(app, "/api/admin/data/clear", { method: "POST", body: { scope: "activity" } })).status).toBe(201);
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
    req.identity = { ip: "10.0.0.1", role: this.role, roleLabel: this.role, permissions: [] };
    next();
  }
}

async function createApp(role: Role): Promise<INestApplication> {
  const settingsService = {
    listRoleBindings: jest.fn().mockResolvedValue({ headers: [], items: [] }),
    upsertRoleBinding: jest.fn().mockResolvedValue({}),
    deleteRoleBinding: jest.fn().mockResolvedValue({ deleted: true }),
    clearData: jest.fn().mockResolvedValue({ scope: "activity", result: "success" }),
    listAuditLogs: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 })
  };
  const moduleRef = await Test.createTestingModule({
    imports: [IdentityModule, TestModule],
    controllers: [AdminSettingsController],
    providers: [{ provide: AdminSettingsService, useValue: settingsService }]
  })
    .overrideProvider(DbService)
    .useValue(drizzleMock().service)
    .compile();
  const app = moduleRef.createNestApplication();
  const middleware = new IdentityTestMiddleware(role);
  app.use(middleware.use.bind(middleware));
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
