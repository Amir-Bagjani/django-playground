from django.db import models

class Customer(models.Model):
    full_name = models.CharField(max_length=120)

# TODO: Define Order with a required customer relationship and decimal total.
