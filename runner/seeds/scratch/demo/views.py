from django.http import JsonResponse


def hello(request):
    """Return a simple JSON payload. Edit this message and press Run again."""
    return JsonResponse(
        {
            "message": "Hello!",
            "service": "django-playground",
            "app": "demo",
        }
    )
