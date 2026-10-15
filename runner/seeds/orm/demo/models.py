from django.db import models


class Book(models.Model):
    title = models.CharField(max_length=200)
    author = models.CharField(max_length=120)
    published_year = models.PositiveIntegerField()

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.title
