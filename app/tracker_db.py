from dotenv import load_dotenv
import asyncpg  # type: ignore
import os
from datetime import timedelta, date

load_dotenv()

_db_pool = None


async def init_pool():
    global _db_pool
    db_url = os.getenv("DATABASE_URL")
    _db_pool = await asyncpg.create_pool(db_url)


async def close_pool():
    global _db_pool
    if _db_pool:
        await _db_pool.close()


async def get_db():
    async with _db_pool.acquire() as conn:
        yield conn


async def add_habit(db, name):
    row = await db.fetchrow(
        "INSERT INTO habits (name) VALUES ($1) RETURNING id, created_at", name
    )
    return {"id": row["id"], "name": name, "created_at": row["created_at"]}


async def get_all_habits(db, skip: int = 0, limit: int = 100):
    rows = await db.fetch("SELECT id, name FROM habits LIMIT $1 OFFSET $2", limit, skip)
    return [dict(row) for row in rows]


async def update_habit(db, habit_id: int, new_name: str):
    row = await db.fetchrow(
        "UPDATE habits SET name = $1 WHERE id = $2 RETURNING id AS habit_id, name AS new_name",
        new_name,
        habit_id,
    )
    if row is None:
        return None
    else:
        return {"habit_id": row["habit_id"], "new_name": row["new_name"]}


async def delete_habit(db, habit_id: int):
    row = await db.fetchrow("DELETE FROM habits WHERE id = $1 RETURNING id", habit_id)
    if row is None:
        return None
    else:
        return f"Привычка с ID: {row['id']} удалена!"


async def mark_habit_complete(db, habit_id: int):
    try:
        row = await db.fetchrow(
            "INSERT INTO habit_completions (habit_id, created_at) VALUES ($1, NOW()) RETURNING habit_id, created_at",
            habit_id,
        )
        return {"habit_id": row["habit_id"], "created_at": row["created_at"]}
    except asyncpg.exceptions.UniqueViolationError:
        return None


def calculate_streak(dates: list[date]) -> int:
    if not dates:
        return 0

    today = date.today()
    yesterday = today - timedelta(days=1)
    if dates[0] != today and dates[0] != yesterday:
        return 0
    streak = 0
    expected_date = dates[0]  # ожидаемая дата

    for curr_date in dates:
        if curr_date == expected_date:
            streak += 1
            expected_date = curr_date - timedelta(days=1)
        else:
            break
    return streak


async def get_habit_streak(db, habit_id: int):
    rows = await db.fetch(
        """
        SELECT DISTINCT created_at::date AS created_at
        FROM habit_completions
        WHERE habit_id = $1
        ORDER BY created_at DESC
        """,
        habit_id,
    )
    dates = [row["created_at"] for row in rows]
    return calculate_streak(dates)


async def get_habit_stats(db):
    total_habits = await db.fetchval("SELECT COUNT(*) FROM habits")
    completed_today = await db.fetchval(
        "SELECT COUNT(*) FROM habit_completions WHERE created_at::date = CURRENT_DATE"
    )
    return {"total_habits": total_habits, "completed_today": completed_today}


async def create_user(db, username: str, hashed_password: str):
    # Создаем нового пользователя в БД
    try:
        row = await db.fetchrow(
            "INSERT INTO users (username, hashed_password) VALUES ($1, $2) RETURNING id, username",
            username, hashed_password
        )
        return {"id": row["id"], "username": row["username"]}
    except asyncpg.exceptions.UniqueViolationError:
        return None # если такой уже есть пользователь


async def get_user_by_username(db, username: str):
    # Поиск пользователя по имени для проверки пароля
    row = await db.fetchrow(
        "SELECT id, username, hashed_password FROM users WHERE username = $1",
        username
    )
    if row:
        return dict(row)
    return None