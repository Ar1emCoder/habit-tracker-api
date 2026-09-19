from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
import bcrypt
import os
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


def get_password_hash(password: str) -> str:
    # превращает обычный пароль в безопасный хеш
    salt = bcrypt.gensalt() # случайная строка символов, чтоб: если 2 пользователя выберут пароль -12345- их хеши будут разными = защищает от атак по радужным таблицам
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    # проверяем, совпадает ли введенный пароль с хешем в БД
    return bcrypt.checkpw(
        plain_password.encode('utf-8'),
        hashed_password.encode('utf-8')
    )


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    # создаем JWT токен
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encode_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encode_jwt


def decode_access_token(token: str) -> dict:
    # Расшифровывает JWT токен и возвращает данные (например, username)
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Неверный или просроченный токен",
            headers={"WWW-Authenticate": "Bearer"}
        )