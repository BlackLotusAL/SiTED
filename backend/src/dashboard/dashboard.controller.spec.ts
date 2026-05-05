import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NextFunction, Request, Response } from "express";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

describe("DashboardController HTTP", () => {
  it("serves learner dashboard summary through /api/dashboard", async () => {
    const service = {
      getSummary: jest.fn().mockResolvedValue({
        today: { answered: 0, correct: 0, incorrect: 0, correctRate: 0 },
        mistakes: { unmastered: 0 },
        latestExam: null,
        calendar: { year: 2026, month: 5, total: 0, days: [] },
        coverage: []
      })
    };
    const app = await createApp(service);

    try {
      const response = await fetchJson(app, "/api/dashboard");

      expect(response.status).toBe(200);
      expect(service.getSummary).toHaveBeenCalledWith(expect.objectContaining({ ip: "10.42.11.10", role: "learner" }));
      expect(response.body).toMatchObject({ today: { answered: 0 }, latestExam: null });
    } finally {
      await app.close();
    }
  });
});

async function createApp(service: Partial<DashboardService>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [DashboardController],
    providers: [{ provide: DashboardService, useValue: service }]
  }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  app.use((request: Request & { identity?: unknown }, _response: Response, next: NextFunction) => {
    request.identity = {
      ip: "10.42.11.10",
      role: "learner",
      roleLabel: "learner",
      permissions: []
    };
    next();
  });
  await app.listen(0);
  return app;
}

async function fetchJson(app: INestApplication, path: string): Promise<{ status: number; body: unknown }> {
  const server = app.getHttpServer() as { address: () => { port: number } };
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
  return {
    status: response.status,
    body: await response.json()
  };
}
