#!/usr/bin/env bash
#
# Django Playground — one-command start / stop.
#
#   ./start.sh
#
# Brings up the existing docker-compose stack, streams service logs, and on
# Ctrl+C (or SIGTERM/SIGHUP) gracefully stops the containers it started.
# Persistent data (the `playground_data` volume, examples and databases) is
# always preserved.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

URL="http://localhost:3000"
STARTED_BY_US=0
CLEANED_UP=0

log() {
  printf '%s\n' "$*"
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  local code=$?
  if [[ "$CLEANED_UP" -eq 1 ]]; then
    return
  fi
  CLEANED_UP=1

  if [[ "$STARTED_BY_US" -eq 1 ]]; then
    log ""
    log "Shutting down Django Playground (data volumes are preserved)…"
    docker compose down --remove-orphans || true
  else
    log ""
    log "Django Playground was already running before this script started it."
    log "Leaving it untouched; run 'docker compose down' to stop it."
  fi
  exit "$code"
}
trap cleanup INT TERM HUP EXIT

command -v docker >/dev/null 2>&1 || die "Docker is not installed or not on PATH."
docker compose version >/dev/null 2>&1 || die "Docker Compose (v2) is not available."
docker info >/dev/null 2>&1 || die "the Docker daemon is not running. Start Docker and try again."

# If the stack is already up, don't take ownership of it.
if [[ -n "$(docker compose ps --status running --quiet 2>/dev/null)" ]]; then
  log "Django Playground is already running (started outside this script)."
  log "Available at $URL — streaming logs below."
  log "Press Ctrl+C to detach (the services keep running)."
  exec docker compose logs -f
fi

log "Building and starting Django Playground…"
STARTED_BY_US=1
docker compose up --build -d || die "docker compose up failed."

if command -v curl >/dev/null 2>&1; then
  for _ in $(seq 1 90); do
    if curl -fsS -o /dev/null "$URL"; then
      break
    fi
    sleep 1
  done
fi

log ""
log "Django Playground is ready: $URL"
log "Press Ctrl+C to stop and clean up."
log ""

docker compose logs -f
