"""A small model so the project has a real migration and a real SQLite table.

The default ``/api/hello/`` endpoint does not use the database, but having a
model here keeps the project realistic and ready for later phases.
"""
from django.db import models


class Note(models.Model):
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.title
