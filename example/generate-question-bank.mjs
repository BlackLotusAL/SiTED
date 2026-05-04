import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = join(here, "questions.import.json");

const labels = {
  subjects: {
    programming: "编程知识",
    security_privacy: "安全质量隐私",
    refactoring: "重构知识"
  },
  languages: {
    c: "C",
    cpp: "C++",
    python: "Python",
    java: "Java"
  },
  levels: {
    entry: "入门级",
    working: "工作级",
    professional: "专业级"
  },
  types: {
    single: "单选",
    multiple: "多选",
    judgment: "判断"
  }
};

const prefixes = {
  subjects: {
    programming: "PROG",
    security_privacy: "SECP",
    refactoring: "REFAC"
  },
  languages: {
    c: "C",
    cpp: "CPP",
    python: "PY",
    java: "JAVA",
    none: "NA"
  },
  levels: {
    entry: "ENT",
    working: "WRK",
    professional: "PRO"
  },
  types: {
    single: "S",
    multiple: "M",
    judgment: "J"
  }
};

const programmingCombos = [
  { subject: "programming", language: "java", level: "working", counts: { single: 28, multiple: 12, judgment: 10 } },
  { subject: "programming", language: "python", level: "entry", counts: { single: 25, multiple: 12, judgment: 8 } },
  ...["c", "cpp", "python", "java"].flatMap((language) =>
    ["entry", "working", "professional"]
      .filter((level) => !(language === "java" && level === "working") && !(language === "python" && level === "entry"))
      .map((level) => ({ subject: "programming", language, level, counts: { single: 8, multiple: 5, judgment: 8 } }))
  )
];

const securityCombos = [
  { subject: "security_privacy", language: "java", level: "working", counts: { single: 25, multiple: 12, judgment: 8 } },
  { subject: "security_privacy", language: "python", level: "professional", counts: { single: 25, multiple: 12, judgment: 8 } },
  ...["c", "cpp", "python", "java"].flatMap((language) =>
    ["working", "professional"]
      .filter((level) => !(language === "java" && level === "working") && !(language === "python" && level === "professional"))
      .map((level) => ({ subject: "security_privacy", language, level, counts: { single: 8, multiple: 5, judgment: 8 } }))
  )
];

const refactoringCombos = [
  { subject: "refactoring", language: null, level: "professional", counts: { single: 42, multiple: 20, judgment: 17 } }
];

const sourceIndex = new Map();
const questions = [];

for (const combo of [...programmingCombos, ...securityCombos, ...refactoringCombos]) {
  for (const type of ["single", "multiple", "judgment"]) {
    for (let index = 0; index < combo.counts[type]; index += 1) {
      questions.push(buildQuestion(combo, type, index + 1));
    }
  }
}

if (questions.length !== 600) {
  throw new Error(`Expected 600 questions, generated ${questions.length}`);
}

writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      version: "1.0",
      questions
    },
    null,
    2
  )}\n`,
  "utf8"
);

function buildQuestion(combo, type, localIndex) {
  const sourceCode = sourceCodeFor(combo, type, localIndex);
  const context = contextFor(combo, type, localIndex);
  const tags = tagsFor(combo, type, localIndex);
  const question = {
    sourceCode,
    subject: combo.subject,
    language: combo.language,
    level: combo.level,
    type,
    tags,
    stemMd: stemFor(context, type, localIndex),
    options: optionsFor(context, type, localIndex),
    explanationMd: explanationFor(context, type, localIndex),
    memo: `示例题库 ${sourceCode}，用于导入、筛选、练习、复习和模拟考流程验证。`
  };

  if (combo.language === null) {
    question.language = null;
  }

  return question;
}

function sourceCodeFor(combo, type, localIndex) {
  const base = [
    "EX",
    prefixes.subjects[combo.subject],
    prefixes.languages[combo.language ?? "none"],
    prefixes.levels[combo.level],
    prefixes.types[type]
  ].join("-");
  const next = (sourceIndex.get(base) ?? 0) + 1;
  sourceIndex.set(base, next);
  return `${base}-${String(localIndex).padStart(3, "0")}-${String(next).padStart(3, "0")}`;
}

function contextFor(combo, type, localIndex) {
  return {
    ...combo,
    type,
    localIndex,
    subjectLabel: labels.subjects[combo.subject],
    languageLabel: combo.language === null ? "通用" : labels.languages[combo.language],
    levelLabel: labels.levels[combo.level],
    typeLabel: labels.types[type],
    scenario: scenarioFor(combo.subject, combo.language, localIndex)
  };
}

function stemFor(context, type, localIndex) {
  if (type === "single") {
    return singleStem(context, localIndex);
  }
  if (type === "multiple") {
    return multipleStem(context, localIndex);
  }
  return judgmentStem(context, localIndex);
}

function singleStem(context, localIndex) {
  if (context.subject === "programming") {
    return `${context.subjectLabel} / ${context.languageLabel} / ${context.levelLabel}：在场景 ${localIndex} 中，哪一项最符合可靠编码实践？\n\n${codeBlockFor(context.language, localIndex)}`;
  }
  if (context.subject === "security_privacy") {
    return `${context.subjectLabel} / ${context.languageLabel} / ${context.levelLabel}：处理${context.scenario}时，哪一项是更稳妥的做法？`;
  }
  return `${context.subjectLabel} / ${context.levelLabel}：面对${context.scenario}，哪一项重构动作最合适？`;
}

function multipleStem(context, localIndex) {
  if (context.subject === "programming") {
    return `${context.subjectLabel} / ${context.languageLabel} / ${context.levelLabel}：为了提升${context.scenario}的可维护性，应同时采取哪些措施？`;
  }
  if (context.subject === "security_privacy") {
    return `${context.subjectLabel} / ${context.languageLabel} / ${context.levelLabel}：关于${context.scenario}，哪些措施应该同时落实？`;
  }
  return `${context.subjectLabel} / ${context.levelLabel}：识别到${context.scenario}后，哪些处理方式是合理的？`;
}

function judgmentStem(context, localIndex) {
  const statement = localIndex % 2 === 0 ? trueStatement(context) : falseStatement(context);
  return `${context.subjectLabel} / ${context.languageLabel} / ${context.levelLabel}：判断正误。\n\n${statement.text}`;
}

function optionsFor(context, type, localIndex) {
  if (type === "single") {
    return singleOptions(context, localIndex);
  }
  if (type === "multiple") {
    return multipleOptions(context, localIndex);
  }
  return judgmentOptions(context, localIndex);
}

function singleOptions(context, localIndex) {
  const correct = correctSingle(context);
  const distractors = distractorsFor(context);
  return keyedOptions(rotate([correct, ...distractors].slice(0, 4), localIndex), correct);
}

function multipleOptions(context, localIndex) {
  const correct = correctMultiple(context);
  const distractors = distractorsFor(context);
  const rawOptions = rotate([...correct, ...distractors].slice(0, 5), localIndex);
  return rawOptions.map((text, index) => ({
    key: keyFor(index),
    text,
    isCorrect: correct.includes(text)
  }));
}

function judgmentOptions(context, localIndex) {
  const statement = localIndex % 2 === 0 ? trueStatement(context) : falseStatement(context);
  return [
    { key: "A", text: "正确", isCorrect: statement.answer === true },
    { key: "B", text: "错误", isCorrect: statement.answer === false }
  ];
}

function explanationFor(context, type, localIndex) {
  if (type === "single") {
    return `正确选项强调先控制风险，再实现功能。${context.scenario}需要可读、可测、可回滚的处理方式。`;
  }
  if (type === "multiple") {
    return `多选题要求同时覆盖流程、边界和反馈。遗漏其中任一环节，都可能让${context.scenario}在真实使用中暴露问题。`;
  }
  const statement = localIndex % 2 === 0 ? trueStatement(context) : falseStatement(context);
  return statement.answer
    ? `该说法正确，因为它把${context.scenario}的约束前置，并保留了验证入口。`
    : `该说法错误，因为它忽略了${context.scenario}中的边界条件或审计要求。`;
}

function correctSingle(context) {
  if (context.subject === "programming") {
    return "先校验输入和边界条件，再把核心逻辑拆成可测试的小函数";
  }
  if (context.subject === "security_privacy") {
    return "最小化收集范围，并在关键操作上保留审计记录";
  }
  return "先提取重复逻辑并补上行为测试，再逐步移动代码位置";
}

function correctMultiple(context) {
  if (context.subject === "programming") {
    return ["为异常路径补充测试", "把状态变化集中在清晰的边界内"];
  }
  if (context.subject === "security_privacy") {
    return ["对敏感字段做脱敏展示", "限制默认权限并记录关键访问"];
  }
  return ["先用测试锁定现有行为", "把命名调整到表达业务意图"];
}

function distractorsFor(context) {
  if (context.subject === "programming") {
    return [
      "优先复制现有代码以减少短期思考成本",
      "把所有分支合并进一个复杂条件表达式",
      "只在上线后根据日志补充测试",
      "默认吞掉异常以避免用户看到错误"
    ];
  }
  if (context.subject === "security_privacy") {
    return [
      "为了排查方便直接记录完整敏感数据",
      "让所有内部用户默认拥有管理权限",
      "把删除操作做成无需确认的一键动作",
      "用本地缓存长期保存访问令牌"
    ];
  }
  return [
    "在没有测试保护时一次性重写整个模块",
    "保留含糊命名以避免修改调用方",
    "把无关职责继续塞进同一个函数",
    "先调整格式再猜测业务行为是否改变"
  ];
}

function trueStatement(context) {
  if (context.subject === "programming") {
    return { text: "在修改核心逻辑前，先补充覆盖正常路径和异常路径的测试，可以降低回归风险。", answer: true };
  }
  if (context.subject === "security_privacy") {
    return { text: "涉及权限、敏感字段或数据清理的操作，应保留可追踪的审计信息。", answer: true };
  }
  return { text: "重构应该尽量保持外部可观察行为不变，并通过测试确认行为未漂移。", answer: true };
}

function falseStatement(context) {
  if (context.subject === "programming") {
    return { text: "只要功能能运行，就可以忽略输入边界和失败路径。", answer: false };
  }
  if (context.subject === "security_privacy") {
    return { text: "内部系统默认可信，因此可以在页面和日志中完整展示所有敏感字段。", answer: false };
  }
  return { text: "重构时如果命名变清晰，可以不验证原有行为是否保持一致。", answer: false };
}

function scenarioFor(subject, language, localIndex) {
  const programming = {
    c: ["指针边界检查", "资源释放", "缓冲区长度处理", "错误码传播"],
    cpp: ["RAII 生命周期", "容器迭代器失效", "智能指针所有权", "异常安全"],
    python: ["输入解析", "异常分支", "数据结构选择", "模块边界"],
    java: ["集合并发访问", "空值处理", "接口分层", "事务边界"]
  };
  const security = {
    c: ["本地缓冲区输入", "日志落盘", "配置文件权限", "错误信息返回"],
    cpp: ["对象生命周期", "线程共享状态", "文件路径处理", "异常日志"],
    python: ["用户上传内容", "接口鉴权", "敏感字段展示", "依赖配置"],
    java: ["访问控制", "审计日志", "令牌处理", "批量导入"]
  };
  const refactoring = ["长函数拆分", "重复条件判断", "含糊命名", "跨层调用", "过大的服务类"];
  if (subject === "programming") {
    return pick(programming[language], localIndex);
  }
  if (subject === "security_privacy") {
    return pick(security[language], localIndex);
  }
  return pick(refactoring, localIndex);
}

function codeBlockFor(language, localIndex) {
  if (language === null || localIndex % 3 !== 0) {
    return "";
  }
  const snippets = {
    c: "```c\nif (len > capacity) {\n  return ERR_TOO_LONG;\n}\n```",
    cpp: "```cpp\nauto handle = std::make_unique<Resource>();\nprocess(*handle);\n```",
    python: "```python\nif not payload.get(\"id\"):\n    raise ValueError(\"missing id\")\n```",
    java: "```java\nif (items == null) {\n  return List.of();\n}\n```"
  };
  return snippets[language];
}

function tagsFor(combo, type, localIndex) {
  return [
    labels.subjects[combo.subject],
    labels.types[type],
    labels.levels[combo.level],
    combo.language === null ? "通用" : labels.languages[combo.language],
    `样例批次${(localIndex % 5) + 1}`
  ];
}

function keyedOptions(values, correctText) {
  return values.map((text, index) => ({
    key: keyFor(index),
    text,
    isCorrect: text === correctText
  }));
}

function rotate(values, offset) {
  const shift = offset % values.length;
  return [...values.slice(shift), ...values.slice(0, shift)];
}

function pick(values, index) {
  return values[(index - 1) % values.length];
}

function keyFor(index) {
  return String.fromCharCode("A".charCodeAt(0) + index);
}
