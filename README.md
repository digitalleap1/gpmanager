# Digital Leap — Guest Post Operations Management System (GPOMS)

A professional Guest Post Operations Management System that replaces Google Sheets and
manual tracking. Runs on localhost for internal company use and is architected to scale
into a multi-tenant SaaS platform.

## Tech Stack

| Layer        | Technology |
|--------------|------------|
| Backend      | Python, FastAPI, SQLAlchemy 2.0, Alembic |
| Database     | PostgreSQL 16 (local via Docker → Neon in production) |
| Frontend     | Next.js (App Router), React, TypeScript, Tailwind CSS, ShadCN UI |
| Auth         | JWT access + refresh tokens, role-based access control |
| File Storage | Local (dev) → S3 / Supabase Storage (prod) |

## Repository Layout

```text
guestpost-saas/
├── backend/      # FastAPI app — clean architecture (routes → services → repositories → models)
├── frontend/     # Next.js app (App Router) + Tailwind + ShadCN
├── docs/         # Planning deliverables: schema, ER diagram, API list, wireframes, roadmap
├── docker-compose.yml
└── .env.example
```

See [docs/architecture/folder-structure.md](docs/architecture/folder-structure.md) for the full tree.

## Quick Start (local development)

### 1. Configure environment

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 2. Bring up the stack with Docker

```bash
# Full stack (db + pgAdmin + backend + frontend)
docker compose up --build

# Or just the database infrastructure (run backend/frontend natively)
docker compose up db pgadmin
```

| Service   | URL                          |
|-----------|------------------------------|
| Frontend  | http://localhost:3000        |
| Backend   | http://localhost:8000        |
| API docs  | http://localhost:8000/docs   |
| pgAdmin   | http://localhost:5050        |

### 3. Run the backend natively (alternative)

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate    # Windows
pip install -r requirements.txt -r requirements-dev.txt
alembic upgrade head        # apply migrations (once models exist)
uvicorn app.main:app --reload
```

### 4. Run the frontend natively (alternative)

```bash
cd frontend
npm install
npm run dev
```

## Build Order

This repo is built **module by module**. Current status:

- [x] **Step 0 — Planning & scaffolding** (this commit): monorepo, Docker, planning docs
- [ ] Step 1 — Auth & Roles (Module 1)
- [ ] Step 2 — Dashboard + Project Management (Modules 2–3)
- [ ] Step 3 — Guest Post Tracker (Module 5)
- [ ] Step 4 — Website Database (Module 6)
- [ ] Step 5 — Payment Management (Module 7)
- [ ] Step 6 — Task Management (Module 8)
- [ ] Step 7 — Notifications (Module 9)
- [ ] Step 8 — Reports & Exports (Module 10)
- [ ] Step 9 — Automations
- [ ] Step 10 — SaaS conversion (multi-company)

See [docs/roadmap/sprint-plan.md](docs/roadmap/sprint-plan.md) for the full plan.

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/database/schema.sql](docs/database/schema.sql) | Full PostgreSQL DDL |
| [docs/database/er-diagram.md](docs/database/er-diagram.md) | Entity-relationship diagram (Mermaid) |
| [docs/database/data-dictionary.md](docs/database/data-dictionary.md) | Table & column reference |
| [docs/api/endpoints.md](docs/api/endpoints.md) | REST API endpoint reference |
| [docs/architecture/automation-flows.md](docs/architecture/automation-flows.md) | Automation workflow diagrams |
| [docs/architecture/user-flows.md](docs/architecture/user-flows.md) | User flow diagrams |
| [docs/architecture/saas-conversion.md](docs/architecture/saas-conversion.md) | Multi-tenant strategy |
| [docs/wireframes/wireframes.md](docs/wireframes/wireframes.md) | UI wireframes per module |
| [docs/roadmap/sprint-plan.md](docs/roadmap/sprint-plan.md) | Sprint plan & roadmap |
