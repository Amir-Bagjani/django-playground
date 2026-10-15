# Models & ORM

A small Django project showing a `Book` model, its migration and three sample
rows that are inserted by a data migration on `migrate`.

- `demo/models.py` — the `Book` model.
- `demo/migrations/0002_seed_books.py` — inserts the sample rows.
- `GET /api/books/` reads the rows through the Django ORM and returns JSON.

This is a starting point, not a tutorial.
