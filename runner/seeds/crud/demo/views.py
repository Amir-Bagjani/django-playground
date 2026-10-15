from django.http import JsonResponse
from rest_framework import viewsets

from .models import Item
from .serializers import ItemSerializer


def hello(request):
    return JsonResponse({"message": "Hello from the CRUD API example!"})


class ItemViewSet(viewsets.ModelViewSet):
    """GET list/detail, POST, PUT/PATCH and DELETE for Item."""

    queryset = Item.objects.all()
    serializer_class = ItemSerializer
