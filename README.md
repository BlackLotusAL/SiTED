# SiTED

Silicon Trusted Engineering Dojo is an internal training platform for trusted software engineering practice, recitation, review, mock exams, and P0 question-bank administration.

## Prerequisites

- Node.js 22 or newer with npm
- Docker Desktop with Docker Compose
- PostgreSQL is provided by `docker-compose.yml`

## Local Startup

From the repository root:

```powershell
npm install
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

Open the frontend at `http://127.0.0.1:5173`. The backend listens on `http://127.0.0.1:3000` and serves API routes under `/api/*`.

On Windows, if Prisma cannot connect through `localhost`, use `127.0.0.1` in `DATABASE_URL`.

## Environment

Copy the sample files when customizing local settings:

- `.env.example`
- `backend/.env.example`
- `frontend/.env.example`

Key backend variables:

```env
DATABASE_URL=postgresql://sited:sited_dev_password@127.0.0.1:5432/sited?schema=public
ALLOWED_CIDR=10.0.0.0/8,127.0.0.1/32
TRUSTED_PROXY_CIDRS=127.0.0.1/32
SYSTEM_ADMIN_IPS=127.0.0.1,10.42.18.36
UPLOAD_ROOT=backend/uploads
EXAM_CONFIG_PATH=backend/config/exam-paper-config.yaml
```

Default role behavior:

- `SYSTEM_ADMIN_IPS` always resolves to `system_admin`.
- IP role bindings can assign `learner` or `content_admin`.
- IP role bindings do not assign `system_admin`; that role only comes from `SYSTEM_ADMIN_IPS`.
- Unbound allowed IPs default to `learner`.

## Useful Commands

```powershell
npm run lint
npm run test
npm run build
npm run e2e
npm run db:seed
```

`npm run e2e` starts the real backend and frontend, seeds the local database first, and then runs Playwright readiness checks.

The seed is intended for local development. It creates deterministic `SITED-SEED*` questions plus seeded visitors, role bindings, activity records, exams, and audit logs. Re-running the seed updates seed-owned records without clearing unrelated local data.
