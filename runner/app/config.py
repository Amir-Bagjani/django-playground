"""Central configuration for the playground runner."""
from __future__ import annotations

import os
from pathlib import Path

DATA_DIR = Path(os.environ.get("PLAYGROUND_DATA_DIR", "/data"))
SEEDS_DIR = Path(os.environ.get("PLAYGROUND_SEEDS_DIR", "/app/seeds"))
EXAMPLES_DIR = DATA_DIR / "examples"
STATE_FILE = DATA_DIR / "state.json"
SCRATCH_SEED = SEEDS_DIR / "scratch"

DJANGO_HOST = "127.0.0.1"
DJANGO_PORT = int(os.environ.get("PLAYGROUND_DJANGO_PORT", "8001"))
CONTROL_PORT = int(os.environ.get("PLAYGROUND_CONTROL_PORT", "8100"))

# File types that may be opened and edited from the web editor.
ALLOWED_EXTENSIONS = {
    ".py",
    ".json",
    ".md",
    ".txt",
    ".cfg",
    ".ini",
    ".toml",
    ".yaml",
    ".yml",
    ".rst",
}

# Directories never exposed to the file browser.
SKIP_DIRS = {"__pycache__", ".git", ".venv", "venv", "node_modules", ".pytest_cache"}
# Files never exposed to the file browser (binary / unsafe).
SKIP_FILES = {"db.sqlite3", ".DS_Store"}

MAX_FILE_BYTES = 512 * 1024
MAX_LOG_LINES = 1000
REQUEST_TIMEOUT_SECONDS = 10
STARTUP_TIMEOUT_SECONDS = 12
