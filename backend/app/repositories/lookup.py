"""Lookup queries (countries, niches, languages)."""

from collections.abc import Sequence

from sqlalchemy import select

from app.models.lookups import Country, Language, Niche
from app.repositories.base import BaseRepository


class CountryRepository(BaseRepository[Country]):
    model = Country

    def all_ordered(self) -> Sequence[Country]:
        return self.db.scalars(select(Country).order_by(Country.name)).all()


class NicheRepository(BaseRepository[Niche]):
    model = Niche

    def all_ordered(self) -> Sequence[Niche]:
        return self.db.scalars(select(Niche).order_by(Niche.name)).all()


class LanguageRepository(BaseRepository[Language]):
    model = Language

    def all_ordered(self) -> Sequence[Language]:
        return self.db.scalars(select(Language).order_by(Language.name)).all()
