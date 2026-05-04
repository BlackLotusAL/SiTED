# 示例导入题库

`example` 是用于存放可导入题库样例数据的目录。

## 文件

- `questions.import.json` 包含 600 道题，格式符合后端 `version: "1.0"` 导入规范。
- `generate-question-bank.mjs` 用于按相同分布重新生成 `questions.import.json`。

## 覆盖范围

该数据集覆盖 P0 的所有科目、题型、级别、支持的题源语言、标签、Markdown 题干、解析和备注字段。

导入后，后端会把题目保存为 `draft`。如果要用于公开题库浏览、练习、背诵、复习或模拟考，需要先发布导入的题目。

按当前 `backend/config/exam-paper-config.yaml` 配置，发布后所有合法题源组合都满足完整模拟考题量：

- `programming`：`c`、`cpp`、`python`、`java` 的 `entry`、`working`、`professional` 级别，共 12 个组合。
- `security_privacy`：`c`、`cpp`、`python`、`java` 的 `working`、`professional` 级别，共 8 个组合。
- `refactoring`：`null` 语言、`professional` 级别，共 1 个组合。

当前题量配置为：

- `programming`：判断题 8、单选题 7、多选题 5，共 20 题。
- `security_privacy`：判断题 8、单选题 7、多选题 5，共 20 题。
- `refactoring`：判断题 7、单选题 7、多选题 5，共 19 题。

题库总量保持整百数量。当前样例题库为 600 题。

## 重新生成

```sh
node example/generate-question-bank.mjs
```

成功导入后，如果再次导入同一个文件，会因为 `sourceCode` 冲突而失败。需要重复导入时，请先清空题目数据，或调整生成器中的编号前缀来生成一批独立题库。
