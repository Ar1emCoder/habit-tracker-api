from datetime import date, timedelta
from unittest.mock import AsyncMock
import pytest
from asyncpg.exceptions import UniqueViolationError
from app.tracker_db import calculate_streak, mark_habit_complete


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


@pytest.mark.asyncio
class TestMarkHabitComplete:

    async def test_mark_habit_complete_success(self):
        mock_db = AsyncMock()
        mock_db.fetchrow.return_value = {"habit_id": 1, "created_at": "2026-09-27T12:00:00"}

        result = await mark_habit_complete(mock_db, habit_id=1)

        assert result is not None
        assert result["habit_id"] == 1
        assert "created_at" in result

    async def test_mark_habit_complete_duplicate_returns_none(self):
        mock_db = AsyncMock()
        mock_db.fetchrow.side_effect = UniqueViolationError("duplicate key value violates unique constraint")

        result = await mark_habit_complete(mock_db, habit_id=1)

        assert result is None