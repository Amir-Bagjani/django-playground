"""Django model used by the ORM lab.

``managed = False``: the ``products`` table is created by the Academy seeder
(DDL), not by Django migrations. The model only maps onto the existing table so
learner QuerySets read real MySQL rows.
"""
from __future__ import annotations

from django.db import models


class Product(models.Model):
    name = models.CharField(max_length=80)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    in_stock = models.BooleanField()

    class Meta:
        managed = False
        db_table = "products"
