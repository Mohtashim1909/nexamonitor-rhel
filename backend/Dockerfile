FROM python:3.11-slim

WORKDIR /app

# Install curl for healthcheck and build-essential for compiling C extensions (e.g. psutil)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create persistent data directory for SQLite database
RUN mkdir -p /data

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application codebase
COPY . .

# Expose FastAPI service port
EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

# Run FastAPI backend in production
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
