from datetime import date, timedelta
import pytest

from app.tracker_db import calculate_streak


@pytest.fixture
def sample_dates():
    today = date.today()
    return {
        "alive_3": [today, today - timedelta(days=1), today - timedelta(days=2)],
        "alive_1_today": [today],
        "alive_2_yesterday": [today - timedelta(days=1), today - timedelta(days=2)],
        "broken": [today, today - timedelta(days=2)],
        "empty": [],
        "old_date": [today - timedelta(days=5), today - timedelta(days=6)],
    }


@pytest.mark.parametrize(
    "case, expected",
    [
        ("alive_3", 3),
        ("alive_1_today", 1),
        ("alive_2_yesterday", 2),
        ("broken", 1),
        ("empty", 0),
        ("old_date", 0),
    ],
)
def test_calculate_streak(sample_dates, case, expected):
    dates = sample_dates[case]
    result = calculate_streak(dates)
    assert result == expected, f"Кейс '{case}': ожидали {expected}, получили {result}"
