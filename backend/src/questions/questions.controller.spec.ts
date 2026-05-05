import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { QuestionsController } from "./questions.controller";
import { QuestionsService } from "./questions.service";

describe("QuestionsController HTTP", () => {
  it("serves public list and detail routes through /api/questions", async () => {
    const service = {
      listPublic: jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 }),
      getPublicDetail: jest.fn().mockResolvedValue({ id: "q1", stemHtml: "<p>safe</p>" }),
      getReciteDetail: jest.fn().mockResolvedValue({ id: "q1", stemHtml: "<p>safe</p>", correctAnswers: ["A"] })
    };
    const app = await createApp(service);

    try {
      const list = await fetchJson(app, "/api/questions?subject=programming&page=1");
      const detail = await fetchJson(app, "/api/questions/q1");
      const recite = await fetchJson(app, "/api/questions/q1/recite");

      expect(list.status).toBe(200);
      expect(service.listPublic).toHaveBeenCalledWith(expect.objectContaining({ subject: "programming", page: "1" }));
      expect(detail.status).toBe(200);
      expect(detail.body).toMatchObject({ id: "q1", stemHtml: "<p>safe</p>" });
      expect(recite.status).toBe(200);
      expect(service.getReciteDetail).toHaveBeenCalledWith("q1");
      expect(recite.body).toMatchObject({ id: "q1", correctAnswers: ["A"] });
    } finally {
      await app.close();
    }
  });
});

async function createApp(service: Partial<QuestionsService>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [QuestionsController],
    providers: [{ provide: QuestionsService, useValue: service }]
  }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
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
