"""Declarative metadata aggregation point for Alembic autogenerate.

``Base`` is defined in ``app.models.base``. Every model module MUST be imported
here so that ``Base.metadata`` is fully populated when Alembic inspects it.
Add new imports as each module is built.
"""

from app.models.base import Base  # noqa: F401

# --- Module model registrations (add new modules here as they are built) ---
# Module 1 — Auth & Roles
from app.models.company import Company  # noqa: F401
from app.models.user import (  # noqa: F401
    PasswordResetToken,
    Permission,
    RefreshToken,
    Role,
    User,
    role_permissions,
    user_roles,
)

# Lookups (countries, languages, niches)
from app.models.lookups import Country, Language, Niche  # noqa: F401

# Module 3 — Projects + Module 4 — Goals/Budgets
from app.models.project import (  # noqa: F401
    Project,
    ProjectMember,
    ProjectMonthlyBudget,
    ProjectMonthlyGoal,
)

# Module 11 — Activity logs
from app.models.activity import ActivityLog  # noqa: F401
# Module 5 — Guest Posts
from app.models.guest_post import (  # noqa: F401
    GuestPost,
    GuestPostStatusHistory,
    OutreachMessage,
)
# Module 6 — Website Database
from app.models.website import (  # noqa: F401
    Website,
    WebsiteContact,
    WebsiteMetricsHistory,
    website_niches,
)
# Module 7 — Payments
from app.models.payment import Payment, PaymentStatusHistory  # noqa: F401
# Module 8 — Tasks
from app.models.task import Task, TaskComment  # noqa: F401
# Module 9 — Notifications
from app.models.notification import Notification  # noqa: F401
# Phase 1 RBAC — Teams
from app.models.team import Team, team_members  # noqa: F401
# Phase 2 — Import engine (audit log + rollback)
from app.models.import_batch import ImportBatch, ImportRecord  # noqa: F401
# Module 11 — Activity logs
# from app.models.activity_log import ActivityLog  # noqa: F401
