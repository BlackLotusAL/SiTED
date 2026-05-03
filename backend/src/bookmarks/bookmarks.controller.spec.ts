import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { BookmarksController } from "./bookmarks.controller";
import { BookmarksService } from "./bookmarks.service";

describe("BookmarksController HTTP", () => {
  it("rejects invalid bookmark question UUIDs before reaching the service", async () => {
    const service = bookmarksServiceMock();
    const app = await createApp(service, true);

    try {
      const response = await fetchJson(app, "/api/bookmarks/not-a-uuid", { method: "POST" });

      expect(response.status).toBe(400);
      expect(service.add).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("fails closed when request identity is missing", async () => {
    const service = bookmarksServiceMock();
    const app = await createApp(service, false);

    try {
      const response = await fetchJson(app, `/api/bookmarks/${questionId()}`, { method: "DELETE" });

      expect(response.status).toBe(500);
      expect(service.remove).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});

async function createApp(service: ReturnType<typeof bookmarksServiceMock>, withIdentity: boolean): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [BookmarksController],
    providers: [{ provide: BookmarksService, useValue: service }]
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

async function fetchJson(app: INestApplication, path: string, init: { method: string }) {
  const server = app.getHttpServer() as { address: () => { port: number } };
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: init.method });
  return {
    status: response.status,
    body: await response.json()
  };
}

function bookmarksServiceMock() {
  return {
    add: jest.fn().mockResolvedValue({ id: "b1" }),
    remove: jest.fn().mockResolvedValue({ deleted: true })
  };
}

function questionId() {
  return "11111111-1111-4111-8111-111111111111";
}
