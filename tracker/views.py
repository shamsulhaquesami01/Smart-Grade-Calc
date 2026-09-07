from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
import json
from .utils import (
    calculate_best_cts,
    calculate_attendance_marks,
    calculate_theory_tf_requirements,
    calculate_sessional_grade,
    predict_sessional_required,
    get_grade_info,
    GRADE_SCALE
)
from .models import CoursePreset, UserProfile

DEFAULT_PRESETS = [
    # 5 Theory Courses (3.0 credits each)
    {
        'code': 'CSE 209',
        'title': 'Computer Architecture',
        'course_type': 'theory',
        'credits': 3.0,
        'cts': [{'name': f'CT {number}', 'obtained': None, 'max': 20} for number in range(1, 5)],
        'has_extra_assignment': False,
        'attendance_pct': 0.0,
        'attendance_mode': 'pct',
        'attendance_direct': 30.0
    },
    {
        'code': 'CSE 211',
        'title': 'Theory of Computation',
        'course_type': 'theory',
        'credits': 3.0,
        'cts': [{'name': f'CT {number}', 'obtained': None, 'max': 20} for number in range(1, 5)],
        'has_extra_assignment': False,
        'attendance_pct': 0.0,
        'attendance_mode': 'pct',
        'attendance_direct': 27.0
    },
    {
        'code': 'CSE 213',
        'title': 'Software Engineering',
        'course_type': 'theory',
        'credits': 3.0,
        'cts': [{'name': f'CT {number}', 'obtained': None, 'max': 20} for number in range(1, 5)],
        'has_extra_assignment': False,
        'attendance_pct': 0.0,
        'attendance_mode': 'pct',
        'attendance_direct': 30.0
    },
    {
        'code': 'CSE 219',
        'title': 'Signals and Systems',
        'course_type': 'theory',
        'credits': 3.0,
        'cts': [{'name': f'CT {number}', 'obtained': None, 'max': 20} for number in range(1, 5)],
        'has_extra_assignment': False,
        'attendance_pct': 0.0,
        'attendance_mode': 'pct',
        'attendance_direct': 24.0
    },
    {
        'code': 'MATH 243',
        'title': 'Probability and Statistics',
        'course_type': 'theory',
        'credits': 3.0,
        'cts': [{'name': f'CT {number}', 'obtained': None, 'max': 20} for number in range(1, 5)],
        'has_extra_assignment': False,
        'attendance_pct': 0.0,
        'attendance_mode': 'pct',
        'attendance_direct': 30.0
    },

    # 4 Sessional Courses (0.75 credits each)
    {
        'code': 'CSE 210',
        'title': 'Computer Architecture Sessional',
        'course_type': 'sessional',
        'credits': 0.75,
        'mode': 'predict',
        'target_grade': 'A+',
        # Assessment sheet: ALU, MIPS written test, Adder, and 4-bit PC work.
        # The official outline permits 60-70% for assignments/projects and 20-30%
        # for the quiz, so these starting weights remain editable.
        'evaluations': [
            {'name': 'Attendance', 'weight': 10.0, 'obtained': None, 'max': 100.0, 'is_target': False},
            {'name': 'Assignment 1 - ALU Design', 'weight': 24.0, 'obtained': None, 'max': 40.0, 'is_target': False},
            {'name': 'MIPS Written Test', 'weight': 6.5, 'obtained': None, 'max': 10.0, 'is_target': False},
            {'name': 'Assignment 2 - Adder Design', 'weight': 17.25, 'obtained': None, 'max': 30.0, 'is_target': False},
            {'name': 'Assignment 3 - 4-bit PC', 'weight': 17.25, 'obtained': None, 'max': 30.0, 'is_target': False},
            {'name': 'Comprehensive Quiz', 'weight': 25.0, 'obtained': None, 'max': 100.0, 'is_target': True},
        ]
    },
    {
        'code': 'CSE 214',
        'title': 'Software Engineering Sessional',
        'course_type': 'sessional',
        'credits': 0.75,
        'mode': 'predict',
        'target_grade': 'A+',
        'evaluations': [
            {'name': 'Attendance', 'weight': 5.0, 'obtained': None, 'max': 100.0, 'is_target': False},
            {'name': 'Offline 1 - Creational Design Pattern', 'weight': 14.0, 'obtained': None, 'max': 100.0, 'is_target': False},
            {'name': 'Online 1 - Creational Design Pattern', 'weight': 3.5, 'obtained': None, 'max': 10.0, 'is_target': False},
            {'name': 'Offline 2 - Structural Design Pattern', 'weight': 14.0, 'obtained': None, 'max': 100.0, 'is_target': False},
            {'name': 'Online 2 - Structural Design Pattern', 'weight': 3.5, 'obtained': None, 'max': 10.0, 'is_target': False},
            {'name': 'Offline 3 - Behavioral Design Pattern', 'weight': 14.0, 'obtained': None, 'max': 100.0, 'is_target': False},
            {'name': 'Online 3 - Behavioral Design Pattern', 'weight': 3.5, 'obtained': None, 'max': 10.0, 'is_target': False},
            {'name': 'Offline 4 - Testing', 'weight': 14.0, 'obtained': None, 'max': 100.0, 'is_target': False},
            {'name': 'Online 4 - Testing', 'weight': 3.5, 'obtained': None, 'max': 10.0, 'is_target': False},
            {'name': 'Final Comprehensive Quiz', 'weight': 25.0, 'obtained': None, 'max': 100.0, 'is_target': True},
        ]
    },
    {
        'code': 'CSE 220',
        'title': 'Signals and Systems Sessional',
        'course_type': 'sessional',
        'credits': 1.5,
        'mode': 'predict',
        'target_grade': 'A+',
        'evaluations': [
            {'name': 'Attendance', 'weight': 10.0, 'obtained': None, 'max': 100.0, 'is_target': False},
            {'name': 'Offline 1', 'weight': 12.0, 'obtained': None, 'max': 100.0, 'is_target': False},
            {'name': 'Offline 2', 'weight': 12.0, 'obtained': None, 'max': 100.0, 'is_target': False},
            {'name': 'Offline 3', 'weight': 12.0, 'obtained': None, 'max': 100.0, 'is_target': False},
            {'name': 'Online 1', 'weight': 4.0, 'obtained': None, 'max': 10.0, 'is_target': False},
            {'name': 'Online 2', 'weight': 4.0, 'obtained': None, 'max': 10.0, 'is_target': False},
            {'name': 'Online 3', 'weight': 4.0, 'obtained': None, 'max': 10.0, 'is_target': False},
            {'name': 'Online 4', 'weight': 4.0, 'obtained': None, 'max': 10.0, 'is_target': False},
            {'name': 'Online 5', 'weight': 4.0, 'obtained': None, 'max': 10.0, 'is_target': False},
            {'name': 'Project Milestone 1', 'weight': 7.0, 'obtained': None, 'max': 100.0, 'is_target': False},
            {'name': 'Project Milestone 2', 'weight': 7.0, 'obtained': None, 'max': 100.0, 'is_target': False},
            {'name': 'Quiz Exam', 'weight': 20.0, 'obtained': None, 'max': 100.0, 'is_target': True},
        ]
    },
    {
        'code': 'CSE 200',
        'title': 'Technical Writing and Presentation',
        'course_type': 'sessional',
        'credits': 0.75,
        'mode': 'predict',
        'target_grade': 'A+',
        # The supplied outline lists these activities but no mark split. Adjust freely
        # once the instructor announces the actual distribution.
        'evaluations': [
            {'name': 'Attendance', 'weight': 10.0, 'obtained': None, 'max': 100.0, 'is_target': False},
            {'name': 'Online / Practical Evaluation', 'weight': 35.0, 'obtained': None, 'max': 100.0, 'is_target': False},
            {'name': 'Offline Assignment', 'weight': 20.0, 'obtained': None, 'max': 100.0, 'is_target': False},
            {'name': 'Presentation & Report', 'weight': 25.0, 'obtained': None, 'max': 100.0, 'is_target': False},
            {'name': 'Quiz', 'weight': 10.0, 'obtained': None, 'max': 100.0, 'is_target': True},
        ]
    }
]

@ensure_csrf_cookie
def index(request):
    return render(request, 'tracker/index.html')

def api_get_presets(request):
    return JsonResponse({
        'status': 'success',
        'grade_scale': GRADE_SCALE,
        'presets': DEFAULT_PRESETS
    })

@csrf_exempt
def api_calculate_theory(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=400)
    
    try:
        data = json.loads(request.body)
        ct_scores = data.get('cts', [])
        best_count = int(data.get('best_count', 3))
        attendance_mode = data.get('attendance_mode', 'pct')
        
        if attendance_mode == 'pct':
            attn_pct = float(data.get('attendance_pct', 0) or 0)
            attn_marks = calculate_attendance_marks(attn_pct)
        else:
            attn_marks = float(data.get('attendance_direct', 0) or 0)
            attn_pct = (attn_marks / 30.0) * 100.0
            
        ct_total, sorted_cts = calculate_best_cts(ct_scores, max_per_ct=20.0, best_count=best_count)
        analysis = calculate_theory_tf_requirements(ct_total, attn_marks)
        analysis['sorted_cts'] = sorted_cts
        analysis['attendance_pct'] = attn_pct
        
        return JsonResponse({'status': 'success', 'data': analysis})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
def api_calculate_sessional(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=400)
        
    try:
        data = json.loads(request.body)
        evaluations = data.get('evaluations', [])
        target_grade = data.get('target_grade', 'A+')
        target_item_name = data.get('target_item_name', 'Mandatory Quiz')
        
        calc_result = calculate_sessional_grade(evaluations)
        prediction = predict_sessional_required(evaluations, target_item_name, target_grade)
        
        return JsonResponse({
            'status': 'success',
            'grade_summary': calc_result,
            'prediction': prediction
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
def api_simulate_gpa(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=400)
        
    try:
        data = json.loads(request.body)
        courses = data.get('courses', [])
        target_gpa = float(data.get('target_gpa', 3.75))
        
        total_credits = 0.0
        secured_weighted_gpa = 0.0
        theory_courses_count = 0
        sessional_credits = 0.0
        theory_credits = 0.0
        
        course_summaries = []
        
        for c in courses:
            cr = float(c.get('credits', 3.0))
            total_credits += cr
            c_type = c.get('course_type', 'theory')
            
            if c_type == 'theory':
                theory_courses_count += 1
                theory_credits += cr
                ct_total, _ = calculate_best_cts(c.get('cts', []), best_count=c.get('best_count', 3))
                if c.get('attendance_mode') == 'pct':
                    attn_m = calculate_attendance_marks(c.get('attendance_pct', 0))
                else:
                    attn_m = float(c.get('attendance_direct', 0) or 0)
                
                reqs = calculate_theory_tf_requirements(ct_total, attn_m)
                course_summaries.append({
                    'code': c.get('code'),
                    'title': c.get('title'),
                    'type': 'theory',
                    'credits': cr,
                    'obtained_so_far_90': reqs['obtained_so_far'],
                    'ct_total_60': ct_total,
                    'attn_marks_30': attn_m,
                    'tf_requirements': reqs['requirements']
                })
            else:
                sessional_credits += cr
                sess_res = calculate_sessional_grade(c.get('evaluations', []))
                gpa = sess_res['gpa']
                secured_weighted_gpa += (gpa * cr)
                course_summaries.append({
                    'code': c.get('code'),
                    'title': c.get('title'),
                    'type': 'sessional',
                    'credits': cr,
                    'score_pct': sess_res['weighted_score'],
                    'letter': sess_res['letter'],
                    'gpa': gpa
                })
                
        return JsonResponse({
            'status': 'success',
            'total_credits': total_credits,
            'theory_credits': theory_credits,
            'sessional_credits': sessional_credits,
            'secured_sessional_gpa': round(secured_weighted_gpa / sessional_credits, 2) if sessional_credits > 0 else 0,
            'course_summaries': course_summaries
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
