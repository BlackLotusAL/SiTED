# SiTED P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch one fresh implementer subagent per task, then run spec-compliance review and code-quality review before moving to the next task.

**Goal:** Build the SiTED P0 internal training platform from the finalized PRD and UI prototype.

**Architecture:** Use a monorepo with `frontend/` for the React application and `backend/` for the NestJS API. PostgreSQL is the only database, Prisma owns schema and migrations, and the backend serves `/api/*` plus uploaded question images under `/uploads/*`.

**Tech Stack:** React + Vite + TypeScript, NestJS + TypeScript, Prisma, PostgreSQL, Markdown rendering with sanitization and code highlighting, Vitest/Jest, Supertest, Playwright.

---

## Source Of Truth

- Product requirements: `docs/2026-05-03-sited-prd.md`
- UI prototype: `ui-prototype/index.html`, `ui-prototype/styles.css`, `ui-prototype/app.js`
- Current implementation plan: this file

Do not add product scope beyond P0 unless a missing interface is required to implement the PRD. Keep the system simple: no login system, no Redis, no queue, no search engine, no object storage, no multi-tenant RBAC.

## New Session Handoff

- Start the new session by reading this plan, the PRD, and the prototype files listed above.
- Use `superpowers:subagent-driven-development`, not inline implementation.
- Required first action in the new session: create an isolated implementation workspace before code changes.
- This session attempted `git worktree add .worktrees\sited-p0 -b codex/sited-p0`, but branch ref creation failed with `unable to create directory for .git/refs/heads/codex/sited-p0`. In the new session, retry the required worktree setup. If the same local Git permission issue recurs, use a non-nested branch name such as `codex-sited-p0` after recording the reason.
- `.worktrees/` has been added to `.git/info/exclude` locally so project-local worktrees are ignored by Git.

## Shared Domain Contracts

Create the same domain constants on backend and frontend.

- Subjects:
  - `programming` -> `科目二（编程知识）`, short label `科目二`
  - `security_privacy` -> `科目三（安全质量隐私）`, short label `科目三`
  - `refactoring` -> `科目四（重构知识）`, short label `科目四`
- Languages: `C`, `C++`, `Python`, `Java`, `JavaScript`, `Go`
- Levels:
  - `entry` -> `入门级`
  - `working` -> `工作级`
  - `professional` -> `专业级`
- Question types:
  - `single` -> `单选题`
  - `multiple` -> `多选题`
  - `judgment` -> `判断题`
- Question status:
  - `draft` -> `草稿`
  - `published` -> `已发布`
  - `archived` -> `已归档`
- Roles:
  - `learner` -> `学习者`
  - `content_admin` -> `题库管理员`
  - `system_admin` -> `系统管理员`

## Task 0: Isolated Workspace And Baseline

**Files:**
- Read: `docs/2026-05-03-sited-prd.md`
- Read: `ui-prototype/index.html`
- Read: `ui-prototype/styles.css`
- Read: `ui-prototype/app.js`

- [ ] Verify current branch and dirty files.
  - Run: `git branch --show-current`
  - Run: `git status --short`
  - Expected: current project may contain finalized PRD and prototype files. Do not revert them.
- [ ] Create an isolated worktree.
  - Preferred command: `git worktree add .worktrees\sited-p0 -b codex/sited-p0`
  - If local Git refuses nested `codex/` refs, use: `git worktree add .worktrees\sited-p0 -b codex-sited-p0`
  - Continue all implementation inside `C:\Users\27407\Desktop\SiTED\.worktrees\sited-p0`.
- [ ] Copy finalized untracked inputs from the main workspace into the worktree if Git did not bring them over.
  - Required inputs: `docs/2026-05-03-sited-prd.md`, `ui-prototype/`, `output/ui-prototype/` if screenshots are needed for visual checks.
- [ ] Confirm baseline.
  - Run: `Get-ChildItem -Force`
  - Run: `git status --short`
  - Expected: worktree is on implementation branch and contains the PRD/prototype inputs.

## Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `frontend/package.json`
- Create: `backend/package.json`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `backend/.env.example`
- Create: `frontend/.env.example`
- Modify: `.gitignore`

- [ ] Create npm workspaces with `frontend` and `backend`.
  - Root scripts must include `dev`, `build`, `test`, `lint`, `e2e`, `db:migrate`, `db:seed`.
  - `dev` should run backend and frontend concurrently.
- [ ] Scaffold the frontend with Vite React TypeScript.
  - Use `frontend/src` as the source root.
  - Use the existing prototype as the visual reference, not as production HTML.
- [ ] Scaffold the backend with NestJS TypeScript.
  - Use `backend/src` as the source root.
  - Put Prisma schema under `backend/prisma/schema.prisma`.
- [ ] Add local PostgreSQL configuration.
  - `docker-compose.yml` service name: `db`
  - Database: `sited`
  - User: `sited`
  - Password: `sited_dev_password`
  - Port: `5432`
- [ ] Add environment samples.
  - `DATABASE_URL=postgresql://sited:sited_dev_password@localhost:5432/sited?schema=public`
  - `ALLOWED_CIDR=10.0.0.0/8,127.0.0.1/32`
  - `TRUSTED_PROXY_CIDRS=127.0.0.1/32`
  - `SYSTEM_ADMIN_IPS=127.0.0.1,10.42.18.36`
  - `UPLOAD_ROOT=backend/uploads`
  - `EXAM_CONFIG_PATH=backend/config/exam-paper-config.yaml`
- [ ] Verify scaffold.
  - Run: `npm install`
  - Run: `npm run build`
  - Expected: both workspaces compile or fail only on not-yet-implemented imports introduced by later tasks.

## Task 2: Backend Domain Model And Prisma

**Files:**
- Create: `backend/prisma/schema.prisma`
- Create: `backend/src/domain/constants.ts`
- Create: `backend/src/domain/labels.ts`
- Create: `backend/src/domain/validation.ts`
- Create: `backend/src/prisma/prisma.module.ts`
- Create: `backend/src/prisma/prisma.service.ts`
- Test: `backend/src/domain/validation.spec.ts`

- [ ] Define Prisma enums for subject, language, level, question type, question status, role, exam status, audit action.
- [ ] Define models:
  - `Visitor`: `id`, `ip`, `firstSeenAt`, `lastSeenAt`
  - `IpRoleBinding`: `id`, `ip`, `role`, `description`, `permissions`, `createdAt`, `updatedAt`
  - `Question`: PRD fields including `sourceCode`, `stemMd`, `options`, `correctAnswers`, `explanationMd`, `memo`, `tags`, counters, status, creator IP, timestamps
  - `PracticeAttempt`: visitor, question, submitted answer, correctness, mode, timestamp
  - `Mistake`: unique visitor-question pair, wrong count, consecutive correct count, mastered flags and timestamps
  - `Bookmark`: unique visitor-question pair
  - `ExamAttempt`: visitor, subject, language, level, config snapshot, question snapshot, answers, status, score, pass flag, timestamps
  - `AuditLog`: actor IP, role, action, target, detail, timestamp
- [ ] Add indexes for question filters, visitor IP, review lookups, exam lookups, and audit timestamps.
- [ ] Implement validation helpers:
  - valid subject/language/level/type/status
  - valid 21 source combinations from the PRD
  - answer validation for single, multiple, judgment
  - display label conversion
- [ ] Write tests before implementation for valid combinations and answer validation.
  - Run: `npm run test --workspace backend -- validation`
  - Expected before implementation: fail because helpers are missing.
- [ ] Implement helpers and Prisma module.
- [ ] Run migration.
  - Run: `npm run db:migrate`
  - Expected: database schema is created successfully.

## Task 3: Backend Identity, IP Whitelist, And Roles

**Files:**
- Create: `backend/src/identity/ip-resolver.ts`
- Create: `backend/src/identity/identity.middleware.ts`
- Create: `backend/src/identity/identity.service.ts`
- Create: `backend/src/identity/roles.guard.ts`
- Create: `backend/src/identity/identity.controller.ts`
- Test: `backend/src/identity/ip-resolver.spec.ts`
- Test: `backend/src/identity/roles.guard.spec.ts`

- [ ] Implement IPv4-only request IP resolution.
  - Prefer direct socket IP unless the socket IP is in `TRUSTED_PROXY_CIDRS`.
  - If trusted proxy, use first valid IPv4 from `X-Forwarded-For`.
  - Normalize IPv4-mapped IPv6 such as `::ffff:127.0.0.1`.
- [ ] Implement `ALLOWED_CIDR` whitelist enforcement.
  - Reject non-whitelisted IPs with HTTP 403 and response code `IP_NOT_ALLOWED`.
- [ ] Implement role resolution.
  - If IP appears in `SYSTEM_ADMIN_IPS`, role is `system_admin`.
  - Else if an `IpRoleBinding` exists, use its role.
  - Else default to `learner`.
- [ ] Implement `GET /api/me`.
  - Response includes `ip`, `role`, `roleLabel`, and `permissions`.
  - Do not expose CIDR match details in UI-facing response.
- [ ] Test role hierarchy, CIDR allow/deny, trusted proxy behavior.
  - Run: `npm run test --workspace backend -- identity`

## Task 4: Backend Questions, Markdown, Uploads, Import And Export

**Files:**
- Create: `backend/src/questions/questions.module.ts`
- Create: `backend/src/questions/questions.controller.ts`
- Create: `backend/src/questions/questions.service.ts`
- Create: `backend/src/questions/markdown.service.ts`
- Create: `backend/src/questions/question-validator.ts`
- Create: `backend/src/admin/admin-questions.controller.ts`
- Create: `backend/src/admin/import-export.service.ts`
- Create: `backend/src/uploads/uploads.controller.ts`
- Create: `backend/src/uploads/uploads.service.ts`
- Test: `backend/src/questions/questions.service.spec.ts`
- Test: `backend/src/questions/markdown.service.spec.ts`
- Test: `backend/src/admin/import-export.service.spec.ts`

- [ ] Implement sanitized Markdown rendering.
  - Support fenced code blocks.
  - Highlight Java, C, C++, Python, JavaScript, Go.
  - Strip unsafe HTML and scripts.
- [ ] Implement public question APIs.
  - `GET /api/questions`: supports subject, language, level, type, tags, keyword, pagination.
  - `GET /api/questions/:id`: returns sanitized stem/explanation HTML, source metadata, options, tags, correctness stats.
  - Public APIs only return `published` questions.
- [ ] Implement admin question APIs.
  - Create, edit, publish, archive, list drafts/published/archived.
  - Admin detail returns raw Markdown plus rendered preview.
- [ ] Implement image upload.
  - Endpoint: `POST /api/admin/uploads/questions`
  - Require `content_admin` or `system_admin`.
  - Accept PNG, JPEG, WebP, GIF only.
  - Reject files over 5 MB.
  - Store under `backend/uploads/questions/<yyyyMM>/<uuid>.<ext>`.
  - Return `/uploads/questions/<yyyyMM>/<uuid>.<ext>`.
- [ ] Implement JSON import/export exactly matching PRD appendix.
  - Validate every row.
  - Return row-level errors without partially importing invalid batches.
  - Export excludes runtime counters unless PRD explicitly requires them.
- [ ] Test API behavior and validation.
  - Run: `npm run test --workspace backend -- questions`
  - Run: `npm run test --workspace backend -- import-export`

## Task 5: Backend Practice, Recite, Review, And Bookmarks

**Files:**
- Create: `backend/src/practice/practice.module.ts`
- Create: `backend/src/practice/practice.controller.ts`
- Create: `backend/src/practice/practice.service.ts`
- Create: `backend/src/review/review.module.ts`
- Create: `backend/src/review/review.controller.ts`
- Create: `backend/src/review/review.service.ts`
- Create: `backend/src/bookmarks/bookmarks.controller.ts`
- Create: `backend/src/bookmarks/bookmarks.service.ts`
- Test: `backend/src/practice/practice.service.spec.ts`
- Test: `backend/src/review/review.service.spec.ts`

- [ ] Implement `POST /api/practice/submit`.
  - Load the question from database.
  - Compare submitted answers by type.
  - Create `PracticeAttempt`.
  - Increment question attempt counters.
  - If wrong, create/update `Mistake` with `wrongCount + 1` and `consecutiveCorrect = 0`.
  - If correct for an existing unmastered mistake, increment `consecutiveCorrect`; mark mastered at 3 consecutive correct answers.
- [ ] Implement recite mode by frontend convention only.
  - Recite page uses question APIs and never calls practice submit.
- [ ] Implement review APIs.
  - `GET /api/review/mistakes`: wrong questions with mastery status.
  - `GET /api/review/bookmarks`: bookmarked questions.
  - `GET /api/review/records`: practice and exam records.
- [ ] Implement bookmark APIs.
  - `POST /api/bookmarks/:questionId`
  - `DELETE /api/bookmarks/:questionId`
- [ ] Test mastery state colors and status data.
  - `未掌握`, `连续答对 2 次`, `已掌握` must be distinct statuses.

## Task 6: Backend Exam Module

**Files:**
- Create: `backend/config/exam-paper-config.yaml`
- Create: `backend/src/exams/exams.module.ts`
- Create: `backend/src/exams/exams.controller.ts`
- Create: `backend/src/exams/exams.service.ts`
- Create: `backend/src/exams/exam-config.service.ts`
- Test: `backend/src/exams/exams.service.spec.ts`
- Test: `backend/src/exams/exam-config.service.spec.ts`

- [ ] Create YAML config from PRD:
  - programming: 45 minutes, judgment 8, single 22, multiple 10, pass score 60
  - security_privacy: 45 minutes, judgment 8, single 22, multiple 10, pass score 60
  - refactoring: 60 minutes, judgment 7, single 25, multiple 18, pass score 65
- [ ] Implement `POST /api/exams`.
  - Reject if there are not enough published questions for the selected subject/language/level/type counts.
  - Reuse or return active unfinished exam for the same visitor unless explicitly abandoned.
  - Save config snapshot and question snapshot.
- [ ] Implement `GET /api/exams/:id`.
  - Return active exam state or submitted review result.
- [ ] Implement `PATCH /api/exams/:id/answers`.
  - Autosave answers without scoring.
- [ ] Implement `POST /api/exams/:id/submit`.
  - Score all questions.
  - Mark pass/fail.
  - Record attempts for review history.
- [ ] Implement `POST /api/exams/:id/abandon`.
  - Mark exam abandoned and keep audit history.
- [ ] Test timing, scoring, insufficient question handling, active exam reuse, and review output.

## Task 7: Backend Admin Stats, Settings, Audit, And Data Clear

**Files:**
- Create: `backend/src/admin/admin-stats.controller.ts`
- Create: `backend/src/admin/admin-settings.controller.ts`
- Create: `backend/src/admin/admin-stats.service.ts`
- Create: `backend/src/admin/admin-settings.service.ts`
- Create: `backend/src/audit/audit.service.ts`
- Test: `backend/src/admin/admin-stats.service.spec.ts`
- Test: `backend/src/admin/admin-settings.service.spec.ts`

- [ ] Implement stats endpoints.
  - Current question count and published count.
  - Distribution by subject.
  - Top 10 low-correct-rate questions.
  - Today visitor count, practice count, exam count.
  - Seven-day trend data split into three series: visitors, practice questions, exams.
- [ ] Implement IP role binding endpoints.
  - Table must include headers: IP, fixed role, permission scope, description, updated time.
  - Role display must use readable labels, not raw `system_admin` text.
  - Permission list must show concrete permission names.
- [ ] Implement audit logs.
  - Record admin question changes, imports, exports, upload, data clear, role binding changes, exam abandon.
- [ ] Implement data clear.
  - Scopes: `activity`, `questions`, `all`.
  - Require confirmation phrase from PRD.
  - Delete question uploads when clearing `questions` or `all`.
  - Always write an audit log with actor IP, role, scope, and result.
- [ ] Test system admin restrictions and audit output.

## Task 8: Frontend Foundation

**Files:**
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/styles/tokens.css`
- Create: `frontend/src/styles/global.css`
- Create: `frontend/src/domain/labels.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/types.ts`
- Create: `frontend/src/layout/AppShell.tsx`
- Create: `frontend/src/layout/Sidebar.tsx`
- Create: `frontend/src/components/*`
- Test: `frontend/src/domain/labels.test.ts`

- [ ] Port design tokens from `ui-prototype/styles.css`.
  - Preserve blue/violet theme, 8px radius, card spacing, sidebar sizing, title hierarchy, and table spacing.
- [ ] Implement API client with JSON error handling.
- [ ] Implement route state using React Router.
  - Routes: `/`, `/questions`, `/practice`, `/recite`, `/review`, `/exam`, `/admin/questions`, `/admin/stats`, `/admin/settings`.
- [ ] Implement `AppShell`.
  - Sidebar with role identity card.
  - Top actions with notification icon, theme button, start practice button.
  - Hide admin routes for learners.
- [ ] Test label mapping and shell rendering.

## Task 9: Frontend Learner Pages

**Files:**
- Create: `frontend/src/pages/DashboardPage.tsx`
- Create: `frontend/src/pages/QuestionsPage.tsx`
- Create: `frontend/src/pages/PracticePage.tsx`
- Create: `frontend/src/pages/RecitePage.tsx`
- Create: `frontend/src/pages/ReviewPage.tsx`
- Create: `frontend/src/pages/ExamPage.tsx`
- Create: `frontend/src/components/TrainingCalendar.tsx`
- Create: `frontend/src/components/QuestionPreview.tsx`
- Create: `frontend/src/components/ReviewTabs.tsx`
- Test: `frontend/src/components/TrainingCalendar.test.tsx`
- Test: `frontend/src/pages/ReviewPage.test.tsx`

- [ ] Implement dashboard.
  - Training calendar title is `训练日历`.
  - Month switcher displays `2026 年 5 月`.
  - Calendar uses Monday-to-Sunday columns.
  - Calendar always renders 6 rows to avoid height jumps for 4, 5, or 6 week months.
  - Remove unrelated section-label text in dashboard cards.
- [ ] Implement question browser.
  - Filter button text: `按当前筛选练习`.
  - Subject options use `科目X（XXXX）`.
  - Levels include `级`.
  - Preview panel has its own card background, larger `题目预览` title, and spaced tags/buttons.
- [ ] Implement practice page.
  - Right cards title sizes match page section titles.
  - Current filter and quick status panels use consistent card dimensions.
  - Submit answer and next question behavior is local until backend response arrives.
- [ ] Implement recite page.
  - Uses same question renderer as practice.
  - Does not submit attempts.
- [ ] Implement review page.
  - Remove meaningless header text if it does not add function.
  - Right tab controls aligned and compact.
  - Three panels truly switch: mistakes, bookmarks, records.
  - Table operation column aligns header and action buttons.
  - Records use subject short names like `科目二`, not long subject names.
  - `未掌握` and `已掌握` use distinct colors.
- [ ] Implement exam page.
  - Exam title uses subject short label, language, and level.
  - Answer card, autosave state, submit confirmation, and review state match PRD.

## Task 10: Frontend Admin Pages

**Files:**
- Create: `frontend/src/pages/AdminQuestionsPage.tsx`
- Create: `frontend/src/pages/AdminStatsPage.tsx`
- Create: `frontend/src/pages/AdminSettingsPage.tsx`
- Create: `frontend/src/components/MarkdownEditor.tsx`
- Create: `frontend/src/components/TrendChart.tsx`
- Create: `frontend/src/components/StatsPanel.tsx`
- Create: `frontend/src/components/RoleBindingTable.tsx`
- Test: `frontend/src/components/TrendChart.test.tsx`
- Test: `frontend/src/pages/AdminSettingsPage.test.tsx`

- [ ] Implement admin question editor.
  - Field label: `题干（支持 Markdown 语法）`.
  - Include source code in the stem sample and render it as highlighted Markdown code.
  - Type dropdown values: `单选题`, `多选题`, `判断题`.
  - Options are one row per option.
  - Buttons are bottom-right and do not reduce editing area.
  - Live preview panel title is larger and uses the same background-card style as question browser preview.
- [ ] Implement admin stats page.
  - Top metrics across the page.
  - Bank stats and training stats split page width 50/50.
  - Bank stats show total, distribution, and Top10 low-correct-rate questions with consistent internal spacing.
  - Training stats show three separate charts, not one mixed-scale chart.
  - Each chart has aligned x-axis labels, y-axis labels, units, hover tooltip, and consistent bar positioning.
- [ ] Implement admin settings page.
  - IP fixed role binding appears above danger zone.
  - Table has headers.
  - Role names are readable.
  - Permission cell shows concrete permission options.
  - Danger zone removes redundant section label and remains visually distinct.

## Task 11: Seed Data And Local Verification

**Files:**
- Create: `backend/prisma/seed.ts`
- Create: `backend/src/testing/fixtures.ts`
- Create: `frontend/tests/e2e/*.spec.ts`
- Modify: `package.json`

- [ ] Seed visitors, role bindings, questions, attempts, mistakes, bookmarks, exams, and audit logs.
- [ ] Include examples for all subjects, all languages, all levels, and all question types.
- [ ] Include enough published questions for at least one successful exam config.
- [ ] Add Playwright tests:
  - learner dashboard loads
  - question browser filter and preview work
  - practice submit updates feedback
  - review tabs switch
  - exam create-save-submit works
  - admin question editor preview renders highlighted code
  - admin stats charts render with aligned axes
  - admin settings table headers and permissions render
- [ ] Run verification.
  - `npm run lint`
  - `npm run test`
  - `npm run build`
  - `npm run e2e`

## Task 12: Final Review And Completion

**Files:**
- Modify: `README.md`
- Optional Create: `docs/development.md`

- [ ] Document local startup.
  - `npm install`
  - `docker compose up -d db`
  - `npm run db:migrate`
  - `npm run db:seed`
  - `npm run dev`
- [ ] Document environment variables and default admin IP behavior.
- [ ] Run final full verification.
  - `git status --short`
  - `npm run lint`
  - `npm run test`
  - `npm run build`
  - `npm run e2e`
- [ ] Use `superpowers:finishing-a-development-branch`.
  - Present merge/PR/cleanup options.
  - Do not claim completion until verification commands have passed or failures are explicitly documented.

## Subagent Review Rules

For every task:

- The implementer subagent must receive only:
  - this plan file path
  - the exact task text
  - relevant PRD/prototype file paths
  - current branch/worktree path
- After implementation, run spec-compliance review before code-quality review.
- If spec review fails, send the same implementer back to fix gaps.
- If quality review fails, send the same implementer back to fix issues.
- Do not dispatch multiple implementers concurrently against the same files.
- Do not skip tests because the task is "just UI" or "just config".

## Acceptance Criteria

- All P0 routes from the PRD are implemented and navigable.
- All P0 API endpoints listed in this plan respond with role-appropriate behavior.
- Learner, content admin, and system admin experiences are separated by IP-derived role.
- Markdown code blocks are rendered with syntax highlighting and sanitized output.
- Review tabs, exam autosave, dashboard calendar, admin charts, and admin settings table behave as specified in the finalized UI comments.
- The app can be started from a clean clone with README instructions and local PostgreSQL.
- `npm run lint`, `npm run test`, `npm run build`, and `npm run e2e` pass before final handoff, or any remaining failure is documented with exact command output and remediation.
