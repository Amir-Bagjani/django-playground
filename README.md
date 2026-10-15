# Django Playground

A personal, local, single-user backend lab for running real Django/DRF code in
Docker and exercising it from the browser. This repository implements Phase 1
(PRD 01 — Foundation & Runner).

## Requirements

- Docker and Docker Compose (Compose v2)

## Run

```bash
docker compose up --build -d
```

Then open:

```text
http://localhost:3000
```

## What you can do (Phase 1)

1. The default **Scratch** workspace is created automatically.
2. Open a Python file such as `demo/views.py`, edit it and press **Save**.
3. Press **Run / Restart**; the real Django project runs with Python inside the `runner` container.
4. Press **Test Hello API** to really send `GET /api/hello/` and see the status and JSON response.
5. Introduce a syntax error and press Run to see the `error` state and the log; the panel does not crash.
6. Press **Stop** to stop the Django process.

## Architecture

```text
docker compose
├── web    : Next.js + TypeScript UI and BFF on http://localhost:3000
└── runner : FastAPI Control API (internal, not published)
             └─ Django/DRF as a child process on 127.0.0.1:8001 inside the same container
```

- User data lives in the Docker volume `playground_data` mounted at `/data`.
- The seed project ships read-only in the image at `/app/seeds` and is copied to
  `/data/examples/<id>/project` on first run.
- The BFF forwards UI requests to `http://runner:8100` over the internal Docker
  network; that port is **not** published on the host.

## Stopping and clearing data

Stop the services:

```bash
docker compose down
```

Stop **and delete all user data** (removes the volume; only when you really want
everything gone):

```bash
docker compose down -v
```

> Data survives restarts. Use `-v` for a deliberate reset, not as a workaround for bugs.

## Tests

The runner tests run inside the container against real Django:

```bash
docker compose exec runner python -m pytest -v
```

Type-check the web app:

```bash
docker compose run --rm web npm run typecheck
```

## Limitations (Phase 1)

- Only one active workspace; example CRUD is in PRD 02.
- The full API Tester and SQLite Explorer are in PRD 03.
- Import/Export is in PRD 04.
- The Django runtime is for **personal, local** use and is not a secure sandbox for untrusted code.
- The runner has no access to the Docker socket and does not run privileged.

## PRD documents

The product documents live in `django-playground-prds/` (`00_PRODUCT_BRIEF.md`
and PRD-01..04). They are the original Persian specifications provided as input
to this repository.
