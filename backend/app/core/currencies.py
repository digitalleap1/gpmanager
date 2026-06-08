"""Supported currencies for payments (Phase 2).

Payments are stored in their native currency + a manual FX rate to USD, and the
USD-normalized amount is derived for reporting. USD is the canonical/reporting
currency (matching the existing dashboards and the team's spreadsheets).
"""

# (code, symbol, name)
CURRENCIES: list[tuple[str, str, str]] = [
    ("USD", "$", "US Dollar"),
    ("INR", "₹", "Indian Rupee"),
    ("CAD", "C$", "Canadian Dollar"),
    ("GBP", "£", "British Pound"),
    ("EUR", "€", "Euro"),
    ("AUD", "A$", "Australian Dollar"),
    ("SGD", "S$", "Singapore Dollar"),
    ("AED", "د.إ", "UAE Dirham"),
]

CURRENCY_CODES: set[str] = {code for code, _symbol, _name in CURRENCIES}

DEFAULT_CURRENCY = "USD"
