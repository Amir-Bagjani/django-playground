"""Manage the Django child process and proxy HTTP requests to it.

The runner never executes the playground source in its own process. Instead it
launches ``python manage.py runserver`` as a child process inside this container
bound to ``127.0.0.1`` and forwards requests to it.
"""
from __future__ import annotations

import collections
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import httpx

from .config import (
    DJANGO_HOST,
    DJANGO_PORT,
    MAX_LOG_LINES,
    MAX_RESPONSE_BYTES,
    REQUEST_TIMEOUT_SECONDS,
    STARTUP_TIMEOUT_SECONDS,
)

STATE_STOPPED = "stopped"
STATE_STARTING = "starting"
STATE_RUNNING = "running"
STATE_ERROR = "error"

# Liveness probe path. Any HTTP response (including 404) means Django is up, so
# this path does not need to exist in every example.
HEALTH_PATH = "/"

# Hop-by-hop headers must not be forwarded, and the client must not be able to
# spoof the Host or break framing on our internal localhost request.
HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "trailers",
    "transfer-encoding",
    "upgrade",
}
FORBIDDEN_REQUEST_HEADERS = HOP_BY_HOP_HEADERS | {"host", "content-length"}


def _filter_request_headers(headers: dict[str, str] | None) -> dict[str, str]:
    if not headers:
        return {}
    return {
        key: value
        for key, value in headers.items()
        if isinstance(key, str) and key.lower() not in FORBIDDEN_REQUEST_HEADERS
    }


class RuntimeError_(Exception):
    """Controlled runtime failure."""


class RuntimeManager:
    def __init__(self, python_executable: str | None = None) -> None:
        self._python = python_executable or sys.executable
        self._lock = threading.Lock()
        self._process: subprocess.Popen[str] | None = None
        self._reader: threading.Thread | None = None
        self._logs: collections.deque[str] = collections.deque(maxlen=MAX_LOG_LINES)
        self._state = STATE_STOPPED
        self._exit_code: int | None = None
        self._error: str | None = None
        self._project_root: Path | None = None

    # -- log helpers -------------------------------------------------------
    def _append_log(self, line: str) -> None:
        self._logs.append(line)

    def logs(self, limit: int = 200) -> list[str]:
        limit = max(1, min(limit, MAX_LOG_LINES))
        return list(self._logs)[-limit:]

    # -- status ------------------------------------------------------------
    def status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "state": self._state,
                "exitCode": self._exit_code,
                "error": self._error,
                "pid": self._process.pid if self._process is not None and self._process.poll() is None else None,
            }

    @property
    def is_running(self) -> bool:
        with self._lock:
            return self._state == STATE_RUNNING and self._process is not None and self._process.poll() is None

    # -- process output pump ----------------------------------------------
    def _pump_output(self, process: subprocess.Popen[str]) -> None:
        assert process.stdout is not None
        try:
            for raw in process.stdout:
                self._append_log(raw.rstrip("\n"))
        except ValueError:
            pass
        code = process.wait()
        with self._lock:
            if self._process is not process:
                return
            self._exit_code = code
            self._append_log(f"[runner] Django process exited with code {code}.")
            if self._state in (STATE_STARTING, STATE_RUNNING):
                self._state = STATE_ERROR
                if not self._error:
                    self._error = self._summarize_error(code)

    def _summarize_error(self, code: int) -> str:
        for line in reversed(self._logs):
            stripped = line.strip()
            if stripped.endswith("Error") or "Error:" in stripped:
                return stripped
        return f"Django process exited with code {code}"

    def _wait_for_health(self, process: subprocess.Popen[str], timeout: float) -> bool:
        deadline = time.time() + timeout
        url = f"http://{DJANGO_HOST}:{DJANGO_PORT}{HEALTH_PATH}"
        while time.time() < deadline:
            if process.poll() is not None:
                return False
            try:
                with urllib.request.urlopen(url, timeout=1) as response:
                    return response.status < 600
            except urllib.error.HTTPError:
                # The server answered (e.g. 404): it is up and serving.
                return True
            except (urllib.error.URLError, OSError, ValueError):
                pass
            time.sleep(0.25)
        return False

    # -- start / stop ------------------------------------------------------
    def start(self, project_root: Path) -> dict[str, Any]:
        with self._lock:
            self._stop_locked()
            self._logs.clear()
            self._project_root = project_root
            self._state = STATE_STARTING
            self._error = None
            self._exit_code = None
            self._append_log(f"[runner] starting Django in {project_root}")

            env = os.environ.copy()
            env["PYTHONUNBUFFERED"] = "1"
            env["PLAYGROUND_DB_PATH"] = str(project_root / "db.sqlite3")
            command = [
                self._python,
                "manage.py",
                "runserver",
                f"{DJANGO_HOST}:{DJANGO_PORT}",
                "--noreload",
            ]
            try:
                process = subprocess.Popen(
                    command,
                    cwd=str(project_root),
                    env=env,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                )
            except OSError as exc:
                self._state = STATE_ERROR
                self._error = f"Failed to launch Django: {exc}"
                return self.status()

            self._process = process
            self._reader = threading.Thread(target=self._pump_output, args=(process,), daemon=True)
            self._reader.start()

        healthy = self._wait_for_health(process, STARTUP_TIMEOUT_SECONDS)

        with self._lock:
            if self._process is not process:
                return self.status()
            if process.poll() is not None:
                self._state = STATE_ERROR
                self._exit_code = process.returncode
                if not self._error:
                    self._error = self._summarize_error(process.returncode or 1)
            elif healthy:
                self._state = STATE_RUNNING
                self._error = None
            else:
                self._state = STATE_ERROR
                self._error = "Django did not become ready in time."
                self._stop_locked()
            return {
                "state": self._state,
                "exitCode": self._exit_code,
                "error": self._error,
                "pid": process.pid if process.poll() is None else None,
            }

    def stop(self) -> dict[str, Any]:
        with self._lock:
            self._stop_locked()
            return {
                "state": self._state,
                "exitCode": self._exit_code,
                "error": self._error,
                "pid": None,
            }

    def _stop_locked(self) -> None:
        process = self._process
        self._process = None
        if process is not None:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    try:
                        process.wait(timeout=3)
                    except subprocess.TimeoutExpired:  # pragma: no cover - defensive
                        pass
            self._exit_code = process.returncode
        self._state = STATE_STOPPED
        self._error = None

    # -- request forwarding ------------------------------------------------
    def forward_request(
        self,
        method: str,
        path: str,
        headers: dict[str, str] | None = None,
        body: str | None = None,
    ) -> dict[str, Any]:
        method = (method or "GET").upper()
        if method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"}:
            raise RuntimeError_("Unsupported HTTP method.")
        if not path or not path.startswith("/") or "://" in path or path.startswith("//"):
            raise RuntimeError_("Path must be relative and start with '/'.")

        with self._lock:
            running = self._state == STATE_RUNNING and self._process is not None and self._process.poll() is None
        if not running:
            raise RuntimeError_("Django server is not running; press Run first.")

        url = f"http://{DJANGO_HOST}:{DJANGO_PORT}{path}"
        started = time.time()
        safe_headers = _filter_request_headers(headers)
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS, follow_redirects=False) as client:
                with client.stream(
                    method, url, headers=safe_headers or None, content=body
                ) as response:
                    chunks: list[bytes] = []
                    received = 0
                    truncated = False
                    for chunk in response.iter_bytes():
                        received += len(chunk)
                        if received > MAX_RESPONSE_BYTES:
                            keep = len(chunk) - (received - MAX_RESPONSE_BYTES)
                            chunks.append(chunk[:keep])
                            truncated = True
                            break
                        chunks.append(chunk)
                    raw = b"".join(chunks)
                    status_code = response.status_code
                    response_headers = {k: v for k, v in response.headers.items()}
                    content_type = response.headers.get("content-type", "")
                    encoding = response.encoding or "utf-8"
        except httpx.TimeoutException as exc:
            raise RuntimeError_(
                f"The request timed out after {REQUEST_TIMEOUT_SECONDS}s. Press Send to retry."
            ) from exc
        except httpx.HTTPError as exc:
            raise RuntimeError_(f"Could not reach the Django server: {exc}") from exc

        duration_ms = int((time.time() - started) * 1000)
        try:
            text = raw.decode(encoding, errors="replace")
        except LookupError:  # pragma: no cover - unknown encoding label
            text = raw.decode("utf-8", errors="replace")
        return {
            "status": status_code,
            "durationMs": duration_ms,
            "headers": response_headers,
            "contentType": content_type,
            "body": text,
            "truncated": truncated,
        }


def ensure_database(project_root: Path, python_executable: str | None = None) -> None:
    """Create the example SQLite database once, by running Django migrations.

    For seeds that ship data migrations (e.g. the ORM and CRUD examples) this
    also inserts the sample rows. If the database already exists it is left
    untouched, so a personal example's data is never overwritten.
    """
    db_path = project_root / "db.sqlite3"
    if db_path.exists() and db_path.stat().st_size > 0:
        return
    if db_path.exists():
        # An empty file (e.g. a stray one copied from a template) has no
        # tables, so migrate would be skipped and every query would fail.
        db_path.unlink()
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["PLAYGROUND_DB_PATH"] = str(db_path)
    try:
        subprocess.run(
            [python_executable or sys.executable, "manage.py", "migrate", "--noinput"],
            cwd=str(project_root),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=60,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        pass


# Single shared runtime manager for the whole runner process.
manager = RuntimeManager()

