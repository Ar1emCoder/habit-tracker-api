from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from . import security
from fastapi.security import OAuth2PasswordBearer
from .tracker_db import (
    add_habit,
    get_all_habits,
    update_habit,
    delete_habit,
    get_db,
    mark_habit_complete,
    get_habit_streak,
    get_habit_stats,
    create_user,
    get_user_by_username
)

# Схема получения токена
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

router = APIRouter()


class HabitCreate(BaseModel):
    name: str


class UserCreate(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str

@router.post("/habits")
async def create_habit(habit: HabitCreate, db=Depends(get_db)):
    result = await add_habit(db, habit.name)
    return result


async def get_current_user(token: str = Depends(oauth2_scheme), db = Depends(get_db)):
    payload = security.decode_access_token(token)
    username: str = payload.get("sub")

    if username is None:
        raise HTTPException(status_code=401, detail="Неверные данные токена")

    user = await get_user_by_username(db, username)
    if user is None:
        raise HTTPException(status_code=401, detail="Пользователь не найден")
    return user


@router.get("/habits")
async def read_habits(skip: int = 0, limit: int = 100, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    result = await get_all_habits(db, skip, limit)
    return result


@router.put("/habits/{habit_id}")
async def update_habit_endpoint(habit_id: int, new_name: str, db=Depends(get_db)):
    updated_habit = await update_habit(db, habit_id, new_name)
    if updated_habit is None:
        raise HTTPException(status_code=404, detail="Привычка не найдена!")
    return updated_habit


@router.delete("/habits/{habit_id}")
async def delete_habit_endpoint(habit_id: int, db=Depends(get_db)):
    result = await delete_habit(db, habit_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Привычка не найдена!")
    return {"message": result}


@router.post("/habits/{habit_id}/complete")
async def completed_habit(habit_id: int, db=Depends(get_db)):
    result = await mark_habit_complete(db, habit_id)
    if result is None:
        raise HTTPException(status_code=409, detail="Уже отмечено на сегодня!")
    else:
        return {"message": "Выполнено!", "data": result}


@router.get("/habits/{habit_id}/streak")
async def get_streak(habit_id: int, db=Depends(get_db)):
    streak = await get_habit_streak(db, habit_id)
    return {"habit_id": habit_id, "curr_streak": streak}


@router.get("/habits/stats")
async def get_stats(db=Depends(get_db)):
    return await get_habit_stats(db)


@router.post("/register")
async def register(user: UserCreate, db=Depends(get_db)):
    result = await get_user_by_username(db, user.username)
    if result is not None:
        raise HTTPException(status_code=400, detail="Имя занято")
    hashed_pwd = security.get_password_hash(user.password)
    new_user = await create_user(db, user.username, hashed_pwd)
    return {"message": "Пользователь создан", "user": new_user}


@router.post("/token", response_model=TokenResponse)
async def login(user: UserCreate, db=Depends(get_db)):
    db_user = await get_user_by_username(db, user.username)
    if not db_user or not security.verify_password(user.password, db_user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Неверное имя пользователя или пароль")
    access_token = security.create_access_token(data={"sub": db_user["username"]})
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


