from django.db import models
import json

class CoursePreset(models.Model):
    COURSE_TYPES = (
        ('theory', 'Theory Course (300 marks)'),
        ('sessional', 'Sessional Course (Custom Weights)'),
    )
    
    code = models.CharField(max_length=20, unique=True)
    title = models.CharField(max_length=150)
    course_type = models.CharField(max_length=20, choices=COURSE_TYPES, default='theory')
    credits = models.FloatField(default=3.0)
    description = models.TextField(blank=True)
    default_evaluations_json = models.TextField(default='[]', help_text='JSON list of default sessional evaluation components')

    def __str__(self):
        return f"{self.code}: {self.title} ({self.get_course_type_display()})"

    def get_evaluations(self):
        try:
            return json.loads(self.default_evaluations_json)
        except Exception:
            return []

class UserProfile(models.Model):
    name = models.CharField(max_length=100, default='BUETian L2T2 Student')
    student_id = models.CharField(max_length=20, blank=True)
    target_gpa = models.FloatField(default=3.75)
    saved_state_json = models.TextField(default='{}')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile: {self.name} ({self.student_id or 'No ID'})"
