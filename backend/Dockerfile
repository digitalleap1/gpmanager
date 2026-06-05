FROM python:3.12-slim

# Prevent Python from writing pyc files / buffering stdout
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10

WORKDIR /app

# psycopg[binary] bundles libpq, so no system packages are needed — keeps the
# image small and the build fast.

# Install Python deps first for better layer caching.
# PIP_DEFAULT_TIMEOUT + PIP_RETRIES (set above) make this resilient to slow/flaky
# PyPI connections. We intentionally do NOT upgrade pip (saves a slow download).
COPY requirements.txt requirements-dev.txt ./
RUN pip install -r requirements.txt

# Copy application code
COPY . .

EXPOSE 8000

# Default command. Binds to $PORT when the platform sets it (Render), else 8000.
# (docker-compose overrides this with --reload for local dev.)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
