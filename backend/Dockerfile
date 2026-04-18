FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN python -m pip install --upgrade pip \
    && python -m pip install -r /app/backend/requirements.txt

COPY backend /app/backend

EXPOSE 8000

ENV APP_HOST=0.0.0.0 \
    APP_PORT=8000 \
    APP_ADMIN_AUTH_MODE=local_only \
    APP_ADMIN_ALLOWED_EMAILS= \
    WHISPER_MODEL_SIZE=small \
    WHISPER_DEVICE=cpu \
    WHISPER_COMPUTE_TYPE=int8

CMD ["python", "backend/server.py"]
