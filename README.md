# Django Playground

A personal, local, single-user backend lab for running real Django/DRF code in
Docker and exercising it from the browser. This repository implements Phase 1
(PRD 01 — Foundation & Runner), Phase 2 (PRD 02 — Examples Management) and
Phase 3 (PRD 03 — API Tester & SQLite Explorer).

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
4. Open the **API** tab next to the editor, press **Send** and see the real status, duration and JSON response.
5. Introduce a syntax error and press Run to see the `error` state and the log; the panel does not crash.
6. Press **Stop** to stop the Django process.

## What you can do (Phase 3 — API Tester & Database Explorer)

- **API tester**: choose `GET`/`POST`/`PUT`/`PATCH`/`DELETE`, type a relative path such as
  `/api/items/?limit=10`, add headers and a JSON body, and see the status code, duration, response
  headers and body. External URLs are rejected — requests only ever go to the active example's Django.
- **Saved requests**: name the current request, reload it, rename it or delete it. They are stored per
  example (independent between examples) and survive restarts. Body JSON is validated before sending.
- **Database explorer** (read-only): browse the active example's SQLite tables, columns, types, primary
  and foreign keys, and a paginated page of rows. Press **Refresh** to see the effect of your API calls.
- **Apply DB Changes**: runs the real `python manage.py makemigrations demo` and
  `python manage.py migrate --noinput`, shows the actual command output, stops Django first and restarts
  it on success (a failed migration is reported, not hidden).
- If Django is stopped, the API tab shows the state and a **Run** shortcut instead of a vague network error.

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

Try the seeded examples end to end: open **Models & ORM** or **CRUD API**, press **Try & Run**, then use
the **API** tab to hit `/api/books/` or `/api/items/` (the CRUD template supports `POST`, `PATCH` and `DELETE` too).

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
  - `/data/examples/<uuid>/requests.json` holds that example's saved API requests.
  - `/data/examples/<uuid>/project/` holds its Django source and `db.sqlite3`.
- Built-in seed projects ship read-only in the image at `/app/seeds`; personal examples are copied from
  there on create (and copy the database when duplicating a personal example).
- The Database Explorer opens `db.sqlite3` read-only (`mode=ro`); table names are validated against the
  real schema and pagination values are bound parameters, so the viewer cannot run arbitrary SQL.
- API requests are forwarded only to `127.0.0.1:8001`; hop-by-hop and `Host` headers are stripped, the
  response body is capped at 1 MB and requests time out after 10 s.
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

- Phases 1–3 are complete; Import/Export is in PRD 04.
- Database Explorer is **read-only** — there is no SQL editor or row editing in the MVP, and only SQLite
  is supported.
- The migration action only targets the `demo` app.
- The Django runtime is for **personal, local** use and is not a secure sandbox for untrusted code.
- The runner has no access to the Docker socket and does not run privileged.

## PRD documents

The product documents live in `django-playground-prds/` (`00_PRODUCT_BRIEF.md`
and PRD-01..04). They are the original Persian specifications provided as input
to this repository.
