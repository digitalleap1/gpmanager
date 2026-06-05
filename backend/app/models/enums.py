"""Domain enums.

Stored as VARCHAR in the database during early development to keep migrations
simple; values are validated at the API (Pydantic) layer. The target design in
``docs/database/schema.sql`` promotes these to native PostgreSQL ENUM types.
"""

import enum


class UserStatus(str, enum.Enum):
    active = "active"
    invited = "invited"
    suspended = "suspended"
    deactivated = "deactivated"


class RoleScope(str, enum.Enum):
    system = "system"
    custom = "custom"


class RoleSlug(str, enum.Enum):
    admin = "admin"
    team_lead = "team_lead"
    user = "user"
