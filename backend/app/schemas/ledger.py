"""Payments-ledger dashboard DTOs (Phase 2)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel


class MonthlyRevenuePoint(BaseModel):
    year: int
    month: int
    revenue: float


class NamedRevenue(BaseModel):
    id: uuid.UUID | None
    name: str
    revenue: float


class StatusBreakdown(BaseModel):
    status: str
    count: int
    amount: float


class LedgerStats(BaseModel):
    total_revenue: float
    pending_count: int
    pending_amount: float
    overdue_count: int
    overdue_amount: float
    monthly_revenue: list[MonthlyRevenuePoint]
    client_revenue: list[NamedRevenue]
    team_revenue: list[NamedRevenue]
    status_breakdown: list[StatusBreakdown]
