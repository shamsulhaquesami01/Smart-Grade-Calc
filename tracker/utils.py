"""
Grade Calculation Utility Module for BUET CSE L2T2
Handles CT best-of-N, Attendance mapping, Term Final predictions, Sessional weighted evaluations, and Term GPA simulations.
"""

GRADE_SCALE = [
    {'letter': 'A+', 'gpa': 4.00, 'min_pct': 80.0, 'target_mark_300': 240.0},
    {'letter': 'A',  'gpa': 3.75, 'min_pct': 75.0, 'target_mark_300': 225.0},
    {'letter': 'A-', 'gpa': 3.50, 'min_pct': 70.0, 'target_mark_300': 210.0},
    {'letter': 'B+', 'gpa': 3.25, 'min_pct': 65.0, 'target_mark_300': 195.0},
    {'letter': 'B',  'gpa': 3.00, 'min_pct': 60.0, 'target_mark_300': 180.0},
    {'letter': 'B-', 'gpa': 2.75, 'min_pct': 55.0, 'target_mark_300': 165.0},
    {'letter': 'C+', 'gpa': 2.50, 'min_pct': 50.0, 'target_mark_300': 150.0},
    {'letter': 'C',  'gpa': 2.25, 'min_pct': 45.0, 'target_mark_300': 135.0},
    {'letter': 'D',  'gpa': 2.00, 'min_pct': 40.0, 'target_mark_300': 120.0},
    {'letter': 'F',  'gpa': 0.00, 'min_pct': 0.0,  'target_mark_300': 0.0},
]

def get_grade_info(pct):
    """Return grade letter and GPA for a given total percentage score."""
    for item in GRADE_SCALE:
        if pct >= item['min_pct'] - 1e-9:
            return item['letter'], item['gpa']
    return 'F', 0.00

def calculate_best_cts(ct_scores, max_per_ct=20.0, best_count=3):
    """
    Given a list of CT scores (obtained, total_max),
    converts each to a score out of 20, sorts descending, and sums top best_count.
    Returns: (ct_total_out_of_60, sorted_normalized_scores)
    """
    normalized = []
    for item in ct_scores:
        if isinstance(item, dict):
            obt = float(item.get('obtained', 0) or 0)
            mx = float(item.get('max', max_per_ct) or max_per_ct)
        elif isinstance(item, (int, float)):
            obt = float(item)
            mx = float(max_per_ct)
        else:
            continue
        
        scaled = (obt / mx) * 20.0 if mx > 0 else 0.0
        normalized.append(round(scaled, 2))
    
    normalized.sort(reverse=True)
    best_scores = normalized[:best_count]
    ct_total = sum(best_scores)
    return round(ct_total, 2), normalized

def calculate_attendance_marks(attendance_pct):
    """
    Standard BUET attendance scale for 30 marks (Theory):
    >=90%: 30 (100%)
    >=85%: 27 (90%)
    >=80%: 24 (80%)
    >=75%: 21 (70%)
    >=70%: 18 (60%)
    >=65%: 15 (50%)
    >=60%: 12 (40%)
    <60%: 0
    """
    pct = float(attendance_pct or 0)
    if pct >= 90:
        return 30.0
    elif pct >= 85:
        return 27.0
    elif pct >= 80:
        return 24.0
    elif pct >= 75:
        return 21.0
    elif pct >= 70:
        return 18.0
    elif pct >= 65:
        return 15.0
    elif pct >= 60:
        return 12.0
    else:
        return 0.0

def calculate_theory_tf_requirements(ct_total_60, attendance_marks_30):
    """
    Calculates required Term Final marks out of 210 for each grade target.
    Total Theory course = 300 marks (60 CT + 30 Attn + 210 TF).
    """
    obtained_so_far = ct_total_60 + attendance_marks_30  # Max 90
    results = []
    
    for item in GRADE_SCALE:
        if item['letter'] == 'F':
            continue
            
        target_mark = item['target_mark_300']
        needed_in_tf = target_mark - obtained_so_far
        needed_tf_pct = (needed_in_tf / 210.0) * 100.0 if 210.0 > 0 else 0.0
        
        status = 'achievable'
        if needed_in_tf > 210.0:
            status = 'impossible'
        elif needed_in_tf <= 0.0:
            status = 'already_secured'
            needed_in_tf = 0.0
            needed_tf_pct = 0.0

        results.append({
            'letter': item['letter'],
            'gpa': item['gpa'],
            'min_pct': item['min_pct'],
            'target_total_300': target_mark,
            'needed_in_tf': round(needed_in_tf, 2),
            'needed_tf_pct': round(needed_tf_pct, 2),
            'status': status,
        })
        
    return {
        'ct_total': ct_total_60,
        'attendance_marks': attendance_marks_30,
        'obtained_so_far': obtained_so_far,
        'requirements': results
    }

def calculate_sessional_grade(evaluations):
    """
    evaluations: list of dicts [{'name': 'Online 1', 'weight': 25, 'obtained': 18, 'max': 20, 'is_completed': True}, ...]
    Returns total percentage obtained and letter grade/gpa.
    """
    total_weight = 0.0
    weighted_score = 0.0
    
    for ev in evaluations:
        w = float(ev.get('weight', 0) or 0)
        total_weight += w
        if ev.get('is_completed', True) and ev.get('obtained') is not None:
            obt = float(ev['obtained'])
            mx = float(ev.get('max', 100) or 100)
            if mx > 0:
                weighted_score += (obt / mx) * w

    effective_pct = (weighted_score / total_weight * 100.0) if total_weight > 0 else 0.0
    letter, gpa = get_grade_info(weighted_score) # since weights sum to 100%, weighted_score is out of 100
    
    return {
        'weighted_score': round(weighted_score, 2),
        'total_weight': round(total_weight, 2),
        'letter': letter,
        'gpa': gpa
    }

def predict_sessional_required(evaluations, target_item_name, target_grade_letter='A+'):
    """
    Predicts required score in target_item (e.g. 'Quiz') to achieve target_grade_letter.
    """
    target_info = next((item for item in GRADE_SCALE if item['letter'] == target_grade_letter), GRADE_SCALE[0])
    target_pct = target_info['min_pct']
    
    accumulated_pct = 0.0
    target_weight = 0.0
    target_max = 100.0
    
    for ev in evaluations:
        name = ev.get('name', '')
        w = float(ev.get('weight', 0) or 0)
        if name == target_item_name or ev.get('is_target_item', False):
            target_weight = w
            target_max = float(ev.get('max', 100) or 100)
        else:
            if ev.get('obtained') is not None:
                obt = float(ev['obtained'])
                mx = float(ev.get('max', 100) or 100)
                if mx > 0:
                    accumulated_pct += (obt / mx) * w
                    
    needed_weight_pts = target_pct - accumulated_pct
    if target_weight <= 0:
        return {'status': 'invalid_weight', 'needed_score': 0, 'needed_pct': 0}
        
    needed_item_pct = (needed_weight_pts / target_weight) * 100.0
    needed_score = (needed_item_pct / 100.0) * target_max
    
    status = 'achievable'
    if needed_score > target_max:
        status = 'impossible'
    elif needed_score <= 0:
        status = 'already_secured'
        needed_score = 0.0
        needed_item_pct = 0.0
        
    return {
        'target_grade': target_grade_letter,
        'target_gpa': target_info['gpa'],
        'accumulated_pct': round(accumulated_pct, 2),
        'target_weight': target_weight,
        'needed_item_pct': round(needed_item_pct, 2),
        'needed_score': round(needed_score, 2),
        'target_max': target_max,
        'status': status
    }
