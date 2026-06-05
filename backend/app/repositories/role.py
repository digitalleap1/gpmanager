"""Role & permission persistence queries."""

from sqlalchemy import select

from app.models.user import Permission, Role
from app.repositories.base import BaseRepository


class RoleRepository(BaseRepository[Role]):
    model = Role

    def get_system_role(self, slug: str) -> Role | None:
        stmt = select(Role).where(Role.slug == slug, Role.company_id.is_(None))
        return self.db.scalars(stmt).first()


class PermissionRepository(BaseRepository[Permission]):
    model = Permission

    def get_by_code(self, code: str) -> Permission | None:
        return self.db.scalars(select(Permission).where(Permission.code == code)).first()
