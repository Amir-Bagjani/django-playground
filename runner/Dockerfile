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

# Fail the build if any seed's migrations drift from its models. No database is
# created here; example databases are built at runtime by running migrations.
RUN for seed in scratch hello orm crud; do \
      echo "checking migrations for $seed"; \
      python /app/seeds/$seed/manage.py makemigrations demo --check --dry-run; \
    done && find /app/seeds -name '*.sqlite3' -delete

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8100

ENTRYPOINT ["/app/entrypoint.sh"]
