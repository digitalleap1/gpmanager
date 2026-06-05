# Folder Structure

The monorepo holds two deployable apps (`backend`, `frontend`), planning `docs`,
and infrastructure files at the root.

```text
guestpost-saas/
├── docker-compose.yml          # Postgres + pgAdmin + backend + frontend
├── .env.example                # Root env (compose variable substitution)
├── README.md
│
├── backend/                    # FastAPI service (clean architecture)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── pyproject.toml          # ruff / mypy / pytest config
│   ├── alembic.ini
│   ├── .env.example
│   ├── alembic/                # Migrations
│   │   ├── env.py              # Pulls DATABASE_URL + metadata from the app
│   │   ├── script.py.mako
│   │   └── versions/           # Generated migration scripts
│   ├── app/
│   │   ├── main.py             # FastAPI app, CORS, router mount, liveness
│   │   ├── core/               # Cross-cutting concerns
│   │   │   ├── config.py       # pydantic-settings Settings
│   │   │   └── security.py     # password hashing + JWT helpers
│   │   ├── database/
│   │   │   ├── session.py      # engine, SessionLocal, get_db dependency
│   │   │   └── base.py         # Base + imports all models (for Alembic)
│   │   ├── models/             # SQLAlchemy ORM models (persistence)
│   │   │   └── base.py         # DeclarativeBase + Timestamp/UUID mixins
│   │   ├── schemas/            # Pydantic DTOs (request/response contracts)
│   │   │   └── common.py       # Message, Page[T], PaginationParams
│   │   ├── repositories/       # DB query layer (only layer touching sessions)
│   │   │   └── base.py         # Generic CRUD repository
│   │   ├── services/           # Business logic / orchestration
│   │   ├── routes/             # Thin HTTP controllers
│   │   │   └── api.py          # Aggregate router (mounts module routers)
│   │   └── utils/              # Framework-free helpers
│   ├── scripts/
│   │   └── seed.py             # Seed roles + bootstrap admin (Module 1)
│   └── tests/
│       └── test_health.py      # Smoke tests
│
├── frontend/                   # Next.js (App Router) + Tailwind + ShadCN
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   ├── components.json         # ShadCN config
│   ├── .env.example
│   ├── app/                    # Routes (App Router)
│   │   ├── layout.tsx
│   │   ├── globals.css         # Tailwind + ShadCN design tokens
│   │   ├── page.tsx            # Landing
│   │   ├── login/page.tsx
│   │   └── profile/page.tsx
│   ├── components/
│   │   └── ui/                 # ShadCN-generated components
│   ├── lib/
│   │   ├── utils.ts            # cn() class merger
│   │   └── api.ts              # Typed fetch client
│   ├── hooks/                  # React hooks (useAuth, ...)
│   └── services/               # Typed API service modules
│
└── docs/                       # Planning deliverables
    ├── README.md               # Docs index
    ├── database/
    │   ├── schema.sql          # Full DDL (~50 tables) — design reference
    │   ├── er-diagram.md       # Mermaid ER diagrams (by domain)
    │   └── data-dictionary.md  # Table & column reference
    ├── api/
    │   └── endpoints.md        # REST API surface
    ├── architecture/
    │   ├── folder-structure.md # (this file)
    │   ├── automation-flows.md # Automation workflow diagrams
    │   ├── user-flows.md       # Role-based user flows
    │   └── saas-conversion.md  # Multi-tenant strategy
    ├── wireframes/
    │   └── wireframes.md       # UI wireframes per module
    └── roadmap/
        └── sprint-plan.md      # Sprint plan & roadmap
```

## Architectural layers (backend)

Requests flow **down** through the layers; lower layers never import higher ones:

```text
routes/      HTTP controllers — parse request, check auth, return DTOs
   │ depends on
services/    Business logic, transactions, automations, cross-entity rules
   │ depends on
repositories/  All SQLAlchemy queries (the only layer with session access)
   │ depends on
models/      ORM entities mapped to tables
```

`schemas/` (DTOs) cross all layers as the data contract; `core/` (config,
security) and `utils/` are dependency-free leaves any layer may use.

**Why this matters for SaaS:** services receive the `company_id` from the auth
layer and pass it to repositories, which always filter by it. Tenant isolation
lives in one place and is unit-testable without HTTP.

## Naming conventions

| Thing | Convention | Example |
|-------|------------|---------|
| Python modules/files | `snake_case` | `guest_post.py` |
| SQLAlchemy models | `PascalCase`, singular | `GuestPost` |
| DB tables | `snake_case`, plural | `guest_posts` |
| Pydantic schemas | `PascalCase` + suffix | `GuestPostCreate`, `GuestPostRead` |
| Repositories / services | `<Entity>Repository` / `<Entity>Service` | `PaymentService` |
| API route files | `snake_case`, plural | `routes/guest_posts.py` |
| Frontend components | `PascalCase` | `ProjectTable.tsx` |
| Frontend route folders | `kebab-case` | `app/guest-posts/` |

## Per-module file pattern (added in each sprint)

Building a module touches one file per layer — e.g. Module 5 (Guest Posts):

```text
backend/app/models/guest_post.py          # GuestPost, GuestPostStatusHistory, OutreachMessage
backend/app/schemas/guest_post.py         # Create / Update / Read / StatusChange DTOs
backend/app/repositories/guest_post.py    # GuestPostRepository
backend/app/services/guest_post.py        # GuestPostService (+ publish automation hook)
backend/app/routes/guest_posts.py         # router → mounted in routes/api.py
backend/tests/test_guest_posts.py
frontend/app/guest-posts/page.tsx         # list + filters
frontend/services/guestPostService.ts     # typed API calls
```
