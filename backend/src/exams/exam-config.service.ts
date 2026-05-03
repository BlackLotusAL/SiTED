import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { QUESTION_TYPES, SUBJECTS, type QuestionType, type Subject } from "../domain/constants";
import { isValidSubject } from "../domain/validation";

export interface ExamSubjectConfig {
  durationMinutes: number;
  passScorePercent: number;
  questionCounts: Record<QuestionType, number>;
}

type ExamConfigFile = {
  subjects: Record<Subject, ExamSubjectConfig>;
};

const MAX_DURATION_MINUTES = 240;
const MAX_TYPE_QUESTION_COUNT = 200;
const MAX_TOTAL_QUESTION_COUNT = 300;

@Injectable()
export class ExamConfigService {
  private readonly config: ExamConfigFile;

  constructor() {
    this.config = loadConfig(resolveConfigPath());
  }

  getSubjectConfig(subject: Subject): ExamSubjectConfig {
    if (!isValidSubject(subject)) {
      throw new BadRequestException({ code: "INVALID_EXAM_SUBJECT", message: "Unknown exam subject" });
    }

    return cloneSubjectConfig(this.config.subjects[subject]);
  }
}

function resolveConfigPath(): string {
  if (process.env.EXAM_CONFIG_PATH !== undefined && process.env.EXAM_CONFIG_PATH.trim().length > 0) {
    return resolve(process.env.EXAM_CONFIG_PATH);
  }

  const backendCwdPath = resolve(process.cwd(), "config", "exam-paper-config.yaml");
  if (existsSync(backendCwdPath)) {
    return backendCwdPath;
  }

  return resolve(process.cwd(), "backend", "config", "exam-paper-config.yaml");
}

function loadConfig(path: string): ExamConfigFile {
  try {
    const parsed = parseExamYaml(readFileSync(path, "utf8"));
    assertConfig(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
      throw error;
    }
    throw new InternalServerErrorException({
      code: "EXAM_CONFIG_INVALID",
      message: "Exam paper config could not be loaded"
    });
  }
}

function parseExamYaml(content: string): ExamConfigFile {
  const config: Partial<ExamConfigFile> = { subjects: {} as Record<Subject, ExamSubjectConfig> };
  let currentSubject: Subject | null = null;
  let inQuestionCounts = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const lineWithoutComment = rawLine.replace(/\s+#.*$/, "");
    if (lineWithoutComment.trim().length === 0) {
      continue;
    }

    const indent = lineWithoutComment.search(/\S/);
    const trimmed = lineWithoutComment.trim();

    if (indent === 0 && trimmed === "subjects:") {
      continue;
    }

    if (indent === 2 && trimmed.endsWith(":")) {
      const subject = trimmed.slice(0, -1);
      if (!isValidSubject(subject)) {
        throw invalidConfig();
      }
      if (config.subjects![subject] !== undefined) {
        throw invalidConfig();
      }
      currentSubject = subject;
      inQuestionCounts = false;
      config.subjects![currentSubject] = {
        durationMinutes: 0,
        passScorePercent: 0,
        questionCounts: { single: 0, multiple: 0, judgment: 0 }
      };
      continue;
    }

    if (currentSubject === null) {
      throw invalidConfig();
    }

    if (indent === 4 && trimmed === "questionCounts:") {
      inQuestionCounts = true;
      continue;
    }

    const scalar = /^([a-zA-Z_]+):\s*(\d+)$/.exec(trimmed);
    if (scalar === null) {
      throw invalidConfig();
    }

    const [, key, valueText] = scalar;
    const value = Number(valueText);
    const subjectConfig = config.subjects![currentSubject];

    if (indent === 4 && !inQuestionCounts && (key === "durationMinutes" || key === "passScorePercent")) {
      subjectConfig[key] = value;
      continue;
    }

    if (indent === 6 && inQuestionCounts && isQuestionType(key)) {
      subjectConfig.questionCounts[key] = value;
      continue;
    }

    throw invalidConfig();
  }

  return config as ExamConfigFile;
}

function assertConfig(config: ExamConfigFile): void {
  for (const subject of SUBJECTS) {
    const subjectConfig = config.subjects[subject];
    if (
      subjectConfig === undefined ||
      !isIntegerInRange(subjectConfig.durationMinutes, 1, MAX_DURATION_MINUTES) ||
      !isIntegerInRange(subjectConfig.passScorePercent, 1, 100) ||
      subjectConfig.passScorePercent > 100
    ) {
      throw invalidConfig();
    }

    let totalQuestions = 0;
    for (const type of QUESTION_TYPES) {
      if (!isIntegerInRange(subjectConfig.questionCounts[type], 1, MAX_TYPE_QUESTION_COUNT)) {
        throw invalidConfig();
      }
      totalQuestions += subjectConfig.questionCounts[type];
    }

    if (!isIntegerInRange(totalQuestions, 1, MAX_TOTAL_QUESTION_COUNT)) {
      throw invalidConfig();
    }
  }
}

function cloneSubjectConfig(config: ExamSubjectConfig): ExamSubjectConfig {
  return {
    durationMinutes: config.durationMinutes,
    passScorePercent: config.passScorePercent,
    questionCounts: { ...config.questionCounts }
  };
}

function isQuestionType(value: string): value is QuestionType {
  return QUESTION_TYPES.includes(value as QuestionType);
}

function isIntegerInRange(value: number, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function invalidConfig(): InternalServerErrorException {
  return new InternalServerErrorException({ code: "EXAM_CONFIG_INVALID", message: "Exam paper config is invalid" });
}
