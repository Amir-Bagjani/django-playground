FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PLAYGROUND_DATA_DIR=/data \
    PLAYGROUND_SEEDS_DIR=/app/seeds \
    PLAYGROUND_DJANGO_PORT=8001 \
    PLAYGROUND_CONTROL_PORT=8100

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY seeds/ ./seeds/
COPY tests/ ./tests/
COPY pytest.ini ./

# Generate the demo app migration once at build time so the seed ships with a
# valid, deterministic migration. No database is created here.
RUN python /app/seeds/scratch/manage.py makemigrations demo

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8100

ENTRYPOINT ["/app/entrypoint.sh"]
