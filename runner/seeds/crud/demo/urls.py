from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("items", views.ItemViewSet, basename="item")

urlpatterns = [
    path("hello/", views.hello, name="hello"),
] + router.urls
