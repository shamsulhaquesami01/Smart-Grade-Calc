from django.test import SimpleTestCase

from .utils import (
    calculate_attendance_marks,
    calculate_best_cts,
    calculate_sessional_grade,
    calculate_theory_tf_requirements,
    predict_sessional_required,
)


class GradeCalculationTests(SimpleTestCase):
    def test_attendance_uses_the_30_mark_scale(self):
        self.assertEqual(calculate_attendance_marks(90), 30)
        self.assertEqual(calculate_attendance_marks(85), 27)
        self.assertEqual(calculate_attendance_marks(60), 12)
        self.assertEqual(calculate_attendance_marks(59.99), 0)

    def test_best_three_out_of_five_cts_are_normalized(self):
        total, scores = calculate_best_cts([
            {'obtained': 15, 'max': 20},
            {'obtained': 18, 'max': 20},
            {'obtained': 8, 'max': 10},
            {'obtained': 10, 'max': 20},
            {'obtained': 19, 'max': 20},
        ])
        self.assertEqual(scores, [19.0, 18.0, 16.0, 15.0, 10.0])
        self.assertEqual(total, 53.0)

    def test_theory_example_calculates_a_plus_tf_requirement(self):
        results = calculate_theory_tf_requirements(50, 10)
        a_plus = next(item for item in results['requirements'] if item['letter'] == 'A+')
        self.assertEqual(a_plus['needed_in_tf'], 180)
        self.assertAlmostEqual(a_plus['needed_tf_pct'], 85.71, places=2)

    def test_sessional_calculation_and_target_prediction(self):
        evaluations = [
            {'name': 'Assignment', 'weight': 70, 'obtained': 60, 'max': 70},
            {'name': 'Quiz', 'weight': 20, 'obtained': None, 'max': 20, 'is_target_item': True},
            {'name': 'Attendance', 'weight': 10, 'obtained': 10, 'max': 10},
        ]
        grade = calculate_sessional_grade(evaluations)
        prediction = predict_sessional_required(evaluations, 'Quiz', 'A+')
        self.assertEqual(grade['weighted_score'], 70)
        self.assertEqual(prediction['needed_score'], 10)


class CurriculumPresetTests(SimpleTestCase):
    def test_correct_l2t2_course_set_is_exposed(self):
        response = self.client.get('/api/presets/')
        self.assertEqual(response.status_code, 200)
        presets = response.json()['presets']
        codes = {course['code'] for course in presets}
        self.assertEqual(codes, {'CSE 200', 'CSE 209', 'CSE 210', 'CSE 211', 'CSE 213', 'CSE 214', 'CSE 219', 'CSE 220', 'MATH 243'})
        self.assertEqual(next(course for course in presets if course['code'] == 'CSE 220')['credits'], 1.5)

    def test_assessment_sheet_components_are_available_with_valid_weights(self):
        presets = self.client.get('/api/presets/').json()['presets']
        for code, expected_component in [
            ('CSE 210', 'MIPS Written Test'),
            ('CSE 214', 'Online 4 - Testing'),
            ('CSE 220', 'Project Milestone 2'),
        ]:
            course = next(course for course in presets if course['code'] == code)
            names = {item['name'] for item in course['evaluations']}
            self.assertIn(expected_component, names)
            self.assertAlmostEqual(sum(item['weight'] for item in course['evaluations']), 100)
