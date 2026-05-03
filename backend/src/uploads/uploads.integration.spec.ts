import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { resolveUploadRoot } from "./uploads.service";

describe("Task 4 real module integration", () => {
  const originalEnv = process.env;
  let uploadRoot: string;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    uploadRoot = await mkdtemp(join(tmpdir(), "sited-task4-integration-"));
    process.env.ALLOWED_CIDR = "127.0.0.1/32";
    process.env.TRUSTED_PROXY_CIDRS = "";
    process.env.SYSTEM_ADMIN_IPS = "";
    process.env.UPLOAD_ROOT = uploadRoot;
  });

  afterEach(async () => {
    process.env = originalEnv;
    await rm(uploadRoot, { recursive: true, force: true });
  });

  it("enforces learner/content_admin/system_admin access through real middleware, guard, and Task 4 controllers", async () => {
    const learner = await createApp(prismaMock({ bindingRole: null }));
    const contentAdmin = await createApp(prismaMock({ bindingRole: "content_admin" }));

    try {
      expect((await fetchJson(learner, "/api/admin/questions")).status).toBe(403);
      expect((await postUpload(learner)).status).toBe(403);

      expect((await fetchJson(contentAdmin, "/api/admin/questions")).status).toBe(200);
      expect((await postUpload(contentAdmin)).status).toBe(201);
    } finally {
      await learner.close();
      await contentAdmin.close();
    }

    process.env.SYSTEM_ADMIN_IPS = "127.0.0.1";
    const systemAdmin = await createApp(prismaMock({ bindingRole: null }));
    try {
      expect((await fetchJson(systemAdmin, "/api/admin/questions")).status).toBe(200);
      expect((await postUpload(systemAdmin)).status).toBe(201);
    } finally {
      await systemAdmin.close();
    }
  });

  it("serves uploaded static files outside the API identity middleware", async () => {
    const app = await createApp(prismaMock({ bindingRole: "content_admin" }));

    try {
      const upload = await postUpload(app);
      expect(upload.status).toBe(201);
      const url = (upload.body as { url: string }).url;

      process.env.ALLOWED_CIDR = "10.0.0.0/8";
      const response = await fetchRaw(app, url);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("image/png");
    } finally {
      await app.close();
    }
  });

  it("maps real admin question not found and sourceCode conflict exceptions through HTTP", async () => {
    const prisma = prismaMock({ bindingRole: "content_admin" });
    prisma.question.findUnique.mockResolvedValue(null);
    let responseApp = await createApp(prisma);

    try {
      const notFound = await fetchJson(responseApp, "/api/admin/questions/missing/archive", { method: "POST" });
      expect(notFound.status).toBe(404);
      expect(notFound.body).toMatchObject({ code: "QUESTION_NOT_FOUND" });
    } finally {
      await responseApp.close();
    }

    const conflictPrisma = prismaMock({ bindingRole: "content_admin" });
    conflictPrisma.question.create.mockRejectedValue({ code: "P2002", meta: { target: ["sourceCode"] } });
    responseApp = await createApp(conflictPrisma);

    try {
      const conflict = await fetchJson(responseApp, "/api/admin/questions", { method: "POST", body: validQuestionInput() });
      expect(conflict.status).toBe(409);
      expect(conflict.body).toMatchObject({ code: "QUESTION_SOURCE_CODE_CONFLICT" });
    } finally {
      await responseApp.close();
    }
  });
});

async function createApp(prisma: ReturnType<typeof prismaMock>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.useStaticAssets(resolveUploadRoot(), { prefix: "/uploads/" });
  app.setGlobalPrefix("api");
  await app.listen(0);
  return app;
}

async function fetchJson(app: INestApplication, path: string, init: { method?: string; body?: unknown } = {}) {
  const response = await fetchRaw(app, path, init);
  return {
    status: response.status,
    body: await response.json()
  };
}

async function fetchRaw(app: INestApplication, path: string, init: { method?: string; body?: unknown } = {}) {
  const server = app.getHttpServer() as { address: () => { port: number } };
  return fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method: init.method,
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });
}

async function postUpload(app: INestApplication) {
  const server = app.getHttpServer() as { address: () => { port: number } };
  const form = new FormData();
  form.append("file", new Blob([pngArrayBuffer()], { type: "image/png" }), "image.png");
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/uploads/questions`, {
    method: "POST",
    body: form
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

interface PrismaMock {
  ipRoleBinding: { findUnique: jest.Mock };
  visitor: { upsert: jest.Mock };
  question: {
    findMany: jest.Mock;
    count: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  auditLog: { create: jest.Mock };
  $transaction: jest.Mock;
}

function prismaMock(input: { bindingRole: "content_admin" | null }): PrismaMock {
  const prisma: PrismaMock = {
    ipRoleBinding: {
      findUnique: jest.fn().mockResolvedValue(input.bindingRole === null ? null : { role: input.bindingRole })
    },
    visitor: {
      upsert: jest.fn().mockResolvedValue({})
    },
    question: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(questionRecord({ status: "draft" })),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(questionRecord({ ...data, id: "created" }))),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve(questionRecord({ ...data })))
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({})
    },
    $transaction: jest.fn(async (callback: (tx: PrismaMock) => Promise<unknown>) => callback(prisma))
  };
  return prisma;
}

function validQuestionInput() {
  return {
    sourceCode: "SRC-1",
    subject: "programming",
    language: "java",
    level: "working",
    type: "single",
    tags: ["collections"],
    stemMd: "Stem",
    options: [
      { key: "A", text: "A", isCorrect: false },
      { key: "B", text: "B", isCorrect: true }
    ],
    explanationMd: "Explanation",
    memo: "Memo"
  };
}

function questionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "q1",
    sourceCode: "SRC-1",
    subject: "programming",
    language: "java",
    level: "working",
    type: "single",
    stemMd: "Stem",
    options: [
      { key: "A", text: "A", isCorrect: false },
      { key: "B", text: "B", isCorrect: true }
    ],
    correctAnswers: ["B"],
    explanationMd: "Explanation",
    memo: "Memo",
    tags: ["collections"],
    totalAttempts: 0,
    correctAttempts: 0,
    status: "draft",
    createdAt: new Date("2026-05-03T00:00:00.000Z"),
    updatedAt: new Date("2026-05-03T00:00:00.000Z"),
    ...overrides
  };
}

function pngArrayBuffer(): ArrayBuffer {
  const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
