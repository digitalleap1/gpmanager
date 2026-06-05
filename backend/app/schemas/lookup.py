"""Lookup DTOs: countries, niches, languages."""

from pydantic import BaseModel, ConfigDict


class CountryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    iso_code: str
    name: str


class NicheRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    parent_id: int | None = None


class LanguageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    iso_code: str
    name: str
