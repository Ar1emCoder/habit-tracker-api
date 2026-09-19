# 1. Берем официальный легкий образ Python 3.12
FROM python:3.12

# 2. Создаем папку /app внутри контейнера и делаем её рабочей
WORKDIR /app
RUN apt-get update && apt-get install -y curl

# 3. Копируем файл зависимостей и устанавливаем их
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Копируем весь остальной код из текущей папки в контейнер
COPY . .

# 5. Открываем порт 8000 (на нем работает FastAPI)
EXPOSE 8000

# 6. Команда, которая запустится при старте контейнера
# ВАЖНО: --host 0.0.0.0 обязателен для Docker, иначе сайт не откроется снаружи!
CMD ["uvicorn", "movies_api:app", "--host", "0.0.0.0", "--port", "8000"]