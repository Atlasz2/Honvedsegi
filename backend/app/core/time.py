"""Dátum- és időkezelés. Nincs függősége a projekt többi részétől."""
from __future__ import annotations

from datetime import date, datetime, timezone

def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def parse_iso_date(value: str) -> date | None:
    if not value:
        return None
    raw = value.strip()
    candidates = [raw, raw[:10]] if len(raw) >= 10 else [raw]
    if "T" in raw:
        candidates.append(raw.split("T", 1)[0])
    for candidate in candidates:
        try:
            return datetime.fromisoformat(candidate).date()
        except ValueError:
            try:
                return date.fromisoformat(candidate)
            except ValueError:
                continue
    return None


def date_overlap(start_value: str, end_value: str, range_start: date, range_end: date) -> bool:
    start = parse_iso_date(start_value)
    end = parse_iso_date(end_value)
    if not start or not end:
        return False
    return start <= range_end and end >= range_start
