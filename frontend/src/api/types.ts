import type { Role } from "../domain/labels";

export type Permission =
  | "question:browse"
  | "practice:use"
  | "recite:use"
  | "mistake:review"
  | "bookmark:use"
  | "exam:use"
  | "question:create"
  | "question:edit"
  | "question:archive"
  | "question:import"
  | "question:export"
  | "stats:view_basic"
  | "ip_role:write"
  | "data:clear"
  | "audit:view"
  | "config:reload";

export interface Identity {
  ip: string;
  role: Role;
  roleLabel: string;
  permissions: Permission[];
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

export interface QuestionListResponse {
  items: QuestionListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface QuestionListItem {
  id: string;
  sourceCode: string | null;
  subject: string;
  language: string | null;
  level: string;
  type: string;
  stemMd: string;
  memo: string | null;
  tags: string[];
  totalAttempts: number;
  correctAttempts: number;
  correctRate: number;
}

export interface QuestionDetail {
  id: string;
  stemHtml: string;
  explanationHtml: string;
  source: {
    subject: string;
    language: string | null;
    level: string;
    type: string;
    sourceCode: string | null;
  };
  options: QuestionOption[];
  memo: string | null;
  tags: string[];
  stats: {
    totalAttempts: number;
    correctAttempts: number;
    correctRate: number;
  };
}

export interface ReciteQuestionDetail extends QuestionDetail {
  correctAnswers: string[];
}

export interface QuestionOption {
  key: string;
  text: string;
}

export interface PracticeSubmitResponse {
  attemptId: string;
  questionId: string;
  submittedAnswers: string[];
  correctAnswers: string[];
  isCorrect: boolean;
  explanationMd: string | null;
  memo: string | null;
  masteryStatus: null | {
    code: string;
    label: string;
    color: "danger" | "warning" | "success";
  };
}

export interface DashboardSummary {
  today: {
    answered: number;
    correct: number;
    incorrect: number;
    correctRate: number;
  };
  mistakes: {
    unmastered: number;
  };
  latestExam: null | {
    id: string;
    subject: string;
    language: string | null;
    level: string;
    status: string;
    scorePercent: number | null;
    isPassed: boolean | null;
    startedAt: string;
    submittedAt: string | null;
  };
  calendar: {
    year: number;
    month: number;
    total: number;
    days: Array<{ day: number; count: number }>;
  };
  coverage: Array<{ subject: string; count: number }>;
}

export interface ExamListResponse {
  items: ExamListItem[];
}

export interface ExamListItem {
  id: string;
  subject: string;
  language: string | null;
  level: string;
  status: "in_progress" | "submitted" | "abandoned";
  scorePercent: number | null;
  isPassed: boolean | null;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
}

export interface ExamDetail extends ExamListItem {
  config: {
    durationMinutes: number;
    passScorePercent: number;
    questionCounts: Record<string, number>;
  };
  answers: Record<string, string[]>;
  flaggedQuestionIds: string[];
  questions: ExamQuestion[];
}

export interface ExamQuestion {
  id: string;
  sourceCode: string | null;
  subject: string;
  language: string | null;
  level: string;
  type: string;
  stemMd: string;
  options: QuestionOption[];
  tags: string[];
  correctAnswers?: string[];
  explanationMd?: string | null;
  memo?: string | null;
  submittedAnswers?: string[];
  isCorrect?: boolean;
}
