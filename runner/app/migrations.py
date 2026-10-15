"""Run ``makemigrations demo`` then ``migrate --noinput`` for the active example.

In a single-user playground the safest sequence is: stop the running Django,
apply the migrations, then bring it back up if it was running. The real command
output is captured and returned so the UI can show it verbatim.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from . import runtime
from .config import MIGRATION_TIMEOUT_SECONDS

# The only app the MVP teaches. Creating new apps is out of scope.
DEMO_APP = "demo"


def _run_step(
    project_root: Path, args: list[str], python: str, env: dict[str, str]
) -> dict[str, Any]:
    command = ["manage.py", *args]
    display = "python " + " ".join(command)
    try:
        process = subprocess.run(
            [python, *command],
            cwd=str(project_root),
            env=env,
            capture_output=True,
            text=True,
            timeout=MIGRATION_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        partial = ""
        if exc.stdout:
            partial += exc.stdout if isinstance(exc.stdout, str) else exc.stdout.decode()
        if exc.stderr:
            partial += exc.stderr if isinstance(exc.stderr, str) else exc.stderr.decode()
        return {
            "command": display,
            "returnCode": -1,
            "output": f"{partial}\n[runner] Timed out after {MIGRATION_TIMEOUT_SECONDS}s."
            .strip(),
            "success": False,
        }
    except OSError as exc:
        return {
            "command": display,
            "returnCode": -1,
            "output": f"[runner] Could not run the command: {exc}",
            "success": False,
        }

    output = ((process.stdout or "") + (process.stderr or "")).strip()
    return {
        "command": display,
        "returnCode": process.returncode,
        "output": output,
        "success": process.returncode == 0,
    }


def run_migrations(project_root: Path, python_executable: str | None = None) -> dict[str, Any]:
    python = python_executable or sys.executable

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["PLAYGROUND_DB_PATH"] = str(project_root / "db.sqlite3")

    was_running = runtime.manager.is_running
    if was_running:
        runtime.manager.stop()

    steps: list[dict[str, Any]] = []
    success = True
    for args in (["makemigrations", DEMO_APP], ["migrate", "--noinput"]):
        step = _run_step(project_root, args, python, env)
        steps.append(step)
        if not step["success"]:
            success = False
            break

    restarted = False
    if success and was_running:
        runtime.manager.start(project_root)
        restarted = runtime.manager.is_running

    return {"success": success, "steps": steps, "restarted": restarted}
