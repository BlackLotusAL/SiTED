import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { ExamConfigService } from "./exam-config.service";

describe("ExamConfigService", () => {
  const originalEnv = process.env.EXAM_CONFIG_PATH;
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sited-exam-config-"));
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.EXAM_CONFIG_PATH;
    } else {
      process.env.EXAM_CONFIG_PATH = originalEnv;
    }
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads paper settings from the configured YAML path", () => {
    const configPath = join(tempDir, "exam-paper-config.yaml");
    writeFileSync(configPath, validYaml(), "utf8");
    process.env.EXAM_CONFIG_PATH = configPath;

    const service = new ExamConfigService();

    expect(service.getSubjectConfig("programming")).toEqual({
      durationMinutes: 45,
      passScorePercent: 60,
      questionCounts: { judgment: 8, single: 22, multiple: 10 }
    });
    expect(service.getSubjectConfig("refactoring")).toEqual({
      durationMinutes: 60,
      passScorePercent: 65,
      questionCounts: { judgment: 7, single: 25, multiple: 18 }
    });
  });

  it("resolves root-relative config paths when running from the backend workspace", () => {
    const backendDir = join(tempDir, "backend");
    const configDir = join(backendDir, "config");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "exam-paper-config.yaml"), validYaml(), "utf8");
    process.env.EXAM_CONFIG_PATH = "backend/config/exam-paper-config.yaml";
    process.chdir(backendDir);

    const service = new ExamConfigService();

    expect(service.getSubjectConfig("programming")).toEqual({
      durationMinutes: 45,
      passScorePercent: 60,
      questionCounts: { judgment: 8, single: 22, multiple: 10 }
    });
  });

  it("rejects malformed or incomplete YAML config", () => {
    const configPath = join(tempDir, "exam-paper-config.yaml");
    writeFileSync(
      configPath,
      ["subjects:", "  programming:", "    durationMinutes: 0", "    passScorePercent: 60", "    questionCounts:", ""].join(
        "\n"
      ),
      "utf8"
    );
    process.env.EXAM_CONFIG_PATH = configPath;

    expect(() => new ExamConfigService()).toThrow(InternalServerErrorException);
  });

  it("rejects duplicate subject blocks instead of silently overwriting them", () => {
    const configPath = join(tempDir, "exam-paper-config.yaml");
    writeFileSync(
      configPath,
      validYaml().replace(
        "  security_privacy:",
        ["  programming:", "    durationMinutes: 46", "    passScorePercent: 60", "    questionCounts:", "      judgment: 8", "      single: 22", "      multiple: 10", "  security_privacy:"].join(
          "\n"
        )
      ),
      "utf8"
    );
    process.env.EXAM_CONFIG_PATH = configPath;

    expect(() => new ExamConfigService()).toThrow(InternalServerErrorException);
  });

  it("rejects values outside configured bounds", () => {
    const configPath = join(tempDir, "exam-paper-config.yaml");
    writeFileSync(
      configPath,
      validYaml()
        .replace("    durationMinutes: 45", "    durationMinutes: 241")
        .replace("      single: 22", "      single: 201"),
      "utf8"
    );
    process.env.EXAM_CONFIG_PATH = configPath;

    expect(() => new ExamConfigService()).toThrow(InternalServerErrorException);
  });

  it("rejects unknown subjects when requesting a config", () => {
    const configPath = join(tempDir, "exam-paper-config.yaml");
    writeFileSync(configPath, validYaml(), "utf8");
    process.env.EXAM_CONFIG_PATH = configPath;

    const service = new ExamConfigService();

    expect(() => service.getSubjectConfig("unknown" as never)).toThrow(BadRequestException);
  });
});

function validYaml(): string {
  return [
    "subjects:",
    "  programming:",
    "    durationMinutes: 45",
    "    passScorePercent: 60",
    "    questionCounts:",
    "      judgment: 8",
    "      single: 22",
    "      multiple: 10",
    "  security_privacy:",
    "    durationMinutes: 45",
    "    passScorePercent: 60",
    "    questionCounts:",
    "      judgment: 8",
    "      single: 22",
    "      multiple: 10",
    "  refactoring:",
    "    durationMinutes: 60",
    "    passScorePercent: 65",
    "    questionCounts:",
    "      judgment: 7",
    "      single: 25",
    "      multiple: 18",
    ""
  ].join("\n");
}
