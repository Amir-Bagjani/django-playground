from django.http import JsonResponse

from .models import Book


def hello(request):
    return JsonResponse({"message": "Hello from the Models & ORM example!"})


def book_list(request):
    """Read the sample rows through the ORM and return them as JSON."""
    books = list(Book.objects.values("id", "title", "author", "published_year"))
    return JsonResponse({"count": len(books), "results": books})
