import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PracticeController } from "./practice.controller";
import { PracticeService } from "./practice.service";

describe("PracticeController HTTP", () => {
  it("rejects invalid practice question UUIDs before reaching the service", async () => {
    const service = practiceServiceMock();
    const app = await createApp(service, true);

    try {
      const response = await fetchJson(app, "/api/practice/submit", {
        method: "POST",
        body: { questionId: "not-a-uuid", submittedAnswers: ["A"] }
      });

      expect(response.status).toBe(400);
      expect(service.submit).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("fails closed when request identity is missing", async () => {
    const service = practiceServiceMock();
    const app = await createApp(service, false);

    try {
      const response = await fetchJson(app, "/api/practice/submit", {
        method: "POST",
        body: { questionId: questionId(), submittedAnswers: ["A"] }
      });

      expect(response.status).toBe(500);
      expect(service.submit).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});

async function createApp(service: ReturnType<typeof practiceServiceMock>, withIdentity: boolean): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [PracticeController],
    providers: [{ provide: PracticeService, useValue: service }]
  }).compile();
  const app = moduleRef.createNestApplication();
  if (withIdentity) {
    app.use((request: { identity?: unknown }, _response: unknown, next: () => void) => {
      request.identity = { ip: "10.0.0.5", role: "learner", roleLabel: "learner", permissions: [] };
      next();
    });
  }
  app.setGlobalPrefix("api");
  await app.listen(0);
  return app;
}

async function fetchJson(app: INestApplication, path: string, init: { method: string; body: unknown }) {
  const server = app.getHttpServer() as { address: () => { port: number } };
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method: init.method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(init.body)
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

function practiceServiceMock() {
  return {
    submit: jest.fn().mockResolvedValue({ attemptId: "a1" })
  };
}

function questionId() {
  return "11111111-1111-4111-8111-111111111111";
}
