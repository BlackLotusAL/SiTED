import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

interface DemoQuestionOption {
  key: string;
  text: string;
  isCorrect?: boolean;
}

interface DemoQuestion {
  id: string;
  sourceCode: string | null;
  subject: string;
  language: string | null;
  level: string;
  type: string;
  stemMd: string;
  stemHtml: string;
  explanationHtml: string;
  explanationMd: string;
  options: DemoQuestionOption[];
  correctAnswers: string[];
  memo: string | null;
  tags: string[];
  totalAttempts: number;
  correctAttempts: number;
}

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
    const answers = asAnswerMap(requestBody.answers) ?? defaultDemoAnswers();
    return ok(demoActiveExam(decodeURIComponent(examAnswersMatch[1]), answers));
  }

  const examSubmitMatch = pathname.match(/^\/api\/exams\/([^/]+)\/submit$/);
  if (method === "POST" && examSubmitMatch !== null) {
    const requestBody = asRecord(body);
    const answers = asAnswerMap(requestBody.answers) ?? defaultDemoAnswers();
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

const FALLBACK_DEMO_QUESTIONS: DemoQuestion[] = [
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

const DEMO_QUESTIONS = loadDemoQuestions();

function loadDemoQuestions(): DemoQuestion[] {
  for (const filePath of demoQuestionBankPaths()) {
    try {
      if (!existsSync(filePath)) {
        continue;
      }

      const imported = normalizeImportedQuestions(JSON.parse(readFileSync(filePath, "utf8")));
      if (imported.length > 0) {
        return imported;
      }
    } catch {
      // Fall through to the small embedded bank so the demo stays available.
    }
  }

  return FALLBACK_DEMO_QUESTIONS;
}

function demoQuestionBankPaths() {
  return [
    join(process.cwd(), "example", "questions.import.json"),
    join(__dirname, "..", "example", "questions.import.json"),
    join(__dirname, "example", "questions.import.json")
  ];
}

function normalizeImportedQuestions(input: unknown): DemoQuestion[] {
  const batch = asRecord(input);
  const questions = Array.isArray(batch.questions) ? batch.questions : [];

  if (batch.version !== "1.0" || questions.length === 0) {
    return [];
  }

  return questions
    .map((question, index) => normalizeImportedQuestion(question, index))
    .filter((question): question is DemoQuestion => question !== null);
}

function normalizeImportedQuestion(input: unknown, index: number): DemoQuestion | null {
  const question = asRecord(input);
  const sourceCode = stringValue(question.sourceCode);
  const subject = stringValue(question.subject);
  const level = stringValue(question.level);
  const type = stringValue(question.type);
  const stemMd = stringValue(question.stemMd);
  const explanationMd = stringValue(question.explanationMd) ?? "";
  const options = normalizeImportedOptions(question.options);
  const correctAnswers = options.filter((option) => option.isCorrect === true).map((option) => option.key);

  if (subject === null || level === null || type === null || stemMd === null || options.length === 0 || correctAnswers.length === 0) {
    return null;
  }

  const id = sourceCode ?? `example-question-${index + 1}`;
  const totalAttempts = 12 + (index % 19);
  const correctAttempts = Math.max(1, Math.min(totalAttempts, Math.round(totalAttempts * (0.48 + (index % 7) * 0.06))));

  return {
    id,
    sourceCode,
    subject,
    language: stringValue(question.language),
    level,
    type,
    stemMd,
    stemHtml: markdownParagraph(stemMd),
    explanationHtml: markdownParagraph(explanationMd),
    explanationMd,
    options,
    correctAnswers,
    memo: stringValue(question.memo),
    tags: stringArray(question.tags) ?? [],
    totalAttempts,
    correctAttempts
  };
}

function normalizeImportedOptions(input: unknown): DemoQuestionOption[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((option) => {
    const record = asRecord(option);
    const key = stringValue(record.key);
    const text = stringValue(record.text);

    if (key === null || text === null) {
      return [];
    }

    return [{ key, text, isCorrect: record.isCorrect === true }];
  });
}

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
    coverage: subjectCounts()
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

function demoBookmark(questionId = DEMO_QUESTIONS[1]?.id ?? DEMO_QUESTIONS[0].id, overrides: Record<string, unknown> = {}) {
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

function demoSubmittedExam(id = "demo-exam-1", answers: Record<string, string[]> = defaultDemoAnswers()) {
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

function defaultDemoAnswers() {
  const first = DEMO_QUESTIONS[0];
  const second = DEMO_QUESTIONS[1] ?? first;
  const wrongFirstAnswer = first.options.find((option) => !first.correctAnswers.includes(option.key))?.key ?? first.options[0]?.key ?? "A";

  return {
    [first.id]: [wrongFirstAnswer],
    [second.id]: second.correctAnswers
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
  const questionId = typeof body.questionId === "string" ? body.questionId : DEMO_QUESTIONS[0].id;
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
      total: DEMO_QUESTIONS.length,
      published: DEMO_QUESTIONS.length,
      bySubject: subjectCounts()
    },
    lowCorrectRateQuestions: DEMO_QUESTIONS.slice(0, 10).map((question) => ({
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
  const decoded = decodeURIComponent(id ?? "");
  return DEMO_QUESTIONS.find((question) => question.id === decoded || question.sourceCode === decoded) ?? DEMO_QUESTIONS[0];
}

function correctRate(question: { totalAttempts: number; correctAttempts: number }) {
  return question.totalAttempts === 0 ? 0 : Math.round((question.correctAttempts / question.totalAttempts) * 100);
}

function subjectCounts() {
  const counts = new Map<string, number>();
  for (const question of DEMO_QUESTIONS) {
    counts.set(question.subject, (counts.get(question.subject) ?? 0) + 1);
  }

  return [...counts.entries()].map(([subject, count]) => ({ subject, count }));
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

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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

function markdownParagraph(value: string | null): string {
  if (value === null || value.trim().length === 0) {
    return "";
  }
  if (value.trim().startsWith("<")) {
    return value;
  }
  return `<p>${escapeHtml(value)}</p>`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
