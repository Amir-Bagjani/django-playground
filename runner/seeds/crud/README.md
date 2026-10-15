# CRUD API (Django REST Framework)

A small DRF example with an `Item` model and a `ModelViewSet` that provides:

- `GET /api/items/` — list
- `POST /api/items/` — create
- `GET /api/items/<id>/` — detail
- `PUT/PATCH /api/items/<id>/` — update
- `DELETE /api/items/<id>/` — delete

Two sample items are inserted by a data migration on `migrate`. This is a
starting point, not a tutorial.
