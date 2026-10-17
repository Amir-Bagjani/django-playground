"""Result-cell normalization shared by the SQL and ORM evaluators.

MySQL ``DECIMAL`` values arrive as :class:`decimal.Decimal`, Django ORM values
as ``Decimal``/``float``/``int``. To compare results deterministically we map
every numeric cell to a canonical 2-decimal string. Strings and ``NULL`` stay
as they are, so a projection like ``name, price`` compares exactly.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any


def normalize_cell(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (Decimal, int, float)):
        try:
            return f"{float(value):.2f}"
        except (TypeError, ValueError, OverflowError):
            return str(value)
    if isinstance(value, (bytes, bytearray)):
        return value.decode("utf-8", "replace")
    return value


def normalize_rows(rows: list[list[Any]]) -> list[list[Any]]:
    return [[normalize_cell(cell) for cell in row] for row in rows]
