"""Maintained calendar inputs for Prophet's learned holiday effects.

These dates do not establish store closures or the direction of demand changes.
The explicit list is not an automatically updated official holiday calendar;
review proclamations before extending or relying on coverage for a new year.
"""

import pandas as pd

# (month, day, name) — fixed-date holidays observed every year.
FIXED = [
    (1, 1, "New Year"),
    (4, 9, "Araw ng Kagitingan"),
    (5, 1, "Labor Day"),
    (6, 12, "Independence Day"),
    (8, 21, "Ninoy Aquino Day"),
    (11, 1, "All Saints Day"),
    (11, 30, "Bonifacio Day"),
    (12, 25, "Christmas Day"),
    (12, 30, "Rizal Day"),
]

# Movable feasts / proclamations by year: (date, name).
MOVABLE = [
    ("2024-03-28", "Maundy Thursday"), ("2024-03-29", "Good Friday"),
    ("2024-12-24", "Christmas Eve"), ("2024-12-31", "Last Day"),
    ("2025-04-17", "Maundy Thursday"), ("2025-04-18", "Good Friday"),
    ("2025-12-24", "Christmas Eve"), ("2025-12-31", "Last Day"),
    ("2026-04-02", "Maundy Thursday"), ("2026-04-03", "Good Friday"),
    ("2026-12-24", "Christmas Eve"), ("2026-12-31", "Last Day"),
    ("2027-03-25", "Maundy Thursday"), ("2027-03-26", "Good Friday"),
    ("2027-12-24", "Christmas Eve"), ("2027-12-31", "Last Day"),
]


def philippine_holidays(years_ahead: int = 1) -> pd.DataFrame | None:
    """Expand fixed dates from 2024 through host year plus the requested tail.

    All explicitly listed movable dates are included, even beyond that tail.
    Duplicate dates keep their first label; the returned frame is date-sorted.
    This calendar's host-year boundary is separate from sales' Manila dates.
    """
    import datetime

    this_year = datetime.date.today().year
    years = range(2024, this_year + years_ahead + 1)
    rows = [
        {"ds": pd.Timestamp(y, m, d), "holiday": name}
        for y in years
        for m, d, name in FIXED
    ]
    rows += [{"ds": pd.Timestamp(d), "holiday": n} for d, n in MOVABLE]
    df = pd.DataFrame(rows).drop_duplicates("ds").sort_values("ds")
    return df if not df.empty else None
