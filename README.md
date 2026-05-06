<div align="center">

# 🥋 SiTED

### Silicon Trusted Engineering Dojo

**面向公司内部研发人员的可信专业认证训练平台**

零摩擦接入 · IP 即身份 · 刷题复习闭环 · 题库管理

[![Backend Tests](https://img.shields.io/badge/backend%20tests-148%20passing-success)](backend/src)
[![Frontend Tests](https://img.shields.io/badge/frontend%20tests-77%20passing-success)](frontend/src)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-blue)](#-许可证)

[📜 产品概览](#-产品概览) ·
[✨ 核心功能](#-核心功能) ·
[🚀 快速开始](#-快速开始) ·
[⚙️ 配置说明](#%EF%B8%8F-配置说明) ·
[📖 相关文档](#-相关文档)

</div>

<div align="center">
  <img src="docs/images/sited-overview-preview.png" alt="SiTED 网页示例图" width="92%" />
</div>

---

## 📜 产品概览

**SiTED** 是一个面向公司内部研发人员的可信工程刷题训练平台，聚焦 TPC 认证相关的三类题库：编程知识、安全质量隐私、重构知识。

用户打开内网站点即可开始训练，无需注册、无需登录。系统根据访问 IP 自动识别身份和权限，学习者可以直接进入题库、练习（含背诵模式）、复习和模拟考试；管理员可以维护题目、查看运营数据和管理 IP 角色绑定。

| 科目 | 主题 | 语言区分 | 级别 |
| :---: | --- | :---: | --- |
| 科目二 | 编程知识 | 是 | 入门级 / 工作级 / 专业级 |
| 科目三 | 安全质量隐私 | 是 | 工作级 / 专业级 |
| 科目四 | 重构知识 | 否 | 专业级 |

## ✨ 核心功能

<table>
<tr>
<td width="50%" valign="top">

### 🎯 刷题、巩固、检验主链路

- 题库浏览：按科目、语言、级别、题型和关键词筛选，关键词可匹配标签，筛选条件会在本地保留。
- 单题练习：提交答案后立即反馈；答错后可改选并再次提交。
- 背诵模式：在练习页直接查看答案和解析，不写练习记录。
- 错题复习：沉淀错题，支持重练、标记掌握、取消掌握和移除。
- 收藏题目：题库列表和预览区可收藏重点题目，复习页支持练习、背诵、备注和标签维护。
- 模拟考试：选择题源后组卷，提供答题卡、提交答案、交卷确认、复盘结果、模拟考记录和重新选择题源。

</td>
<td width="50%" valign="top">

### 🔐 IP 身份与固定角色

- 请求 IP 即身份，无账号密码登录摩擦。
- `ALLOWED_CIDR` 控制允许访问的内网范围。
- `SYSTEM_ADMIN_IPS` 指定系统管理员。
- 学习者、题库管理员、系统管理员三类固定角色。
- IP 角色绑定只负责学习者和题库管理员。
- 高风险操作写入审计记录。

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 📦 题库管理

- 新增、编辑、发布和归档题目。
- 支持单选题、多选题和判断题；单选/多选支持 3-6 个选项，判断题固定 A/B。
- 题干和解析支持 Markdown 与代码块。
- 题目预览与编辑内容联动，实时展示解析。
- 支持同源图片上传和引用。
- 支持题库导入、导出和校验反馈。

</td>
<td width="50%" valign="top">

### 📊 后台管理

- 运营看板通过真实数据展示题库分布和训练趋势。
- 基于实际练习记录查看低正确率题目，辅助题库质量治理。
- 管理固定 IP 与角色绑定关系。
- 查看访问用户、训练记录和考试记录。
- 数据清理等敏感操作带确认和审计。
- 管理入口按角色自动展示。

</td>
</tr>
</table>

### 🎨 界面体验亮点

- 默认浅色主题，提供暗色主题切换，并把选择保存在当前浏览器。
- 左侧固定导航，学习入口和管理入口分区清晰，顶部栏保留当前页面标题和高频入口。
- 全局 design token 统一字体层级、间距、边框、阴影、状态色、图表色和焦点态。
- 按钮、选项、卡片、表格、Toast、Dialog 和图表悬停状态提供局部动作反馈，遵守 `prefers-reduced-motion`。
- 页面切换不再使用阻塞式整页退出动画；静态页面立即显示，数据页优先展示上次成功数据并后台刷新。
- 首页展示今日训练、训练日历、核心指标和推荐工作流。
- 题库页提供筛选、列表和题目预览的并排布局。
- 练习页提供选项状态、提交反馈、解析、上一题/下一题和快速跳题。
- 模拟考提供题源选择、答题卡、标记疑问、提交答案、交卷确认和复盘结果。
- 题目管理页提供 Markdown 编辑、选项录入、本地草稿、发布校验和实时预览。

## 🔁 训练闭环

<img src="docs/images/sited-training-loop.png" alt="SiTED 训练闭环示意图" width="100%" />

1. 用户打开内网站点，系统按 IP 自动识别身份。
2. 用户按科目、语言、级别、题型和关键词筛选题目，关键词可匹配标签。
3. 用户进入练习（含背诵模式）或模拟考试。
4. 系统记录作答、错题、收藏和考试快照，并在复习页分页查看错题、收藏和模拟考记录。
5. 管理员维护题库、查看统计、管理角色绑定和审计日志。

## 🪪 角色与权限

| 角色 | 获得方式 | 能力 |
| --- | --- | --- |
| 学习者 | 命中允许访问网段后的默认角色 | 题库浏览、题库练习、模拟考试 |
| 题库管理员 | 系统管理员按 IP 绑定 | 学习者能力，加上题库维护、导入导出、运营看板 |
| 系统管理员 | 通过 `SYSTEM_ADMIN_IPS` 环境变量指定 | 题库管理员和学习者能力，加上系统配置、数据清空 |

系统只提供固定角色，不提供复杂组织架构、积分排名、徽章证书或自定义权限组合。系统设置页的“权限范围”基于后端返回的 `permissionKeys` 聚合为能力分组展示，不展示不可单独配置的细粒度权限项。

| 能力分组 | 覆盖的 `permissionKeys` |
| --- | --- |
| 题库浏览 | `question:browse` |
| 题库练习 | `practice:use`、`recite:use`、`mistake:review`、`bookmark:use` |
| 模拟考试 | `exam:use` |
| 题库维护 | `question:create`、`question:edit`、`question:archive` |
| 导入导出 | `question:import`、`question:export` |
| 运营看板 | `stats:view_basic` |
| 系统配置 | `ip_role:write`、`audit:view`、`config:reload` |
| 数据清空 | `data:clear` |

## 🚀 快速开始

### 环境要求

| 工具 | 版本 |
| --- | --- |
| Node.js | 22 或更高版本 |
| npm | 随 Node.js 安装 |
| Docker Desktop | 支持 Docker Compose |
| PostgreSQL | 本地开发由 `docker-compose.yml` 提供 |

### 本地启动

以下命令默认在仓库根目录执行。

#### Linux / macOS

```bash
npm install

cp .env.example .env

docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

#### Windows PowerShell

PowerShell 如果提示无法加载 `npm.ps1`，请使用 `npm.cmd`。

```powershell
npm.cmd install

Copy-Item .env.example .env -ErrorAction SilentlyContinue

docker compose up -d db
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
```

启动后访问：

- 前端页面：`http://127.0.0.1:5173`
- 后端服务：`http://127.0.0.1:3000`
- 接口前缀：`http://127.0.0.1:3000/api/*`

根目录脚本会从仓库根目录的 `.env` 加载后端和前端本地配置。请从仓库根目录执行 `npm run dev` 或 `npm.cmd run dev`，不要在 `backend` 或 `frontend` 子目录中维护额外的 `.env` 文件。

如果需要分别启动前后端，请在两个终端中分别执行根目录脚本。

Linux / macOS：

```bash
npm run dev:backend
npm run dev:frontend
```

Windows PowerShell：

```powershell
npm.cmd run dev:backend
npm.cmd run dev:frontend
```

在 Windows 上，请在 `DATABASE_URL` 中使用 `127.0.0.1`，避免 `localhost` 解析到 IPv6 `::1` 后被后端 IPv4 白名单拒绝。

## ⚙️ 配置说明

需要自定义本地配置时，从根目录示例文件复制一份 `.env`：

- `.env.example`

本地配置：

```env
DATABASE_URL=postgresql://sited:sited_dev_password@127.0.0.1:5432/sited?schema=public
ALLOWED_CIDR=10.0.0.0/8,127.0.0.1/32
TRUSTED_PROXY_CIDRS=127.0.0.1/32
SYSTEM_ADMIN_IPS=127.0.0.1,10.42.18.36
UPLOAD_ROOT=backend/uploads
EXAM_CONFIG_PATH=backend/config/exam-paper-config.yaml
VITE_API_BASE_URL=/api

# Optional: used by scripts/github-pr.ps1 for GitHub PR creation/merge.
# Keep real tokens out of git; prefer setting this only in your local .env or shell session.
GH_TOKEN=
```

`UPLOAD_ROOT` 和 `EXAM_CONFIG_PATH` 使用仓库根目录相对路径。不配置 `EXAM_CONFIG_PATH` 时，后端会自动寻找默认配置文件。

前端开发代理配置在 `frontend/vite.config.ts` 中，`/api` 应指向 `http://127.0.0.1:3000`。

`GH_TOKEN` 只供 PR 自动化脚本使用。不要把真实 token 写入 `.env.example` 或提交到 Git；可以临时设置在当前 shell，或让脚本在隐藏输入中读取。脚本会把手动输入的 token 限定在当前 PowerShell 进程内，结束后清理。

角色解析规则：

- `SYSTEM_ADMIN_IPS` 中的 IP 始终解析为系统管理员。
- IP 角色绑定只能指定学习者或题库管理员。
- 系统管理员只能来自 `SYSTEM_ADMIN_IPS`，不能通过页面绑定出来。
- 系统设置页只新增和删除数据库中的 IP 角色绑定；`SYSTEM_ADMIN_IPS` 来源的系统管理员绑定展示为系统配置来源，不提供删除入口。
- 命中允许网段但没有绑定角色的访问者默认为学习者。
- 未命中 `ALLOWED_CIDR` 的请求会返回 `403`。

## 🧰 常用命令

| 用途 | Linux / macOS | Windows PowerShell |
| --- | --- | --- |
| 同时启动后端和前端 | `npm run dev` | `npm.cmd run dev` |
| 仅启动后端 | `npm run dev:backend` | `npm.cmd run dev:backend` |
| 仅启动前端 | `npm run dev:frontend` | `npm.cmd run dev:frontend` |
| 构建所有工作区 | `npm run build` | `npm.cmd run build` |
| 执行 Prisma 数据库迁移 | `npm run db:migrate` | `npm.cmd run db:migrate` |
| 写入确定性的本地开发数据 | `npm run db:seed` | `npm.cmd run db:seed` |
| 创建 PR | `npm run pr:github` | `npm.cmd run pr:github` |
| 创建 PR 并 rebase 合并 | `npm run pr:github:rebase` | `npm.cmd run pr:github:rebase` |

种子数据会创建确定性的 `SITED-SEED*` 题目、访问者、角色绑定、训练记录、考试记录和审计日志。重复执行种子脚本会更新种子脚本拥有的数据，不会清空无关的本地数据。

PR 自动化脚本位于 `scripts/github-pr.ps1`。它要求当前分支不是 `main/master`，工作树必须干净；脚本会读取临时 `GH_TOKEN`，推送当前分支，复用或创建 PR，并在 `pr:github:rebase` 下执行 rebase merge。推荐 token 权限：classic PAT 使用 `repo`；fine-grained token 对本仓库至少开启 `Contents: Read and write` 与 `Pull requests: Read and write`。

## 🛠️ 技术栈

<table width="100%" cellspacing="16">
<tr>
<td valign="top" width="50%">

<div align="center"><strong>前端</strong></div>

<ul>
  <li>⚛️ <a href="https://react.dev/"><strong>React 19</strong></a> · 训练工作台与交互页面</li>
  <li>⚡ <a href="https://vite.dev/"><strong>Vite 6</strong></a> · 前端开发服务器与构建工具</li>
  <li>🛣️ <a href="https://reactrouter.com/"><strong>React Router 7</strong></a> · 页面路由与权限入口</li>
  <li>🔷 <a href="https://www.typescriptlang.org/"><strong>TypeScript 5</strong></a> · 类型约束与前后端契约</li>
  <li>🎞️ <a href="https://motion.dev/"><strong>Motion</strong></a> · 局部交互动效与动作反馈</li>
  <li>🎛️ <a href="https://lucide.dev/"><strong>lucide-react</strong></a> · 统一线性图标系统</li>
  <li>🧪 <a href="https://vitest.dev/"><strong>Vitest</strong></a> · 前端单元与组件测试</li>
  <li>🎭 <a href="https://playwright.dev/"><strong>Playwright</strong></a> · 端到端冒烟检查</li>
</ul>

</td>
<td valign="top" width="50%">

<div align="center"><strong>后端</strong></div>

<ul>
  <li>🔥 <a href="https://nestjs.com/"><strong>NestJS 11</strong></a> · API 服务</li>
  <li>🐘 <a href="https://www.prisma.io/"><strong>Prisma 6</strong></a> · 类型安全 ORM 与迁移</li>
  <li>🗄️ <a href="https://www.postgresql.org/"><strong>PostgreSQL 16</strong></a> · 业务数据存储</li>
  <li>🔷 <a href="https://www.typescriptlang.org/"><strong>TypeScript 5</strong></a> · 服务端领域模型约束</li>
  <li>✅ <a href="https://jestjs.io/"><strong>Jest</strong></a> · 后端单元与集成测试</li>
  <li>📝 <a href="https://github.com/markdown-it/markdown-it"><strong>markdown-it</strong></a> · Markdown 渲染</li>
  <li>🧹 <a href="https://github.com/apostrophecms/sanitize-html"><strong>sanitize-html</strong></a> · HTML 清洗</li>
</ul>

</td>
</tr>
</table>

## 📂 项目结构

```text
SiTED/
├── backend/                 # 后端接口、Prisma 模型、迁移和种子数据
│   ├── prisma/              # 数据模型、迁移和 seed 脚本
│   └── src/                 # NestJS 模块、控制器和服务
├── frontend/                # 前端应用、页面组件和端到端检查
│   └── src/                 # 路由、页面、组件、接口封装和样式
├── docs/                    # 产品文档、开发计划和 README 图片
├── scripts/                 # GitHub PR 自动化等开发辅助脚本
├── ui-prototype/            # 静态界面原型
├── docker-compose.yml       # 本地 PostgreSQL 服务
└── package.json             # 工作区脚本
```

## 📖 相关文档

| 文档 | 说明 |
| --- | --- |
| [📐 产品需求文档](docs/superpowers/specs/2026-05-03-prd.md) | 产品目标、角色权限、题库规则、业务流程和页面范围 |
| [📋 开发计划](docs/superpowers/plans/2026-05-03-p0-development-plan.md) | P0 版本的任务拆解、实现路径和验证要求 |

## 🔒 安全说明

- 通过 `ALLOWED_CIDR` 限制可访问网段。
- 只信任 `TRUSTED_PROXY_CIDRS` 中代理传入的真实 IP。
- 系统管理员身份只能由 `SYSTEM_ADMIN_IPS` 指定。
- Markdown 内容由后端清洗后返回。
- 题目图片只允许同源 `/uploads/...` 地址。
- 管理员和高风险操作写入审计日志。

如发现安全问题，请不要公开提交 Issue，请通过内部渠道联系平台负责人。

## 🤝 参与贡献

欢迎以下形式的贡献：

- 提交问题：说明复现步骤、期望行为和实际行为。
- 提交需求：说明目标用户、使用场景和预期收益。
- 提交改动：保持单次改动聚焦，涉及用户可见行为时同步更新文档。

## 📄 许可证

SiTED 使用 [MIT 许可证](LICENSE)。
