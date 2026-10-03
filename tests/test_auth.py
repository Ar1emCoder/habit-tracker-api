import pytest
import time
from fastapi.testclient import TestClient
from main import app
from app import security  # Импортируем, чтобы проверить валидность нового токена


@pytest.fixture
def client():
    # Контекстный менеджер гарантирует запуск startup (инициализацию БД)
    with TestClient(app) as test_client:
        yield test_client


def test_register_and_login(client):
    """Тест: регистрация → логин → проверка защиты эндпоинта 403"""
    # 1. Генерируем УНИКАЛЬНОЕ имя, чтобы тест не падал из-за "Имя занято"
    unique_username = f"test_user_{int(time.time())}"

    response = client.post("/register", json={
        "username": unique_username,
        "password": "test_password"
    })
    assert response.status_code == 200

    # 2. Логинимся и получаем токены
    response = client.post("/token", json={
        "username": unique_username,
        "password": "test_password"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data

    access_token = data["access_token"]

    # 3. Проверяем защиту эндпоинта /admin/users
    headers = {"Authorization": f"Bearer {access_token}"}
    response_admin = client.get("/admin/users", headers=headers)

    # Обычный пользователь (роль 'user') должен получить 403 Forbidden
    assert response_admin.status_code == 403


def test_refresh_token_flow(client):
    """Тест: использование refresh-токена для получения нового access-токена"""
    # 1. Уникальное имя для этого теста
    unique_username = f"test_user_refresh_{int(time.time())}"

    # Сначала регистрируем (тест должен быть независимым!)
    client.post("/register", json={
        "username": unique_username,
        "password": "test_password"
    })

    # 2. Логинимся
    response_login = client.post("/token", json={
        "username": unique_username,
        "password": "test_password"
    })
    assert response_login.status_code == 200

    data = response_login.json()
    refresh_token = data["refresh_token"]

    # 3. Используем refresh_token для получения нового access_token
    response_refresh = client.post("/refresh", json={
        "refresh_token": refresh_token
    })

    # 4. Проверяем успех
    assert response_refresh.status_code == 200

    new_data = response_refresh.json()
    assert "access_token" in new_data

    new_access_token = new_data["access_token"]

    # 5. ПРАВИЛЬНАЯ ПРОВЕРКА: вместо сравнения строк, мы декодируем новый токен,
    payload = security.decode_access_token(new_access_token)
    assert payload.get("sub") == unique_username
    assert payload.get("role") == "user"