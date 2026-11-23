FROM python:3.11-slim

WORKDIR /app

# Install dependencies (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY backend/ backend/
COPY frontend/ frontend/

# Default port; Railway overrides $PORT at runtime
ENV PORT=8000

EXPOSE 8000

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
