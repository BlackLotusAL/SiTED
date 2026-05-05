import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ReviewController } from "./review.controller";
import { ReviewService } from "./review.service";

describe("ReviewController HTTP", () => {
  it("rejects invalid mistake UUIDs before reaching the service", async () => {
    const service = reviewServiceMock();
    const app = await createApp(service, true);

    try {
      const response = await fetchJson(app, "/api/review/mistakes/not-a-uuid", {
        method: "PATCH",
        body: { isMastered: true }
      });

      expect(response.status).toBe(400);
      expect(service.updateMistakeMastery).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("routes mastery updates and mistake deletion with request identity", async () => {
    const service = reviewServiceMock();
    const app = await createApp(service, true);

    try {
      const patchResponse = await fetchJson(app, `/api/review/mistakes/${mistakeId()}`, {
        method: "PATCH",
        body: { isMastered: true }
      });
      const deleteResponse = await fetchJson(app, `/api/review/mistakes/${mistakeId()}`, {
        method: "DELETE"
      });

      expect(patchResponse.status).toBe(200);
      expect(deleteResponse.status).toBe(200);
      expect(service.updateMistakeMastery).toHaveBeenCalledWith(
        mistakeId(),
        { isMastered: true },
        expect.objectContaining({ ip: "10.0.0.5" })
      );
      expect(service.removeMistake).toHaveBeenCalledWith(mistakeId(), expect.objectContaining({ ip: "10.0.0.5" }));
    } finally {
      await app.close();
    }
  });

  it("fails closed when request identity is missing for mutation endpoints", async () => {
    const service = reviewServiceMock();
    const app = await createApp(service, false);

    try {
      const response = await fetchJson(app, `/api/review/mistakes/${mistakeId()}`, {
        method: "DELETE"
      });

      expect(response.status).toBe(500);
      expect(service.removeMistake).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});

async function createApp(service: ReturnType<typeof reviewServiceMock>, withIdentity: boolean): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ReviewController],
    providers: [{ provide: ReviewService, useValue: service }]
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

async function fetchJson(app: INestApplication, path: string, init: { method: string; body?: unknown }) {
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

function reviewServiceMock() {
  return {
    listMistakes: jest.fn().mockResolvedValue({ items: [] }),
    listBookmarks: jest.fn().mockResolvedValue({ items: [] }),
    listRecords: jest.fn().mockResolvedValue({ items: [] }),
    updateMistakeMastery: jest.fn().mockResolvedValue({ id: "m1" }),
    removeMistake: jest.fn().mockResolvedValue({ deleted: true })
  };
}

function mistakeId() {
  return "11111111-1111-4111-8111-111111111111";
}
