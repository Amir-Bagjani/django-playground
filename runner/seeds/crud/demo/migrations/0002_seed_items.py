from django.db import migrations

SAMPLE_ITEMS = [
    {"name": "Notebook", "description": "A ruled paper notebook"},
    {"name": "Pen", "description": "A blue ballpoint pen"},
]


def seed_items(apps, schema_editor):
    Item = apps.get_model("demo", "Item")
    Item.objects.bulk_create([Item(**item) for item in SAMPLE_ITEMS])


def unseed_items(apps, schema_editor):
    Item = apps.get_model("demo", "Item")
    Item.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("demo", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_items, unseed_items),
    ]
