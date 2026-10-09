FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

WORKDIR /app

# Install system dependencies if required
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code and data files
COPY tripweave/ ./tripweave/
COPY data/ ./data/

# Expose container port
EXPOSE 8000

# Run uvicorn on container port
CMD ["sh", "-c", "uvicorn tripweave.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
