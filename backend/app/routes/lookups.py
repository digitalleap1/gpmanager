"""Lookup routes: countries, niches, languages."""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.currencies import CURRENCIES
from app.database.session import get_db
from app.repositories.lookup import CountryRepository, LanguageRepository, NicheRepository
from app.routes.deps import CurrentUser
from app.schemas.lookup import CountryRead, LanguageRead, NicheRead

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


class CurrencyRead(BaseModel):
    code: str
    symbol: str
    name: str


@router.get("/currencies", response_model=list[CurrencyRead])
def list_currencies(user: CurrentUser) -> list[CurrencyRead]:
    return [CurrencyRead(code=c, symbol=s, name=n) for c, s, n in CURRENCIES]


@router.get("/countries", response_model=list[CountryRead])
def list_countries(user: CurrentUser, db: DbSession) -> list[CountryRead]:
    return [CountryRead.model_validate(c) for c in CountryRepository(db).all_ordered()]


@router.get("/niches", response_model=list[NicheRead])
def list_niches(user: CurrentUser, db: DbSession) -> list[NicheRead]:
    return [NicheRead.model_validate(n) for n in NicheRepository(db).all_ordered()]


@router.get("/languages", response_model=list[LanguageRead])
def list_languages(user: CurrentUser, db: DbSession) -> list[LanguageRead]:
    return [LanguageRead.model_validate(lang) for lang in LanguageRepository(db).all_ordered()]
