import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { EXAM_NOW_PROVIDER } from "./exams.service";

describe("ExamsController HTTP", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ALLOWED_CIDR: "127.0.0.1/32", TRUSTED_PROXY_CIDRS: "", SYSTEM_ADMIN_IPS: "" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("rejects invalid exam UUID route params before reaching Prisma", async () => {
    const prisma = prismaMock();
    const app = await createApp(prisma);

    try {
      const response = await fetchJson(app, "/api/exams/not-a-uuid");

      expect(response.status).toBe(400);
      expect(prisma.examAttempt.findUnique).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("maps real exam not found exceptions through HTTP", async () => {
    const prisma = prismaMock({ exam: null });
    const app = await createApp(prisma);

    try {
      const response = await fetchJson(app, `/api/exams/${examId()}`);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: "EXAM_NOT_FOUND" });
    } finally {
      await app.close();
    }
  });

  it("returns current visitor exam history without snapshot or answer details", async () => {
    const prisma = prismaMock({
      exams: [examAttemptRecord({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", status: "submitted", scorePercent: 66.67 })]
    });
    const app = await createApp(prisma);

    try {
      const response = await fetchJson(app, "/api/exams");

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        items: [
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            subject: "programming",
            language: "java",
            level: "entry",
            status: "submitted",
            scorePercent: 66.67
          }
        ]
      });
      expect(response.body.items[0]).not.toHaveProperty("questionSnapshot");
      expect(response.body.items[0]).not.toHaveProperty("answers");
      expect(response.body.items[0]).not.toHaveProperty("questions");
    } finally {
      await app.close();
    }
  });

  it("wires PATCH answers and POST submit bodies to the service through real HTTP", async () => {
    const prisma = prismaMock({ exam: examAttemptRecord() });
    const app = await createApp(prisma);

    try {
      const patch = await fetchJson(app, `/api/exams/${examId()}/answers`, {
        method: "PATCH",
        body: { answers: { [singleQuestionId()]: ["B"] } }
      });
      const submit = await fetchJson(app, `/api/exams/${examId()}/submit`, {
        method: "POST",
        body: { answers: { [singleQuestionId()]: ["B"] } }
      });

      expect(patch.status).toBe(200);
      expect(patch.body).toMatchObject({ answers: { [singleQuestionId()]: ["B"] }, status: "in_progress" });
      expect(submit.status).toBe(201);
      expect(submit.body).toMatchObject({ status: "submitted" });
    } finally {
      await app.close();
    }
  });

  it("prevents cross visitor access through real identity isolation", async () => {
    const prisma = prismaMock({ exam: examAttemptRecord({ visitorId: "other-visitor" }) });
    const app = await createApp(prisma);

    try {
      const response = await fetchJson(app, `/api/exams/${examId()}`);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: "EXAM_NOT_FOUND" });
    } finally {
      await app.close();
    }
  });

  it("auto-submits expired active exams over HTTP and ignores late PATCH answers", async () => {
    const prisma = prismaMock({
      exam: examAttemptRecord({
        answers: { [singleQuestionId()]: ["B"] },
        deadlineAt: new Date("2026-05-02T23:59:59.000Z")
      })
    });
    const app = await createApp(prisma);

    try {
      const response = await fetchJson(app, `/api/exams/${examId()}/answers`, {
        method: "PATCH",
        body: { answers: { [multipleQuestionId()]: ["A", "C"] } }
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: "submitted",
        answers: { [singleQuestionId()]: ["B"] },
        scorePercent: 33.33
      });
      expect(prisma.examAttempt.update).toHaveBeenCalledWith({
        where: { id: examId() },
        data: expect.objectContaining({ answers: { [singleQuestionId()]: ["B"] }, status: "submitted" })
      });
    } finally {
      await app.close();
    }
  });

  it("returns 400 for invalid PATCH body through real validation", async () => {
    const prisma = prismaMock({ exam: examAttemptRecord() });
    const app = await createApp(prisma);

    try {
      const response = await fetchJson(app, `/api/exams/${examId()}/answers`, {
        method: "PATCH",
        body: { answers: { [singleQuestionId()]: ["Z"] } }
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: "INVALID_EXAM_REQUEST" });
    } finally {
      await app.close();
    }
  });
});

async function createApp(prisma: ReturnType<typeof prismaMock>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(EXAM_NOW_PROVIDER)
    .useValue(() => new Date("2026-05-03T00:00:00.000Z"))
    .compile();
  const app = moduleRef.createNestApplication();
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

interface PrismaMock {
  ipRoleBinding: { findUnique: jest.Mock };
  visitor: { upsert: jest.Mock; findUnique: jest.Mock };
  question: { findMany: jest.Mock };
  examAttempt: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  mistake: { upsert: jest.Mock };
  auditLog: { create: jest.Mock };
  $transaction: jest.Mock;
}

function prismaMock(options: { exam?: unknown; exams?: unknown[] } = {}): PrismaMock {
  const prisma: PrismaMock = {
    ipRoleBinding: {
      findUnique: jest.fn().mockResolvedValue(null)
    },
    visitor: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({ id: "visitor1" })
    },
    question: {
      findMany: jest.fn().mockResolvedValue([])
    },
    examAttempt: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue(options.exams ?? []),
      findUnique: jest.fn().mockResolvedValue(options.exam === undefined ? examAttemptRecord() : options.exam),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(examAttemptRecord(data))),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve(examAttemptRecord({ ...((options.exam as Record<string, unknown> | undefined) ?? {}), ...data }))
      )
    },
    mistake: {
      upsert: jest.fn().mockResolvedValue({})
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({})
    },
    $transaction: jest.fn(async (callback: (tx: PrismaMock) => Promise<unknown>) => callback(prisma))
  };
  return prisma;
}

function examAttemptRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: examId(),
    visitorId: "visitor1",
    subject: "programming",
    language: "java",
    level: "entry",
    configSnapshot: {
      durationMinutes: 45,
      passScorePercent: 60,
      questionCounts: { judgment: 1, single: 1, multiple: 1 }
    },
    questionSnapshot: [singleQuestion(), multipleQuestion(), judgmentQuestion()],
    answers: {},
    flaggedQuestionIds: [],
    status: "in_progress",
    scorePercent: null,
    isPassed: null,
    startedAt: new Date("2026-05-03T00:00:00.000Z"),
    deadlineAt: new Date("2026-05-03T00:45:00.000Z"),
    submittedAt: null,
    updatedAt: new Date("2026-05-03T00:00:00.000Z"),
    ...overrides
  };
}

function singleQuestion() {
  return questionRecord({ id: singleQuestionId(), type: "single", correctAnswers: ["B"] });
}

function multipleQuestion() {
  return questionRecord({
    id: multipleQuestionId(),
    type: "multiple",
    options: [
      { key: "A", text: "A" },
      { key: "B", text: "B" },
      { key: "C", text: "C" }
    ],
    correctAnswers: ["A", "C"]
  });
}

function judgmentQuestion() {
  return questionRecord({
    id: judgmentQuestionId(),
    type: "judgment",
    options: [
      { key: "A", text: "True" },
      { key: "B", text: "False" }
    ],
    correctAnswers: ["A"]
  });
}

function questionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: singleQuestionId(),
    sourceCode: null,
    subject: "programming",
    language: "java",
    level: "entry",
    type: "single",
    stemMd: "Question stem",
    options: [
      { key: "A", text: "A" },
      { key: "B", text: "B" }
    ],
    correctAnswers: ["B"],
    explanationMd: "Because",
    memo: "Memo",
    tags: ["tag"],
    ...overrides
  };
}

function examId() {
  return "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
}

function singleQuestionId() {
  return "11111111-1111-4111-8111-111111111111";
}

function multipleQuestionId() {
  return "22222222-2222-4222-8222-222222222222";
}

function judgmentQuestionId() {
  return "33333333-3333-4333-8333-333333333333";
}
