#!/bin/sh
set -e

mkdir -p "${PLAYGROUND_DATA_DIR:-/data}"

exec python -m uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PLAYGROUND_CONTROL_PORT:-8100}"
