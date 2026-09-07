from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('api/presets/', views.api_get_presets, name='api_presets'),
    path('api/calc/theory/', views.api_calculate_theory, name='api_calc_theory'),
    path('api/calc/sessional/', views.api_calculate_sessional, name='api_calc_sessional'),
    path('api/simulate/gpa/', views.api_simulate_gpa, name='api_simulate_gpa'),
]
