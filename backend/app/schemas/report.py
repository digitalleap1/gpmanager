"""Report DTOs (Module 10). Reports use a generic columns+rows shape so the UI
renders any of them with one table component.
"""

from typing import Any

from pydantic import BaseModel


class ReportColumn(BaseModel):
    key: str
    label: str


class ReportResult(BaseModel):
    report_type: str
    columns: list[ReportColumn]
    rows: list[dict[str, Any]]
    totals: dict[str, Any] | None = None
