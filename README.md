# Django Playground

A personal, local, single-user backend lab for running real Django/DRF code in
Docker and exercising it from the browser. This repository implements Phase 1
(PRD 01 — Foundation & Runner) and Phase 2 (PRD 02 — Examples Management).

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
4. Press **Test API** to really send a request (e.g. `GET /api/hello/`) and see the status and JSON response.
5. Introduce a syntax error and press Run to see the `error` state and the log; the panel does not crash.
6. Press **Stop** to stop the Django process.

## What you can do (Phase 2 — Examples)

- **Built-in examples** (read-only, always available): **Hello World API**, **Models & ORM** and **CRUD API**.
  Open one to read its code; use **Create a copy** or **Try & Run** to get an editable personal copy.
- **My Examples**: create one with **+ New** (blank, or seeded from any built-in template), then
  activate, rename, duplicate or delete them from the sidebar.
- Each example has its **own source files and its own SQLite database**; duplicating copies both, so the
  copy keeps its data while staying independent from the original.
- Exactly **one example is active** at a time. Switching examples stops the running Django process.
- Built-in examples can never be renamed, edited, deleted or activated directly.
- Examples and their databases survive `docker compose restart`.

Try the seeded examples end to end: open **Models & ORM** or **CRUD API**, press **Try & Run**, then
**Test API** to hit `/api/books/` or `/api/items/` (the CRUD template supports `POST`, `PATCH` and `DELETE` too).

## Architecture

```text
docker compose
├── web    : Next.js + TypeScript UI and BFF on http://localhost:3000
└── runner : FastAPI Control API (internal, not published)
             └─ Django/DRF as a child process on 127.0.0.1:8001 inside the same container
```

- User data lives in the Docker volume `playground_data` mounted at `/data`.
  - `/data/state.json` records the single active example id.
  - `/data/examples/<uuid>/metadata.json` holds each personal example's name and description.
  - `/data/examples/<uuid>/project/` holds its Django source and `db.sqlite3`.
- Built-in seed projects ship read-only in the image at `/app/seeds`; personal examples are copied from
  there on create (and copy the database when duplicating a personal example).
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

## Limitations (current)

- Example management (Phase 2) is complete; the full API Tester and SQLite Explorer are in PRD 03.
- Import/Export is in PRD 04.
- The Django runtime is for **personal, local** use and is not a secure sandbox for untrusted code.
- The runner has no access to the Docker socket and does not run privileged.

## PRD documents

The product documents live in `django-playground-prds/` (`00_PRODUCT_BRIEF.md`
and PRD-01..04). They are the original Persian specifications provided as input
to this repository.
