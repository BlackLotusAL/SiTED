import { describe, expect, it } from "vitest";
import {
  getLanguageLabel,
  getLevelLabel,
  getQuestionStatusLabel,
  getQuestionTypeLabel,
  getRoleLabel,
  getSubjectLabel,
  LANGUAGES
} from "./labels";

describe("domain labels", () => {
  it("maps shared question dimensions to readable backend labels", () => {
    expect(getSubjectLabel("programming")).toBe("科目二（编程知识）");
    expect(getSubjectLabel("security_privacy", "short")).toBe("科目三");
    expect(getSubjectLabel("refactoring", "name")).toBe("重构知识");
    expect(getLanguageLabel("cpp")).toBe("C++");
    expect(getLevelLabel("professional")).toBe("专业级");
    expect(getQuestionTypeLabel("multiple")).toBe("多选题");
    expect(getQuestionStatusLabel("published")).toBe("已发布");
  });

  it("maps roles to identity labels instead of raw role ids", () => {
    expect(getRoleLabel("learner")).toBe("学习者");
    expect(getRoleLabel("content_admin")).toBe("题库管理员");
    expect(getRoleLabel("system_admin")).toBe("系统管理员");
  });

  it("keeps P0 language options aligned to the PRD", () => {
    expect(LANGUAGES).toEqual(["c", "cpp", "python", "java"]);
  });
});
