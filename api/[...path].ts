type ServerHandler = (req: unknown, res: unknown) => unknown;
type ApiRequest = {
  body?: unknown;
  method?: string;
  url?: string;
};
type ApiResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(value?: string): void;
};

let cachedServer: ServerHandler | null = null;
let bootstrapPromise: Promise<ServerHandler> | null = null;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!process.env.DATABASE_URL) {
    handleDemoRequest(req, res);
    return;
  }

  const server = cachedServer ?? (await (bootstrapPromise ??= bootstrap()));
  cachedServer = server;
  return server(req, res);
}

async function bootstrap(): Promise<ServerHandler> {
  const [{ NestFactory }, { AppModule }, { resolveUploadRoot }] = await Promise.all([
    import("@nestjs/core"),
    import("../backend/dist/src/app.module.js"),
    import("../backend/dist/src/uploads/uploads.service.js")
  ]);

  const app = (await NestFactory.create(AppModule)) as any;
  app.useStaticAssets(resolveUploadRoot(), { prefix: "/uploads/" });
  app.setGlobalPrefix("api");
  await app.init();

  return app.getHttpAdapter().getInstance() as ServerHandler;
}

function handleDemoRequest(req: ApiRequest, res: ApiResponse) {
  const url = new URL(req.url ?? "/api", "https://demo.local");
  const method = (req.method ?? "GET").toUpperCase();
  const response = demoResponse(method, url, req.body);

  if (response !== null) {
    writeJson(res, response.statusCode, response.body);
    return;
  }

  writeJson(res, 404, {
    code: "DEMO_ENDPOINT_NOT_FOUND",
    message: "This endpoint is not available in the Vercel demo fallback."
  });
}

function demoResponse(method: string, url: URL, body: unknown): { statusCode: number; body: unknown } | null {
  const pathname = url.pathname;

  if (method === "GET" && pathname === "/api/health") {
    return ok({ status: "ok", mode: "demo" });
  }

  if (method === "GET" && pathname === "/api/me") {
    return ok({
      ip: "demo",
      role: "system_admin",
      roleLabel: "System Admin",
      permissions: DEMO_PERMISSIONS
    });
  }

  if (method === "GET" && pathname === "/api/dashboard") {
    return ok(demoDashboard());
  }

  if (method === "GET" && pathname === "/api/questions") {
    return ok(demoQuestionList(url.searchParams));
  }

  const questionMatch = pathname.match(/^\/api\/questions\/([^/]+)(?:\/(recite))?$/);
  if (method === "GET" && questionMatch !== null) {
    const question = findDemoQuestion(questionMatch[1]);
    return ok(demoQuestionDetail(question, questionMatch[2] === "recite"));
  }

  if (method === "GET" && pathname === "/api/review/mistakes") {
    return ok({ items: [demoMistake()] });
  }

  if (method === "GET" && pathname === "/api/review/bookmarks") {
    return ok({ items: [demoBookmark()] });
  }

  if (method === "GET" && pathname === "/api/review/records") {
    return ok({ items: [demoExamRecord()] });
  }

  if (method === "GET" && pathname === "/api/exams") {
    return ok({ items: [] });
  }

  const examMatch = pathname.match(/^\/api\/exams\/([^/]+)$/);
  if (method === "GET" && examMatch !== null) {
    return ok(demoSubmittedExam(examMatch[1]));
  }

  if (method === "POST" && pathname === "/api/practice/submit") {
    return ok(demoPracticeSubmit(asRecord(body)));
  }

  const bookmarkMatch = pathname.match(/^\/api\/bookmarks\/([^/]+)$/);
  if (bookmarkMatch !== null) {
    if (method === "POST" || method === "PATCH") {
      return ok(demoBookmark(decodeURIComponent(bookmarkMatch[1]), asRecord(body)));
    }
    if (method === "DELETE") {
      return ok({ deleted: true });
    }
  }

  const mistakeMatch = pathname.match(/^\/api\/review\/mistakes\/([^/]+)$/);
  if (mistakeMatch !== null) {
    if (method === "PATCH") {
      return ok(demoMistake({ id: decodeURIComponent(mistakeMatch[1]), isMastered: true }));
    }
    if (method === "DELETE") {
      return ok({ deleted: true });
    }
  }

  if (method === "POST" && pathname === "/api/exams") {
    return ok(demoActiveExam());
  }

  const examAnswersMatch = pathname.match(/^\/api\/exams\/([^/]+)\/answers$/);
  if (method === "PATCH" && examAnswersMatch !== null) {
    const requestBody = asRecord(body);
    const answers = asAnswerMap(requestBody.answers) ?? { "demo-q-1": ["B"] };
    return ok(demoActiveExam(decodeURIComponent(examAnswersMatch[1]), answers));
  }

  const examSubmitMatch = pathname.match(/^\/api\/exams\/([^/]+)\/submit$/);
  if (method === "POST" && examSubmitMatch !== null) {
    const requestBody = asRecord(body);
    const answers = asAnswerMap(requestBody.answers) ?? { "demo-q-1": ["B"] };
    return ok(demoSubmittedExam(decodeURIComponent(examSubmitMatch[1]), answers));
  }

  if (method === "GET" && pathname === "/api/admin/stats") {
    return ok(demoAdminStats());
  }

  if (method === "GET" && pathname === "/api/admin/settings/ip-role-bindings") {
    return ok(demoRoleBindings());
  }

  if (method === "POST" && pathname === "/api/admin/settings/ip-role-bindings") {
    return ok({ ...demoRoleBindings().items[0], ...asRecord(body), source: "binding", canDelete: true });
  }

  const roleBindingMatch = pathname.match(/^\/api\/admin\/settings\/ip-role-bindings\/(.+)$/);
  if (method === "DELETE" && roleBindingMatch !== null) {
    return ok({ deleted: true, ip: decodeURIComponent(roleBindingMatch[1]) });
  }

  if (method === "POST" && pathname === "/api/admin/settings/data-clear") {
    const requestBody = asRecord(body);
    return ok({ scope: typeof requestBody.scope === "string" ? requestBody.scope : "activity", result: "success", dbResult: "demo" });
  }

  if (method === "POST" && pathname === "/api/admin/questions") {
    return ok({ id: "demo-admin-question", status: "published" });
  }

  if (method === "GET" && pathname === "/api/admin/questions") {
    return ok(demoQuestionList(url.searchParams));
  }

  return null;
}

function writeJson(res: ApiResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function ok(body: unknown) {
  return { statusCode: 200, body };
}

const DEMO_PERMISSIONS = [
  "question:browse",
  "practice:use",
  "recite:use",
  "mistake:review",
  "bookmark:use",
  "exam:use",
  "question:create",
  "question:edit",
  "question:archive",
  "question:import",
  "question:export",
  "stats:view_basic",
  "ip_role:write",
  "data:clear",
  "audit:view",
  "config:reload"
];

const DEMO_QUESTIONS = [
  {
    id: "demo-q-1",
    sourceCode: "DEMO-JAVA-001",
    subject: "programming",
    language: "java",
    level: "working",
    type: "single",
    stemMd: "Which collection is safe for concurrent reads and writes in a Java service?",
    stemHtml: "<p>Which collection is safe for concurrent reads and writes in a Java service?</p>",
    explanationHtml: "<p>ConcurrentHashMap is designed for concurrent access while reducing coarse lock contention.</p>",
    explanationMd: "ConcurrentHashMap is designed for concurrent access while reducing coarse lock contention.",
    options: [
      { key: "A", text: "ConcurrentHashMap" },
      { key: "B", text: "HashMap shared by all threads" },
      { key: "C", text: "ArrayList" },
      { key: "D", text: "StringBuilder" }
    ],
    correctAnswers: ["A"],
    memo: "Demo question",
    tags: ["demo", "concurrency"],
    totalAttempts: 16,
    correctAttempts: 12
  },
  {
    id: "demo-q-2",
    sourceCode: "DEMO-JAVA-002",
    subject: "programming",
    language: "java",
    level: "working",
    type: "multiple",
    stemMd: "Which practices improve reliability when refactoring a service?",
    stemHtml: "<p>Which practices improve reliability when refactoring a service?</p>",
    explanationHtml: "<p>Focused tests and small reversible changes keep behavior visible during refactoring.</p>",
    explanationMd: "Focused tests and small reversible changes keep behavior visible during refactoring.",
    options: [
      { key: "A", text: "Add regression tests around current behavior" },
      { key: "B", text: "Change all modules at once" },
      { key: "C", text: "Keep each change small and reviewable" },
      { key: "D", text: "Skip verification until deployment" }
    ],
    correctAnswers: ["A", "C"],
    memo: "Demo question",
    tags: ["demo", "refactor"],
    totalAttempts: 10,
    correctAttempts: 7
  },
  {
    id: "demo-q-3",
    sourceCode: "DEMO-JAVA-003",
    subject: "programming",
    language: "java",
    level: "working",
    type: "judgment",
    stemMd: "Parameterized tests can reduce duplicated assertions across similar cases.",
    stemHtml: "<p>Parameterized tests can reduce duplicated assertions across similar cases.</p>",
    explanationHtml: "<p>Parameterized tests are useful when multiple inputs should satisfy the same behavior.</p>",
    explanationMd: "Parameterized tests are useful when multiple inputs should satisfy the same behavior.",
    options: [
      { key: "A", text: "True" },
      { key: "B", text: "False" }
    ],
    correctAnswers: ["A"],
    memo: "Demo question",
    tags: ["demo", "testing"],
    totalAttempts: 8,
    correctAttempts: 6
  },
  {
    id: "demo-q-4",
    sourceCode: "DEMO-SEC-001",
    subject: "security_privacy",
    language: "python",
    level: "entry",
    type: "single",
    stemMd: "What should a service do before storing personally identifiable information?",
    stemHtml: "<p>What should a service do before storing personally identifiable information?</p>",
    explanationHtml: "<p>Collect only necessary data and document the retention policy before storage.</p>",
    explanationMd: "Collect only necessary data and document the retention policy before storage.",
    options: [
      { key: "A", text: "Collect the minimum required data" },
      { key: "B", text: "Log every raw request forever" },
      { key: "C", text: "Share data by default" },
      { key: "D", text: "Disable access reviews" }
    ],
    correctAnswers: ["A"],
    memo: "Demo question",
    tags: ["demo", "privacy"],
    totalAttempts: 9,
    correctAttempts: 8
  }
];

function demoDashboard() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  return {
    today: {
      answered: 12,
      correct: 9,
      incorrect: 3,
      correctRate: 75
    },
    mistakes: {
      unmastered: 4
    },
    latestExam: {
      id: "demo-exam-1",
      subject: "programming",
      language: "java",
      level: "working",
      status: "submitted",
      scorePercent: 82,
      isPassed: true,
      startedAt: new Date(now.getTime() - 86400000).toISOString(),
      submittedAt: new Date(now.getTime() - 82800000).toISOString()
    },
    calendar: {
      year,
      month,
      total: 31,
      days: Array.from({ length: daysInMonth }, (_value, index) => ({
        day: index + 1,
        count: index % 6 === 0 ? 0 : (index % 4) + 1
      }))
    },
    coverage: [
      { subject: "programming", count: 42 },
      { subject: "security_privacy", count: 18 },
      { subject: "refactoring", count: 25 }
    ]
  };
}

function demoQuestionList(searchParams: URLSearchParams) {
  const page = positiveInteger(searchParams.get("page"), 1);
  const pageSize = positiveInteger(searchParams.get("pageSize"), 100);
  const keyword = (searchParams.get("keyword") ?? "").trim().toLowerCase();
  const filtered = DEMO_QUESTIONS.filter((question) => {
    if (searchParams.has("subject") && searchParams.get("subject") !== question.subject) return false;
    if (searchParams.has("language") && searchParams.get("language") !== question.language) return false;
    if (searchParams.has("level") && searchParams.get("level") !== question.level) return false;
    if (searchParams.has("type") && searchParams.get("type") !== question.type) return false;
    if (keyword.length > 0) {
      const text = [question.id, question.sourceCode, question.stemMd, question.memo, ...question.tags].join(" ").toLowerCase();
      return text.includes(keyword);
    }
    return true;
  });
  const start = (page - 1) * pageSize;

  return {
    items: filtered.slice(start, start + pageSize).map(toQuestionListItem),
    page,
    pageSize,
    total: filtered.length
  };
}

function toQuestionListItem(question: (typeof DEMO_QUESTIONS)[number]) {
  return {
    id: question.id,
    sourceCode: question.sourceCode,
    subject: question.subject,
    language: question.language,
    level: question.level,
    type: question.type,
    stemMd: question.stemMd,
    memo: question.memo,
    tags: question.tags,
    totalAttempts: question.totalAttempts,
    correctAttempts: question.correctAttempts,
    correctRate: correctRate(question)
  };
}

function demoQuestionDetail(question: (typeof DEMO_QUESTIONS)[number], includeAnswers: boolean) {
  return {
    id: question.id,
    stemHtml: question.stemHtml,
    explanationHtml: question.explanationHtml,
    source: {
      subject: question.subject,
      language: question.language,
      level: question.level,
      type: question.type,
      sourceCode: question.sourceCode
    },
    options: question.options,
    memo: question.memo,
    tags: question.tags,
    stats: {
      totalAttempts: question.totalAttempts,
      correctAttempts: question.correctAttempts,
      correctRate: correctRate(question)
    },
    ...(includeAnswers ? { correctAnswers: question.correctAnswers } : {})
  };
}

function demoQuestionSummary(question = DEMO_QUESTIONS[0]) {
  return {
    ...toQuestionListItem(question),
    status: "published",
    stats: {
      totalAttempts: question.totalAttempts,
      correctAttempts: question.correctAttempts,
      correctRate: correctRate(question)
    }
  };
}

function demoMistake(overrides: Record<string, unknown> = {}) {
  const question = DEMO_QUESTIONS[0];
  const isMastered = overrides.isMastered === true;

  return {
    id: "demo-mistake-1",
    questionId: question.id,
    wrongCount: 3,
    consecutiveCorrectCount: isMastered ? 2 : 0,
    isMastered,
    lastWrongAt: hoursAgo(6),
    masteredAt: isMastered ? new Date().toISOString() : null,
    masteryStatus: isMastered
      ? { code: "mastered", label: "Mastered", color: "success" }
      : { code: "unmastered", label: "Needs review", color: "danger" },
    question: demoQuestionSummary(question),
    ...overrides
  };
}

function demoBookmark(questionId = "demo-q-2", overrides: Record<string, unknown> = {}) {
  const question = findDemoQuestion(questionId);

  return {
    id: `bookmark-${question.id}`,
    questionId: question.id,
    note: typeof overrides.note === "string" ? overrides.note : "Useful demo item",
    tags: Array.isArray(overrides.tags) ? overrides.tags : ["demo", "review"],
    createdAt: hoursAgo(12),
    question: demoQuestionSummary(question)
  };
}

function demoExamRecord() {
  return {
    kind: "exam",
    id: "demo-exam-1",
    subject: "programming",
    language: "java",
    level: "working",
    status: "submitted",
    scorePercent: 50,
    isPassed: false,
    startedAt: hoursAgo(30),
    deadlineAt: hoursAgo(29),
    submittedAt: hoursAgo(29.5)
  };
}

function demoActiveExam(id = "demo-exam-active", answers: Record<string, string[]> = {}) {
  return {
    id,
    subject: "programming",
    language: "java",
    level: "working",
    status: "in_progress",
    config: {
      durationMinutes: 45,
      passScorePercent: 60,
      questionCounts: { single: 1, multiple: 1, judgment: 0 }
    },
    answers,
    flaggedQuestionIds: [],
    startedAt: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    submittedAt: null,
    scorePercent: null,
    isPassed: null,
    questions: DEMO_QUESTIONS.slice(0, 2).map(toExamQuestion)
  };
}

function demoSubmittedExam(id = "demo-exam-1", answers: Record<string, string[]> = { "demo-q-1": ["B"], "demo-q-2": ["A", "C"] }) {
  const questions = DEMO_QUESTIONS.slice(0, 2).map((question) => {
    const submittedAnswers = answers[question.id] ?? [];
    const isCorrect = sameAnswerSet(submittedAnswers, question.correctAnswers);
    return {
      ...toExamQuestion(question),
      correctAnswers: question.correctAnswers,
      submittedAnswers,
      isCorrect,
      explanationMd: question.explanationMd,
      memo: question.memo
    };
  });
  const correctCount = questions.filter((question) => question.isCorrect).length;
  const scorePercent = Math.round((correctCount / Math.max(questions.length, 1)) * 100);

  return {
    ...demoActiveExam(id, answers),
    status: "submitted",
    scorePercent,
    isPassed: scorePercent >= 60,
    submittedAt: new Date().toISOString(),
    questions
  };
}

function toExamQuestion(question: (typeof DEMO_QUESTIONS)[number]) {
  return {
    id: question.id,
    sourceCode: question.sourceCode,
    subject: question.subject,
    language: question.language,
    level: question.level,
    type: question.type,
    stemMd: question.stemMd,
    options: question.options,
    tags: question.tags
  };
}

function demoPracticeSubmit(body: Record<string, unknown>) {
  const questionId = typeof body.questionId === "string" ? body.questionId : "demo-q-1";
  const question = findDemoQuestion(questionId);
  const submittedAnswers = stringArray(body.submittedAnswers) ?? ["B"];
  const isCorrect = sameAnswerSet(submittedAnswers, question.correctAnswers);

  return {
    attemptId: `demo-attempt-${Date.now()}`,
    questionId: question.id,
    submittedAnswers,
    correctAnswers: question.correctAnswers,
    isCorrect,
    explanationMd: question.explanationMd,
    memo: question.memo,
    masteryStatus: isCorrect
      ? { code: "mastered", label: "Mastered", color: "success" }
      : { code: "unmastered", label: "Needs review", color: "danger" }
  };
}

function demoAdminStats() {
  const trends = lastSevenDays();

  return {
    questions: {
      total: 85,
      published: 81,
      bySubject: [
        { subject: "programming", count: 42 },
        { subject: "security_privacy", count: 24 },
        { subject: "refactoring", count: 19 }
      ]
    },
    lowCorrectRateQuestions: DEMO_QUESTIONS.slice(0, 3).map((question) => ({
      id: question.id,
      sourceCode: question.sourceCode,
      stemMd: question.stemMd,
      totalAttempts: question.totalAttempts,
      correctAttempts: Math.max(1, question.correctAttempts - 5),
      correctRate: correctRate({ ...question, correctAttempts: Math.max(1, question.correctAttempts - 5) })
    })),
    today: {
      visitors: 18,
      practiceQuestions: 64,
      exams: 5
    },
    trends: {
      visitors: trends.map((date, index) => ({ date, count: 10 + index * 2 })),
      practiceQuestions: trends.map((date, index) => ({ date, count: 24 + index * 7 })),
      exams: trends.map((date, index) => ({ date, count: 1 + (index % 4) }))
    }
  };
}

function demoRoleBindings() {
  return {
    headers: ["ip", "role", "description", "updatedAt"],
    items: [
      {
        ip: "demo",
        role: "system_admin",
        fixedRole: "System Admin",
        permissionKeys: DEMO_PERMISSIONS,
        permissionScope: ["all"],
        permissions: DEMO_PERMISSIONS,
        description: "Vercel preview demo identity",
        source: "system",
        canDelete: false,
        updatedAt: new Date().toISOString()
      },
      {
        ip: "10.0.0.8",
        role: "content_admin",
        fixedRole: "Content Admin",
        permissionKeys: DEMO_PERMISSIONS.filter((permission) => !["ip_role:write", "data:clear", "audit:view", "config:reload"].includes(permission)),
        permissionScope: ["content"],
        permissions: ["question maintenance", "stats"],
        description: "Demo content team",
        source: "binding",
        canDelete: true,
        updatedAt: hoursAgo(48)
      }
    ]
  };
}

function findDemoQuestion(id: string | undefined) {
  return DEMO_QUESTIONS.find((question) => question.id === decodeURIComponent(id ?? "")) ?? DEMO_QUESTIONS[0];
}

function correctRate(question: { totalAttempts: number; correctAttempts: number }) {
  return question.totalAttempts === 0 ? 0 : Math.round((question.correctAttempts / question.totalAttempts) * 100);
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return asRecord(parsed);
    } catch {
      return {};
    }
  }

  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function asAnswerMap(value: unknown): Record<string, string[]> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, answers]) => [key, stringArray(answers)] as const)
    .filter((entry): entry is readonly [string, string[]] => entry[1] !== null);

  return Object.fromEntries(entries);
}

function sameAnswerSet(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function lastSevenDays() {
  return Array.from({ length: 7 }, (_value, index) => {
    const date = new Date(Date.now() - (6 - index) * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  });
}
