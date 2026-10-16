# Django Playground

A personal, local, single-user backend lab for running real Django/DRF code in
Docker and exercising it from the browser. This repository implements Phase 1
(PRD 01 — Foundation & Runner), Phase 2 (PRD 02 — Examples Management),
Phase 3 (PRD 03 — API Tester & SQLite Explorer) and Phase 4 (PRD 04 — Import &
Export).

## Requirements

- Docker and Docker Compose (Compose v2)

## Run

The quickest way is the bundled helper, which builds (if needed), streams the
service logs, prints the URL once the app is ready, and stops everything cleanly
on `Ctrl+C`:

```bash
./start.sh
```

Or use Docker Compose directly:

```bash
docker compose up --build -d
```

Then open:

```text
http://localhost:3000
```

`./start.sh` never runs `docker compose down -v`, so the `playground_data`
volume (examples, source files and SQLite databases) is always preserved. If the
stack is already running, the script attaches to the logs without taking it over.

## What you can do (Phase 1)

1. The default **Scratch** workspace is created automatically.
2. Open a Python file such as `demo/views.py` from the **Files** tree, edit it and press **Save**
   (or `Ctrl/Cmd+S`). Multiple files open as tabs, each with its own unsaved state.
3. Use the toolbar run controls — **Run** (play), **Restart** (rotate) and **Stop** (square) — to
   control the real Django process; the status indicator shows running/stopped/starting/error.
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

## What you can do (Phase 4 — Import & Export)

Everything is a single versioned JSON file; nothing leaves your machine.

- **Export an example**: press **Export** in the top bar. The download always includes the example's
  source files and its saved requests, and you can tick **Include the current dataset** to also bring the
  `demo` database rows along (off by default). Built-in examples can be exported too (files only).
- **Sensitive headers are stripped**: `Authorization`, `Cookie`, `Proxy-Authorization`, `Set-Cookie`,
  `X-Api-Key` and `X-Auth-Token` are removed from exported saved requests, and the UI tells you when that
  happened. Exported files never contain `db.sqlite3`, `__pycache__` or other generated files.
- **Import an example**: press **Import**, pick a `.json` file, review the summary (name, file count, saved
  requests, dataset) and confirm. Import **always creates a new example** with a new id — your existing
  examples are never modified or overwritten. A Python error inside an imported example is fine: it is
  saved and only fails when you press **Run**. If the example carries a dataset and that dataset cannot be
  loaded, the whole import is rolled back and nothing is left behind.
- **Export / Import Dataset** (in the **Database** tab) move just the `demo` app data as a Django fixture.
  Import is **replace-only**: it previews the incoming records (counts per model and missing models),
  warns that the current rows will be deleted, then loads the file. The database is backed up first, so a
  failed load (unknown model, bad fixture) leaves your **previous data untouched**.
- Malformed files, wrong format/version, disallowed file types, path traversal and oversized imports
  (over 5 MB) are all rejected by the backend with a clear message.

Round-trip example: open **CRUD API**, **Try & Run**, hit `POST /api/items/`, then **Export** with
**Include the current dataset** ticked, **Import** it back, and run the new example — it comes back with the
source, the saved requests and the rows you added.

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
- Import/Export reads and writes only within an example's own directory; import paths are validated
  (relative, allowed extensions, no `__pycache__`/`db.sqlite3`) before a single file is written.
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

- Phases 1–4 are complete. Not included (by design): Postman Collections, ZIP export and a Scenario Manager.
- Database Explorer is **read-only** — there is no SQL editor or row editing in the MVP, and only SQLite
  is supported.
- Dataset import is **replace-only** (no merge), and only covers the `demo` app.
- The migration action only targets the `demo` app.
- The Django runtime is for **personal, local** use and is not a secure sandbox for untrusted code.
- The runner has no access to the Docker socket and does not run privileged.

## PRD documents

The product documents live in `django-playground-prds/` (`00_PRODUCT_BRIEF.md`
and PRD-01..04). They are the original Persian specifications provided as input
to this repository.
