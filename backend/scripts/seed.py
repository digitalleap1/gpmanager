"""Seed roles, permissions, the default company, and the bootstrap admin user.

Idempotent — safe to run repeatedly.

Usage (from the backend/ directory, with migrations already applied):
    python -m scripts.seed
"""

from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.database.session import SessionLocal
from app.models.company import Company
from app.models.lookups import Country, Language, Niche
from app.models.user import Permission, Role, User
from app.utils.slug import slugify

# (iso_code, name)
COUNTRIES: list[tuple[str, str]] = [
    ("WW", "Worldwide"),
    ("US", "United States"), ("GB", "United Kingdom"), ("CA", "Canada"),
    ("AU", "Australia"), ("IN", "India"), ("DE", "Germany"), ("FR", "France"),
    ("ES", "Spain"), ("IT", "Italy"), ("NL", "Netherlands"), ("AE", "United Arab Emirates"),
    ("SG", "Singapore"), ("BR", "Brazil"), ("MX", "Mexico"), ("ZA", "South Africa"),
    ("JP", "Japan"), ("SE", "Sweden"), ("PL", "Poland"), ("IE", "Ireland"), ("NZ", "New Zealand"),
]

LANGUAGES: list[tuple[str, str]] = [
    ("en", "English"), ("es", "Spanish"), ("fr", "French"), ("de", "German"),
    ("it", "Italian"), ("pt", "Portuguese"), ("nl", "Dutch"), ("hi", "Hindi"),
    ("ar", "Arabic"), ("zh", "Chinese"), ("ja", "Japanese"), ("ru", "Russian"),
    ("sv", "Swedish"), ("pl", "Polish"), ("tr", "Turkish"), ("id", "Indonesian"),
    ("ko", "Korean"), ("vi", "Vietnamese"), ("th", "Thai"), ("multi", "Multilingual"),
]

NICHES: list[str] = [
    "Technology", "SaaS", "Finance", "Health & Wellness", "Marketing", "Travel",
    "Real Estate", "Education", "E-commerce", "Legal", "Automotive", "Food & Beverage",
    "Fashion", "Home & Garden", "Sports", "Gaming", "Cryptocurrency", "B2B", "Lifestyle",
    "Business",
    # Digital Leap's real niche taxonomy (the Master workbook's niche tabs).
    "Accounting & Taxation", "Advertising & Marketing", "Auto & Moto",
    "Education & Training", "Business & Finance", "Beauty", "Health & Fitness",
    "Fashion & Lifestyle", "Parenting", "Firearms", "Law", "LGBTQ", "Logistics",
    "Moving & Storage", "Home", "Online Gaming", "Food & Nutrition", "Multi Niche",
    "Event Wedding & BDY",
]

# (code, module, description)
PERMISSIONS: list[tuple[str, str, str]] = [
    ("dashboard.view", "dashboard", "View the dashboard"),
    ("project.view", "project", "View projects"),
    ("project.create", "project", "Create projects"),
    ("project.update", "project", "Edit projects"),
    ("project.delete", "project", "Delete projects"),
    ("project.export", "project", "Export projects"),
    ("goal.manage", "goal", "Manage project goals & budgets"),
    ("guest_post.view", "guest_post", "View guest posts"),
    ("guest_post.create", "guest_post", "Create guest posts"),
    ("guest_post.update", "guest_post", "Edit guest posts"),
    ("guest_post.delete", "guest_post", "Delete guest posts"),
    ("website.view", "website", "View websites"),
    ("website.create", "website", "Create websites"),
    ("website.update", "website", "Edit websites"),
    ("website.delete", "website", "Delete websites"),
    ("website.import", "website", "Bulk import websites"),
    ("payment.view", "payment", "View payments"),
    ("payment.create", "payment", "Create payments"),
    ("payment.update", "payment", "Edit payments"),
    ("payment.manage", "payment", "Approve / change payment status"),
    ("task.view", "task", "View tasks"),
    ("task.create", "task", "Create tasks"),
    ("task.update", "task", "Edit tasks"),
    ("task.delete", "task", "Delete tasks"),
    ("report.view", "report", "View reports"),
    ("report.export", "report", "Export reports"),
    ("notification.view", "notification", "View notifications"),
    ("activity_log.view", "activity_log", "View activity logs"),
    ("user.view", "user", "View users"),
    ("user.manage", "user", "Manage users & invitations"),
    ("team.view", "team", "View teams"),
    ("team.manage", "team", "Create & manage teams and membership"),
    ("role.manage", "role", "Manage roles & permissions"),
    ("settings.manage", "settings", "Manage system settings"),
]

# Role slug -> set of permission codes, or "*" for all.
ROLE_PERMISSIONS: dict[str, set[str] | str] = {
    "admin": "*",
    "team_lead": {
        "dashboard.view",
        "project.view", "project.create", "project.update", "project.delete", "project.export",
        "goal.manage",
        "guest_post.view", "guest_post.create", "guest_post.update", "guest_post.delete",
        "website.view", "website.create", "website.update", "website.import",
        "payment.view", "payment.create", "payment.update", "payment.manage",
        "task.view", "task.create", "task.update", "task.delete",
        "report.view", "report.export",
        "notification.view", "activity_log.view", "user.view", "team.view",
    },
    "user": {
        "dashboard.view",
        "project.view",
        "guest_post.view", "guest_post.create", "guest_post.update",
        "website.view", "website.create", "website.update",
        "payment.view", "payment.create",
        "task.view", "task.update",
        "notification.view",
    },
    "content_writer": {
        "dashboard.view",
        "project.view",
        "guest_post.view", "guest_post.update",
        "task.view", "task.update",
        "notification.view",
    },
}

ROLES: list[tuple[str, str]] = [
    ("admin", "Admin"),
    ("team_lead", "Team Lead"),
    ("user", "User"),
    ("content_writer", "Content Writer"),
]


def seed_lookups(db) -> None:
    existing_countries = {c.iso_code for c in db.scalars(select(Country)).all()}
    new_countries = 0
    for iso, name in COUNTRIES:
        if iso not in existing_countries:
            db.add(Country(iso_code=iso, name=name))
            new_countries += 1
    existing_niches = {n.slug for n in db.scalars(select(Niche)).all()}
    new_niches = 0
    for name in NICHES:
        slug = slugify(name)
        if slug not in existing_niches:
            db.add(Niche(name=name, slug=slug))
            new_niches += 1
    existing_langs = {lang.iso_code for lang in db.scalars(select(Language)).all()}
    new_langs = 0
    for iso, name in LANGUAGES:
        if iso not in existing_langs:
            db.add(Language(iso_code=iso, name=name))
            new_langs += 1
    db.flush()
    print(f"  + lookups: {new_countries} countries, {new_niches} niches, {new_langs} languages added")


def get_or_create_company(db) -> Company:
    company = db.scalars(select(Company).where(Company.slug == "digital-leap")).first()
    if company is None:
        company = Company(name="Digital Leap", slug="digital-leap", plan_tier="agency")
        db.add(company)
        db.flush()
        print(f"  + created company: {company.name}")
    return company


def seed_permissions(db) -> dict[str, Permission]:
    existing = {p.code: p for p in db.scalars(select(Permission)).all()}
    created = 0
    for code, module, desc in PERMISSIONS:
        if code not in existing:
            perm = Permission(code=code, module=module, description=desc)
            db.add(perm)
            existing[code] = perm
            created += 1
    db.flush()
    print(f"  + permissions: {created} new, {len(existing)} total")
    return existing


def seed_roles(db, perms: dict[str, Permission]) -> dict[str, Role]:
    roles: dict[str, Role] = {}
    for slug, name in ROLES:
        role = db.scalars(
            select(Role).where(Role.slug == slug, Role.company_id.is_(None))
        ).first()
        if role is None:
            role = Role(slug=slug, name=name, scope="system", description=f"System {name} role")
            db.add(role)
            db.flush()
            print(f"  + created role: {slug}")
        wanted = set(perms) if ROLE_PERMISSIONS[slug] == "*" else ROLE_PERMISSIONS[slug]
        current = {p.code for p in role.permissions}
        for code in wanted:
            if code not in current and code in perms:
                role.permissions.append(perms[code])
        roles[slug] = role
    db.flush()
    return roles


def seed_admin(db, company: Company, roles: dict[str, Role]) -> None:
    email = settings.FIRST_ADMIN_EMAIL.lower()
    user = db.scalars(select(User).where(User.email == email)).first()
    if user is None:
        user = User(
            company_id=company.id,
            email=email,
            full_name="Administrator",
            hashed_password=hash_password(settings.FIRST_ADMIN_PASSWORD),
            status="active",
            is_superuser=True,
        )
        db.add(user)
        db.flush()
        print(f"  + created admin user: {email}")
    else:
        print(f"  = admin user already exists: {email}")
    if "admin" not in {r.slug for r in user.roles}:
        user.roles.append(roles["admin"])


def main() -> None:
    print("Seeding GPOMS...")
    db = SessionLocal()
    try:
        seed_lookups(db)
        company = get_or_create_company(db)
        perms = seed_permissions(db)
        roles = seed_roles(db, perms)
        seed_admin(db, company, roles)
        db.commit()
    finally:
        db.close()
    print("Seed complete.")
    print(f"  Login at /login with: {settings.FIRST_ADMIN_EMAIL}")
    print("  Password: value of FIRST_ADMIN_PASSWORD in backend/.env")


if __name__ == "__main__":
    main()
