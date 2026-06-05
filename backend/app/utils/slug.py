"""Slug / string helpers."""

import re

_slug_re = re.compile(r"[^a-z0-9]+")


def slugify(value: str) -> str:
    """Lowercase, hyphenate, and strip a string into a URL-safe slug."""
    return _slug_re.sub("-", value.strip().lower()).strip("-")
