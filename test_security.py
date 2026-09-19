import app.security as security

# Тест хеширования
password = "test123"
hashed = security.get_password_hash(password)
print(f"Хеш: {hashed}")

# Тест проверки
print(f"Пароль верный? {security.verify_password(password, hashed)}")
print(f"Пароль неверный? {security.verify_password('wrong', hashed)}")

# Тест токена
token = security.create_access_token(data={"sub": "artem"})
print(f"Токен: {token}")