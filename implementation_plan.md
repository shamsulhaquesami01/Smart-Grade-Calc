# Implementation Plan - CSE L2T2 Grade Calculator & Performance Tracker Web App

An interactive, feature-rich web application tailored for CSE Level 2 Term 2 (BUET curriculum context) to calculate required marks, track sessional/theory performance, customize evaluation weightages, and project Term GPA / CGPA.

## Architecture & Technology Choice
We will build a high-performance, responsive Single-Page Web Application using **React + Vite** (JavaScript/TypeScript) styled with CSS variables and glassmorphism design tokens, integrated with Chart.js / Lucide icons for rich visuals.

### Key Features:
1. **L2T2 Preset & Custom Courses**:
   - 5 Theory Courses (default 3.0 credits each, 300 marks total).
   - 4 Sessional Courses (default 0.75 credits each, customizable weightages).
   - Ability to add/edit/remove courses and adjust credit hours.

2. **Theory Course Engine**:
   - **Best 3 out of 4 (or N)** Class Test (CT) selector with optional extra assignment support (best 3 out of 5, etc.).
   - **Attendance Marks Calculator**: Interactive attendance % input with automated BUET attendance mark mapping (>90% -> 30, >85% -> 27, >80% -> 24, etc.), with option for manual override.
   - **Term Final Required Marks Predictor**: Calculates exact required marks out of 210 (and percentage required in TF) to achieve target grades (A+, A, A-, B+, B, B-, C+, C, D).

3. **Sessional Course Engine**:
   - Customizable evaluation components (Onlines, Offlines / Home Assignments, Quizzes, Presentations, Lab Tests, Attendance).
   - **Custom Weightage Sliders/Inputs**: Adjust weightages per evaluation component per course dynamically (e.g., Quiz 25%, Onlines 45%, Offlines 20%, Attendance 10%).
   - **Dual Sessional Mode**:
     - *Predictor Mode*: Input obtained scores & weightages for completed items -> calculate score required in remaining items (e.g., Quiz) for target grade.
     - *Calculator Mode*: Input all evaluation scores & weightages -> calculate final sessional mark, letter grade, and grade points.

4. **Performance Tracker & GPA Simulator**:
   - Dashboard showing overall predicted Term GPA, total credit points, grade breakdown, and radar/bar charts of course readiness.
   - **Target GPA Simulator**: "What do I need in TF across all theory courses to achieve a target Term GPA of 3.75?"
   - LocalStorage auto-save & export/import JSON profile state.

---

## User Review Required

> [!IMPORTANT]
> - Default Theory Courses set to standard L2T2 CSE courses: CSE 207/209/211/213/219 or standard 5 theory + 4 sessionals (CSE 210, CSE 214, CSE 220, etc.). Course titles and credit values will be fully editable in the UI.
> - Attendance percentage buckets default to standard 30-mark scale (>90%: 30, >85%: 27, >80%: 24, >75%: 21, >70%: 18, >65%: 15, >60%: 12), with option for 10-mark scale or direct entry.

---

## Proposed Changes

### Web Application (Vite + React)

#### [NEW] [package.json](file:///d:/LocalDev/projects/Smart-Grade-Calc/package.json)
Dependencies including `react`, `react-dom`, `lucide-react`, `chart.js`, `react-chartjs-2`.

#### [NEW] [src/App.jsx](file:///d:/LocalDev/projects/Smart-Grade-Calc/src/App.jsx)
Main application container with tab navigation (Dashboard, Theory Calculator, Sessional Calculator, Target GPA Simulator, Course Manager).

#### [NEW] [src/index.css](file:///d:/LocalDev/projects/Smart-Grade-Calc/src/index.css)
Modern dark-mode glassmorphism design system, vibrant gradients, typography, and micro-animations.

#### [NEW] [src/components/TheoryCourseCard.jsx](file:///d:/LocalDev/projects/Smart-Grade-Calc/src/components/TheoryCourseCard.jsx)
Interactive component for CT best-of-N selection, attendance calculation, and Term Final requirement table.

#### [NEW] [src/components/SessionalCourseCard.jsx](file:///d:/LocalDev/projects/Smart-Grade-Calc/src/components/SessionalCourseCard.jsx)
Dynamic sessional evaluation table with weightage sliders, predictor/calculator mode toggle, and quiz score requirement solver.

#### [NEW] [src/components/Dashboard.jsx](file:///d:/LocalDev/projects/Smart-Grade-Calc/src/components/Dashboard.jsx)
Visual overview of term performance, GPA gauge, credit breakdown, and subject progress charts.

#### [NEW] [src/components/GpaSimulator.jsx](file:///d:/LocalDev/projects/Smart-Grade-Calc/src/components/GpaSimulator.jsx)
Overall Term GPA calculator and target solver.

#### [NEW] [src/utils/gradeCalculations.js](file:///d:/LocalDev/projects/Smart-Grade-Calc/src/utils/gradeCalculations.js)
Core grading logic (BUET grade scale, CT best 3 out of N algorithm, attendance mapping, sessional weighted sums, TF requirement math).

---

## Verification Plan

### Automated Tests
- Run `npm run build` to verify clean build without TypeScript/JSX syntax errors.

### Manual Verification
- Test CT best 3 out of 4 and 5 logic.
- Test attendance grade calculation.
- Test Term Final target calculation (e.g. 50/60 CT + 10/30 Attn = 60 -> needs 180/210 for 240/300 A+).
- Test Sessional weightage sliders & predictor/calculator modes.
- Test LocalStorage save and load.
