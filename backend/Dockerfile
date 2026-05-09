FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencias de sistema:
#   - build-essential, libpq-dev → compilar/conectar Postgres (asyncpg, psycopg)
#   - ffmpeg                     → fallback de Whisper para audio/vídeo
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        ffmpeg \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# En prod sí copiamos el código: la imagen es autocontenida, sin volúmenes de
# desarrollo.
COPY . .

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
