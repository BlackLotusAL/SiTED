import { INestApplication, Module, NestMiddleware } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NextFunction, Request, Response } from "express";
import { IdentityModule } from "../identity/identity.module";
import { PrismaService } from "../prisma/prisma.service";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

describe("UploadsController HTTP", () => {
  it("denies learners and allows content admins for question uploads", async () => {
    const learnerApp = await createApp("learner");
    const adminApp = await createApp("content_admin");

    try {
      expect((await postUpload(learnerApp)).status).toBe(403);
      const response = await postUpload(adminApp);
      expect(response.status).toBe(201);
      expect(response.body).toEqual({ url: "/uploads/questions/202605/test.png" });
    } finally {
      await learnerApp.close();
      await adminApp.close();
    }
  });
});

@Module({})
class TestModule {}

class IdentityTestMiddleware implements NestMiddleware {
  constructor(private readonly role: "learner" | "content_admin") {}

  use(req: Request & { identity?: unknown }, _res: Response, next: NextFunction): void {
    req.identity = { ip: "10.0.0.5", role: this.role, roleLabel: this.role, permissions: [] };
    next();
  }
}

async function createApp(role: "learner" | "content_admin"): Promise<INestApplication> {
  const uploadService = {
    saveQuestionImage: jest.fn().mockResolvedValue({ url: "/uploads/questions/202605/test.png" })
  };
  const moduleRef = await Test.createTestingModule({
    imports: [IdentityModule, TestModule],
    controllers: [UploadsController],
    providers: [{ provide: UploadsService, useValue: uploadService }]
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock())
    .compile();
  const app = moduleRef.createNestApplication();
  app.use(new IdentityTestMiddleware(role).use.bind(new IdentityTestMiddleware(role)));
  app.setGlobalPrefix("api");
  await app.listen(0);
  return app;
}

async function postUpload(app: INestApplication): Promise<{ status: number; body: unknown }> {
  const server = app.getHttpServer() as { address: () => { port: number } };
  const form = new FormData();
  form.append("file", new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }), "image.png");
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/uploads/questions`, {
    method: "POST",
    body: form
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

function prismaMock() {
  return {
    ipRoleBinding: {
      findUnique: jest.fn().mockResolvedValue(null)
    },
    visitor: {
      upsert: jest.fn().mockResolvedValue({})
    }
  };
}
