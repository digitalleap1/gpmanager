# GPOMS — Planning Documentation

Planning deliverables for the Digital Leap Guest Post Operations Management
System, produced before module coding so the database and SaaS conversion don't
need rework later.

## Index

### Database
- **[database/schema.sql](database/schema.sql)** — full PostgreSQL DDL, ~50 tables across all 11 modules + Phase 2/3. The canonical design reference.
- **[database/er-diagram.md](database/er-diagram.md)** — Mermaid ER diagrams grouped by domain, plus a domain map.
- **[database/data-dictionary.md](database/data-dictionary.md)** — table & column reference with enum definitions.

### API
- **[api/endpoints.md](api/endpoints.md)** — REST endpoint surface by module, with roles, filters, and conventions. (Live spec: `/docs`.)

### Architecture
- **[architecture/folder-structure.md](architecture/folder-structure.md)** — monorepo layout, clean-architecture layers, naming conventions.
- **[architecture/automation-flows.md](architecture/automation-flows.md)** — event-driven automations (publish→goal, paid→budget, overdue tasks, notification fan-out) as Mermaid diagrams.
- **[architecture/user-flows.md](architecture/user-flows.md)** — role-based user journeys (auth, RBAC, project/guest-post/payment lifecycles).
- **[architecture/saas-conversion.md](architecture/saas-conversion.md)** — multi-tenant strategy, tenant isolation, Stripe billing, plan gating, migration checklist.

### Design
- **[wireframes/wireframes.md](wireframes/wireframes.md)** — low-fidelity wireframes for every screen.

### Roadmap
- **[roadmap/sprint-plan.md](roadmap/sprint-plan.md)** — phased roadmap and 2-week sprint breakdown with Definitions of Done.

## How these fit together

```text
schema.sql ──► models (SQLAlchemy) ──► Alembic migrations ──► live DB
    │                                                             ▲
    └──► data-dictionary / er-diagram (human-readable views)      │
endpoints.md ──► routes/services/repositories ───────────────────┘
wireframes.md ──► Next.js pages/components
automation-flows / user-flows ──► service-layer behavior + UI flows
sprint-plan.md ──► build order (module by module)
saas-conversion.md ──► Phase 3 (company_id already in every table)
```

## Viewing Mermaid diagrams

The `.md` files use Mermaid fenced code blocks. They render on GitHub, in VS Code
(with a Mermaid extension), and in most Markdown previewers.
