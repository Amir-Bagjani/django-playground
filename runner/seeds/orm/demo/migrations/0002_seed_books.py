from django.db import migrations

SAMPLE_BOOKS = [
    {"title": "The Pragmatic Programmer", "author": "Hunt & Thomas", "published_year": 1999},
    {"title": "Clean Code", "author": "Robert C. Martin", "published_year": 2008},
    {"title": "Two Scoops of Django", "author": "Greenfeld & Roy", "published_year": 2015},
]


def seed_books(apps, schema_editor):
    Book = apps.get_model("demo", "Book")
    Book.objects.bulk_create([Book(**book) for book in SAMPLE_BOOKS])


def unseed_books(apps, schema_editor):
    Book = apps.get_model("demo", "Book")
    Book.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("demo", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_books, unseed_books),
    ]
