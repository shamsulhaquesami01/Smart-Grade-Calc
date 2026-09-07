/**
 * SmartGrade L2T2 - Frontend Reactive Engine
 */

document.addEventListener('DOMContentLoaded', () => {
    // State storage
    let appState = {
        gradeScale: [],
        courses: [],
        targetGpa: 3.75
    };

    let chartTheoryRadar = null;
    let chartTfBar = null;

    // Initialize Icons
    if (window.lucide) {
        lucide.createIcons();
    }

    // Tab Switching Logic
    const tabs = document.querySelectorAll('.nav-tab');
    const panes = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');

            const tabId = tab.getAttribute('data-tab');
            const targetPane = document.getElementById(`tab-${tabId}`);
            if (targetPane) {
                targetPane.classList.add('active');
            }

            if (tabId === 'dashboard') {
                renderDashboard();
            } else if (tabId === 'simulator') {
                renderSimulator();
            }
        });
    });

    // Load initial presets from server or localStorage
    fetchPresets();

    function fetchPresets() {
        const localSaved = localStorage.getItem('smart_grade_l2t2_state');
        if (localSaved) {
            try {
                appState = JSON.parse(localSaved);
                fetch('/api/presets/').then(r => r.json()).then(data => {
                    appState.gradeScale = data.grade_scale || appState.gradeScale;
                    migrateCurriculum(data.presets || []);
                    initApp();
                });
                return;
            } catch (e) {
                console.error("Error reading saved state, falling back to presets", e);
            }
        }

        fetch('/api/presets/')
            .then(res => res.json())
            .then(data => {
                appState.gradeScale = data.grade_scale;
                appState.courses = data.presets;
                saveState();
                initApp();
            })
            .catch(err => console.error("Failed to load presets:", err));
    }

    function saveState() {
        localStorage.setItem('smart_grade_l2t2_state', JSON.stringify(appState));
    }

    // Correct saved profiles created with the old CSE 208 / MATH 247 presets.
    // Scores for unaffected courses remain untouched.
    function migrateCurriculum(presets) {
        const byCode = Object.fromEntries(presets.map(course => [course.code, course]));
        const oldSessional = appState.courses.find(course => course.code === 'CSE 208');
        if (oldSessional && byCode['CSE 200']) {
            Object.assign(oldSessional, JSON.parse(JSON.stringify(byCode['CSE 200'])));
        }
        const oldMath = appState.courses.find(course => course.code === 'MATH 247');
        if (oldMath && byCode['MATH 243']) {
            Object.assign(oldMath, { ...byCode['MATH 243'], cts: oldMath.cts, attendance_pct: oldMath.attendance_pct, attendance_mode: oldMath.attendance_mode, attendance_direct: oldMath.attendance_direct });
        }
        const cse220 = appState.courses.find(course => course.code === 'CSE 220');
        if (cse220) cse220.credits = 1.5;
        // Replace only the old high-level placeholders with assessment-sheet
        // components. Profiles that already contain detailed entries are kept.
        ['CSE 210', 'CSE 214', 'CSE 220'].forEach(code => {
            const savedCourse = appState.courses.find(course => course.code === code);
            const preset = byCode[code];
            if (!savedCourse || !preset) return;
            const names = (savedCourse.evaluations || []).map(item => item.name);
            if (names.includes('Assignments & Projects') || names.includes('Assignments')) {
                savedCourse.evaluations = JSON.parse(JSON.stringify(preset.evaluations));
            }
        });
        saveState();
    }

    function initApp() {
        renderTheoryCourses();
        renderSessionalCourses();
        renderDashboard();
        renderSimulator();
        setupGlobalEvents();
    }

    /* -------------------------------------------------------------
     * 1. THEORY COURSES ENGINE
     * ------------------------------------------------------------- */
    function renderTheoryCourses() {
        const container = document.getElementById('theoryCoursesContainer');
        if (!container) return;

        const theoryCourses = appState.courses.filter(c => c.course_type === 'theory');
        container.innerHTML = '';

        theoryCourses.forEach((course, index) => {
            const courseIdx = appState.courses.indexOf(course);
            const card = document.createElement('div');
            card.className = 'card glass course-card';
            card.dataset.index = courseIdx;

            const bestCount = course.has_extra_assignment ? 3 : 3; // best 3 out of N
            const ctScores = course.cts || [];
            
            // Calculate best 3 sum
            const normCts = ctScores.map(ct => {
                const obt = parseFloat(ct.obtained || 0);
                const mx = parseFloat(ct.max || 20);
                return mx > 0 ? (obt / mx) * 20.0 : 0;
            });

            // Find indices of best 3
            const sortedIndices = normCts
                .map((val, idx) => ({ val, idx }))
                .sort((a, b) => b.val - a.val)
                .slice(0, 3)
                .map(item => item.idx);

            const ctTotal60 = sortedIndices.reduce((acc, i) => acc + normCts[i], 0);

            // Attendance
            let attnMarks = 0;
            let attnPct = parseFloat(course.attendance_pct || 0);
            if (course.attendance_mode === 'direct') {
                attnMarks = parseFloat(course.attendance_direct || 0);
                attnPct = (attnMarks / 30.0) * 100.0;
            } else {
                attnMarks = getAttendanceMarksFromPct(attnPct);
            }

            const obtainedSoFar = ctTotal60 + attnMarks;
            const tfRequirements = calculateTfRequirements(obtainedSoFar);

            card.innerHTML = `
                <div class="course-card-header">
                    <div class="course-title-group">
                        <span class="course-code-tag">${course.code}</span>
                        <h3>${course.title}</h3>
                    </div>
                    <div class="course-sub-info">
                        Credits: <strong>${course.credits}</strong> &bull; Max Pre-TF Marks: <strong>90</strong> (60 CT + 30 Attn)
                    </div>
                </div>

                <div class="theory-card-body">
                    <!-- CT Section -->
                    <div class="ct-eval-section">
                        <div class="section-subheading">
                            <span><i data-lucide="edit-3"></i> Class Tests (CTs)</span>
                            <label class="badge badge-info" style="cursor:pointer">
                                <input type="checkbox" class="chk-extra-ct" data-cindex="${courseIdx}" ${course.has_extra_assignment ? 'checked' : ''}>
                                Include 5th CT / Assignment
                            </label>
                        </div>
                        <div class="ct-inputs-grid">
                            ${ctScores.map((ct, ctIdx) => {
                                const isBest = sortedIndices.includes(ctIdx);
                                return `
                                    <div class="input-box">
                                        <label>${ct.name} ${isBest ? '<span class="text-accent">✓</span>' : ''}</label>
                                        <input type="number" 
                                            class="ct-score-input ${isBest ? 'ct-is-counted' : ''}" 
                                            data-cindex="${courseIdx}" 
                                            data-ctindex="${ctIdx}" 
                                            value="${ct.obtained !== null ? ct.obtained : ''}" 
                                            min="0" max="${ct.max || 20}" step="0.5" placeholder="0-20">
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        <div class="summary-strip">
                            <span>Best 3 CT Total:</span>
                            <span class="highlight-val">${ctTotal60.toFixed(1)} / 60.0</span>
                        </div>
                    </div>

                    <!-- Attendance Section -->
                    <div class="attendance-section">
                        <div class="section-subheading">
                            <span><i data-lucide="check-circle-2"></i> Class Attendance</span>
                            <div class="attendance-mode-switch">
                                <button class="btn btn-sm ${course.attendance_mode !== 'direct' ? 'btn-primary' : 'btn-outline'} btn-attn-mode" data-cindex="${courseIdx}" data-mode="pct">% Attendance</button>
                                <button class="btn btn-sm ${course.attendance_mode === 'direct' ? 'btn-primary' : 'btn-outline'} btn-attn-mode" data-cindex="${courseIdx}" data-mode="direct">Direct Score</button>
                            </div>
                        </div>
                        ${course.attendance_mode !== 'direct' ? `
                            <div class="input-box" style="margin-bottom: 12px;">
                                <label>Attendance Percentage: <strong>${attnPct.toFixed(0)}%</strong></label>
                                <input type="range" class="attn-pct-slider" data-cindex="${courseIdx}" min="50" max="100" step="1" value="${attnPct}">
                            </div>
                        ` : `
                            <div class="input-box" style="margin-bottom: 12px;">
                                <label>Direct Marks (out of 30)</label>
                                <input type="number" class="attn-direct-input" data-cindex="${courseIdx}" min="0" max="30" step="0.5" value="${course.attendance_direct ?? 0}">
                            </div>
                        `}
                        <div class="summary-strip">
                            <span>Attendance Marks:</span>
                            <span class="highlight-val">${attnMarks.toFixed(1)} / 30.0</span>
                        </div>
                    </div>

                    <!-- Term Final Target Requirements Table -->
                    <div class="tf-matrix-container">
                        <div class="section-subheading">
                            <span><i data-lucide="target"></i> Required Term Final Marks (out of 210) for Target Grades</span>
                            <span class="badge badge-success">Obtained so far: ${obtainedSoFar.toFixed(1)} / 90</span>
                        </div>
                        <table class="tf-matrix-table">
                            <tr>
                                ${tfRequirements.map(req => {
                                    let cssClass = 'td-achievable';
                                    if (req.status === 'secured') cssClass = 'td-secured';
                                    if (req.status === 'impossible') cssClass = 'td-impossible';

                                    return `
                                        <td class="${cssClass}">
                                            <div class="grade-target">${req.letter}</div>
                                            <div class="needed-val">${req.status === 'secured' ? 'Secured 🎉' : (req.status === 'impossible' ? 'N/A' : req.neededInTf.toFixed(1))}</div>
                                            <div class="needed-pct">${req.status === 'achievable' ? '(' + req.neededTfPct.toFixed(1) + '%)' : ''}</div>
                                        </td>
                                    `;
                                }).join('')}
                            </tr>
                        </table>
                    </div>
                </div>
            `;

            container.appendChild(card);
        });

        if (window.lucide) lucide.createIcons();
        attachTheoryEvents();
    }

    function getAttendanceMarksFromPct(pct) {
        if (pct >= 90) return 30.0;
        if (pct >= 85) return 27.0;
        if (pct >= 80) return 24.0;
        if (pct >= 75) return 21.0;
        if (pct >= 70) return 18.0;
        if (pct >= 65) return 15.0;
        if (pct >= 60) return 12.0;
        return 0.0;
    }

    function calculateTfRequirements(obtainedSoFar) {
        return appState.gradeScale.filter(g => g.letter !== 'F').map(item => {
            const targetTotal = item.target_mark_300;
            let needed = targetTotal - obtainedSoFar;
            let pctNeeded = (needed / 210.0) * 100.0;
            let status = 'achievable';

            if (needed <= 0) {
                status = 'secured';
                needed = 0;
                pctNeeded = 0;
            } else if (needed > 210.0) {
                status = 'impossible';
            }

            return {
                letter: item.letter,
                neededInTf: needed,
                neededTfPct: pctNeeded,
                status: status
            };
        });
    }

    function attachTheoryEvents() {
        // CT score change
        document.querySelectorAll('.ct-score-input').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const cIdx = parseInt(e.target.dataset.cindex);
                const ctIdx = parseInt(e.target.dataset.ctindex);
                const val = e.target.value !== '' ? parseFloat(e.target.value) : null;
                appState.courses[cIdx].cts[ctIdx].obtained = val;
                saveState();
                renderTheoryCourses();
            });
        });

        // Extra CT checkbox toggle
        document.querySelectorAll('.chk-extra-ct').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const cIdx = parseInt(e.target.dataset.cindex);
                const hasExtra = e.target.checked;
                appState.courses[cIdx].has_extra_assignment = hasExtra;
                if (hasExtra && appState.courses[cIdx].cts.length === 4) {
                    appState.courses[cIdx].cts.push({ name: 'CT 5 / Assignment', obtained: null, max: 20 });
                } else if (!hasExtra && appState.courses[cIdx].cts.length > 4) {
                    appState.courses[cIdx].cts.pop();
                }
                saveState();
                renderTheoryCourses();
            });
        });

        // Attendance mode toggle
        document.querySelectorAll('.btn-attn-mode').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cIdx = parseInt(e.target.dataset.cindex);
                const mode = e.target.dataset.mode;
                appState.courses[cIdx].attendance_mode = mode;
                saveState();
                renderTheoryCourses();
            });
        });

        // Attendance slider
        document.querySelectorAll('.attn-pct-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const cIdx = parseInt(e.target.dataset.cindex);
                appState.courses[cIdx].attendance_pct = parseFloat(e.target.value);
                saveState();
                renderTheoryCourses();
            });
        });

        // Attendance direct input
        document.querySelectorAll('.attn-direct-input').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const cIdx = parseInt(e.target.dataset.cindex);
                appState.courses[cIdx].attendance_direct = parseFloat(e.target.value || 0);
                saveState();
                renderTheoryCourses();
            });
        });
    }

    /* -------------------------------------------------------------
     * 2. SESSIONAL COURSES ENGINE
     * ------------------------------------------------------------- */
    function renderSessionalCourses() {
        const container = document.getElementById('sessionalCoursesContainer');
        if (!container) return;

        const sessionalCourses = appState.courses.filter(c => c.course_type === 'sessional');
        container.innerHTML = '';

        sessionalCourses.forEach(course => {
            const courseIdx = appState.courses.indexOf(course);
            const card = document.createElement('div');
            card.className = 'card glass course-card';
            card.dataset.index = courseIdx;

            const mode = course.mode || 'predict'; // 'predict' or 'calc'
            const evaluations = course.evaluations || [];

            // Calculate total weightage
            const totalWeight = evaluations.reduce((sum, ev) => sum + parseFloat(ev.weight || 0), 0);
            const isWeightValid = Math.abs(totalWeight - 100.0) < 0.01;

            // Compute current completed score
            let weightedSum = 0;
            evaluations.forEach(ev => {
                if (ev.obtained !== null && ev.obtained !== undefined) {
                    const obt = parseFloat(ev.obtained);
                    const mx = parseFloat(ev.max || 100);
                    if (mx > 0) {
                        weightedSum += (obt / mx) * parseFloat(ev.weight || 0);
                    }
                }
            });

            // Target evaluation for prediction
            const targetEv = evaluations.find(ev => ev.is_target) || evaluations[evaluations.length - 1];
            const targetGrade = course.target_grade || 'A+';
            const gradeItem = appState.gradeScale.find(g => g.letter === targetGrade) || appState.gradeScale[0];
            
            // Prediction math
            let predictionHtml = '';
            if (targetEv && mode === 'predict') {
                const targetPctNeeded = gradeItem.min_pct;
                let accumPct = 0;
                evaluations.forEach(ev => {
                    if (ev !== targetEv && ev.obtained !== null && ev.obtained !== undefined) {
                        const obt = parseFloat(ev.obtained);
                        const mx = parseFloat(ev.max || 100);
                        if (mx > 0) accumPct += (obt / mx) * parseFloat(ev.weight || 0);
                    }
                });

                const targetWeight = parseFloat(targetEv.weight || 0);
                const targetMax = parseFloat(targetEv.max || 100);
                const neededPts = targetPctNeeded - accumPct;
                const neededItemPct = targetWeight > 0 ? (neededPts / targetWeight) * 100.0 : 0;
                let neededScore = (neededItemPct / 100.0) * targetMax;

                let predStatus = 'Achievable';
                let statusBadgeClass = 'badge-success';
                if (neededScore > targetMax) {
                    predStatus = 'Unreachable ⚠️';
                    statusBadgeClass = 'badge-danger';
                } else if (neededScore <= 0) {
                    predStatus = 'Secured 🎉';
                    neededScore = 0;
                    statusBadgeClass = 'badge-success';
                }

                predictionHtml = `
                    <div class="summary-strip primary-glow" style="margin-top: 14px;">
                        <span>To get <strong>${targetGrade} (${gradeItem.min_pct}%)</strong>, score needed in <strong>${targetEv.name}</strong>:</span>
                        <span class="badge ${statusBadgeClass}" style="font-size: 0.9rem;">
                            ${predStatus === 'Secured 🎉' ? 'Secured 🎉' : neededScore.toFixed(1) + ' / ' + targetMax + ' (' + neededItemPct.toFixed(1) + '%)'}
                        </span>
                    </div>
                `;
            }

            // Calc grade math
            let calcGradeHtml = '';
            if (mode === 'calc') {
                const incompleteCount = evaluations.filter(ev => ev.obtained === null || ev.obtained === undefined || ev.obtained === '').length;
                const canCalculateFinal = isWeightValid && incompleteCount === 0;
                const letter = canCalculateFinal ? getGradeFromPct(weightedSum) : null;
                calcGradeHtml = `
                    <div class="summary-strip" style="margin-top: 14px; background: rgba(16, 185, 129, 0.15);">
                        <span>${canCalculateFinal ? 'Final Calculated Score & Grade:' : `Enter ${incompleteCount} remaining score${incompleteCount === 1 ? '' : 's'} and make weights total 100% to calculate a final grade.`}</span>
                        <span class="highlight-val" style="color: var(--secondary); font-size: 1.1rem;">
                            ${canCalculateFinal ? `${weightedSum.toFixed(1)}% &bull; Grade: ${letter}` : `Recorded so far: ${weightedSum.toFixed(1)} / 100`}
                        </span>
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="course-card-header">
                    <div class="course-title-group">
                        <span class="course-code-tag" style="background: var(--secondary-gradient);">${course.code}</span>
                        <h3>${course.title}</h3>
                    </div>
                    <div class="course-sub-info">
                        Credits: <strong>${course.credits}</strong> &bull; Total Weightage: 
                        <strong class="${isWeightValid ? 'text-accent' : 'text-danger'}">${totalWeight.toFixed(0)}%</strong>
                    </div>
                </div>

                <div class="sessional-mode-toggle">
                    <button class="btn btn-sm ${mode === 'predict' ? 'btn-primary' : 'btn-outline'} btn-sess-mode" data-cindex="${courseIdx}" data-mode="predict">
                        <i data-lucide="target"></i> Target Grade Predictor
                    </button>
                    <button class="btn btn-sm ${mode === 'calc' ? 'btn-primary' : 'btn-outline'} btn-sess-mode" data-cindex="${courseIdx}" data-mode="calc">
                        <i data-lucide="calculator"></i> Final Grade Calculator
                    </button>
                </div>

                ${!isWeightValid ? `
                    <div class="eval-weight-warning">
                        <i data-lucide="alert-triangle"></i> Total weightage is ${totalWeight.toFixed(0)}% (Should sum to 100%). Please adjust sliders below!
                    </div>
                ` : ''}

                ${mode === 'predict' ? `
                    <div class="form-group" style="margin: 12px 0;">
                        <label>Select Target Grade to Solve For:</label>
                        <select class="form-control sel-target-grade" data-cindex="${courseIdx}" style="max-width: 200px;">
                            ${appState.gradeScale.filter(g => g.letter !== 'F').map(g => `
                                <option value="${g.letter}" ${targetGrade === g.letter ? 'selected' : ''}>${g.letter} (${g.min_pct}%)</option>
                            `).join('')}
                        </select>
                    </div>
                ` : ''}

                <div class="table-responsive" style="margin-top: 10px;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Component Name</th>
                                <th>Weightage (%)</th>
                                <th>Score Obtained</th>
                                <th>Max Score</th>
                                ${mode === 'predict' ? '<th>Target Component</th>' : ''}
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${evaluations.map((ev, evIdx) => `
                                <tr>
                                    <td><strong>${ev.name}</strong></td>
                                    <td style="width: 180px;">
                                        <input type="number" class="form-control ev-weight-input" data-cindex="${courseIdx}" data-evindex="${evIdx}" value="${ev.weight}" min="1" max="100">
                                    </td>
                                    <td>
                                        <input type="number" class="form-control ev-score-input" data-cindex="${courseIdx}" data-evindex="${evIdx}" value="${ev.obtained !== null && ev.obtained !== undefined ? ev.obtained : ''}" placeholder="${ev.is_target && mode === 'predict' ? 'Predicting...' : 'Score'}">
                                    </td>
                                    <td>${ev.max}</td>
                                    ${mode === 'predict' ? `
                                        <td>
                                            <input type="radio" name="target_ev_${courseIdx}" class="radio-target-ev" data-cindex="${courseIdx}" data-evindex="${evIdx}" ${ev.is_target ? 'checked' : ''}>
                                        </td>
                                    ` : ''}
                                    <td>
                                        <button class="btn btn-sm btn-outline text-danger btn-delete-ev" data-cindex="${courseIdx}" data-evindex="${evIdx}">
                                            <i data-lucide="trash-2"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <div style="margin-top: 12px; display: flex; justify-content: space-between;">
                    <button class="btn btn-sm btn-secondary btn-add-eval" data-cindex="${courseIdx}">
                        <i data-lucide="plus"></i> Add Component
                    </button>
                </div>

                ${predictionHtml}
                ${calcGradeHtml}
            `;

            container.appendChild(card);
        });

        if (window.lucide) lucide.createIcons();
        attachSessionalEvents();
    }

    function getGradeFromPct(pct) {
        for (let item of appState.gradeScale) {
            if (pct >= item.min_pct - 1e-9) return item.letter;
        }
        return 'F';
    }

    function attachSessionalEvents() {
        // Mode toggle
        document.querySelectorAll('.btn-sess-mode').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cIdx = parseInt(e.currentTarget.dataset.cindex);
                appState.courses[cIdx].mode = e.currentTarget.dataset.mode;
                saveState();
                renderSessionalCourses();
            });
        });

        // Target Grade Select
        document.querySelectorAll('.sel-target-grade').forEach(sel => {
            sel.addEventListener('change', (e) => {
                const cIdx = parseInt(e.target.dataset.cindex);
                appState.courses[cIdx].target_grade = e.target.value;
                saveState();
                renderSessionalCourses();
            });
        });

        // Weightage input
        document.querySelectorAll('.ev-weight-input').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const cIdx = parseInt(e.target.dataset.cindex);
                const evIdx = parseInt(e.target.dataset.evindex);
                appState.courses[cIdx].evaluations[evIdx].weight = parseFloat(e.target.value || 0);
                saveState();
                renderSessionalCourses();
            });
        });

        // Score input
        document.querySelectorAll('.ev-score-input').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const cIdx = parseInt(e.target.dataset.cindex);
                const evIdx = parseInt(e.target.dataset.evindex);
                const val = e.target.value !== '' ? parseFloat(e.target.value) : null;
                appState.courses[cIdx].evaluations[evIdx].obtained = val;
                saveState();
                renderSessionalCourses();
            });
        });

        // Radio target component
        document.querySelectorAll('.radio-target-ev').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const cIdx = parseInt(e.target.dataset.cindex);
                const evIdx = parseInt(e.target.dataset.evindex);
                appState.courses[cIdx].evaluations.forEach((ev, i) => {
                    ev.is_target = (i === evIdx);
                });
                saveState();
                renderSessionalCourses();
            });
        });

        // Delete component
        document.querySelectorAll('.btn-delete-ev').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cIdx = parseInt(e.currentTarget.dataset.cindex);
                const evIdx = parseInt(e.currentTarget.dataset.evindex);
                appState.courses[cIdx].evaluations.splice(evIdx, 1);
                saveState();
                renderSessionalCourses();
            });
        });

        // Add component modal trigger
        document.querySelectorAll('.btn-add-eval').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cIdx = parseInt(e.currentTarget.dataset.cindex);
                document.getElementById('modalCourseIndex').value = cIdx;
                document.getElementById('modalEvalName').value = '';
                document.getElementById('modalEvalWeight').value = '15';
                document.getElementById('modalEvalMax').value = '50';
                openModal('addEvaluationModal');
            });
        });
    }

    /* -------------------------------------------------------------
     * 3. DASHBOARD RENDERER & CHARTS
     * ------------------------------------------------------------- */
    function renderDashboard() {
        const tbody = document.getElementById('dashCourseTableBody');
        if (!tbody) return;

        let totalCredits = 0;
        let sessionalCredits = 0;
        let sessionalWeightedPoints = 0;
        let tfNeededSum = 0;
        let theoryCount = 0;

        const theoryLabels = [];
        const theoryScores = [];
        const tfReqLabels = [];
        const tfReqPcts = [];

        tbody.innerHTML = '';

        appState.courses.forEach(course => {
            totalCredits += parseFloat(course.credits || 0);

            if (course.course_type === 'theory') {
                theoryCount++;
                const normCts = (course.cts || []).map(ct => {
                    const obt = parseFloat(ct.obtained || 0);
                    const mx = parseFloat(ct.max || 20);
                    return mx > 0 ? (obt / mx) * 20.0 : 0;
                }).sort((a, b) => b - a).slice(0, 3);
                const ctTotal = normCts.reduce((a, b) => a + b, 0);

                let attnMarks = 0;
                if (course.attendance_mode === 'direct') {
                    attnMarks = parseFloat(course.attendance_direct || 0);
                } else {
                    attnMarks = getAttendanceMarksFromPct(parseFloat(course.attendance_pct || 0));
                }

                const secured90 = ctTotal + attnMarks;
                const reqs = calculateTfRequirements(secured90);
                const reqA = reqs.find(r => r.letter === 'A+') || reqs[0];

                tfNeededSum += reqA.neededInTf;
                theoryLabels.push(course.code);
                theoryScores.push(secured90);
                tfReqLabels.push(course.code);
                tfReqPcts.push(reqA.neededTfPct);

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${course.code}</strong></td>
                    <td>${course.title}</td>
                    <td><span class="badge badge-info">Theory</span></td>
                    <td>${course.credits}</td>
                    <td><strong>${secured90.toFixed(1)}</strong> / 90</td>
                    <td><strong class="text-warning">${reqA.neededInTf.toFixed(1)}</strong> / 210 (${reqA.neededTfPct.toFixed(1)}%)</td>
                    <td><span class="badge ${reqA.status === 'secured' ? 'badge-success' : 'badge-warning'}">${reqA.status === 'secured' ? 'A+ Secured' : 'Predicting TF'}</span></td>
                `;
                tbody.appendChild(tr);

            } else {
                sessionalCredits += parseFloat(course.credits || 0);
                let wSum = 0;
                (course.evaluations || []).forEach(ev => {
                    if (ev.obtained !== null && ev.obtained !== undefined) {
                        const mx = parseFloat(ev.max || 100);
                        if (mx > 0) wSum += (parseFloat(ev.obtained) / mx) * parseFloat(ev.weight || 0);
                    }
                });

                const letter = getGradeFromPct(wSum);
                const gpaObj = appState.gradeScale.find(g => g.letter === letter) || { gpa: 0 };
                sessionalWeightedPoints += (gpaObj.gpa * parseFloat(course.credits || 0));

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${course.code}</strong></td>
                    <td>${course.title}</td>
                    <td><span class="badge badge-success">Sessional</span></td>
                    <td>${course.credits}</td>
                    <td><strong>${wSum.toFixed(1)}%</strong></td>
                    <td>N/A (Sessional)</td>
                    <td><span class="badge badge-success">${letter} (${gpaObj.gpa.toFixed(2)})</span></td>
                `;
                tbody.appendChild(tr);
            }
        });

        // Summary Stats
        document.getElementById('dashTotalCredits').innerText = totalCredits.toFixed(1);
        const sessGpa = sessionalCredits > 0 ? (sessionalWeightedPoints / sessionalCredits) : 0;
        document.getElementById('dashSessionalGpa').innerText = sessGpa > 0 ? sessGpa.toFixed(2) : '--';
        const avgTf = theoryCount > 0 ? (tfNeededSum / theoryCount) : 0;
        const avgTfPct = (avgTf / 210.0) * 100.0;
        document.getElementById('dashAvgTfForA').innerText = avgTfPct > 0 ? avgTfPct.toFixed(1) + '%' : '--';

        // Render Charts
        renderCharts(theoryLabels, theoryScores, tfReqLabels, tfReqPcts);
    }

    function renderCharts(tLabels, tScores, tfLabels, tfPcts) {
        const ctxRadar = document.getElementById('chartTheoryPreparedness');
        const ctxBar = document.getElementById('chartTfRequirements');

        if (ctxRadar) {
            if (chartTheoryRadar) chartTheoryRadar.destroy();
            chartTheoryRadar = new Chart(ctxRadar, {
                type: 'radar',
                data: {
                    labels: tLabels,
                    datasets: [{
                        label: 'Pre-TF Score (out of 90)',
                        data: tScores,
                        backgroundColor: 'rgba(99, 102, 241, 0.25)',
                        borderColor: '#6366f1',
                        borderWidth: 2,
                        pointBackgroundColor: '#8b5cf6'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        r: {
                            angleLines: { color: 'rgba(255,255,255,0.1)' },
                            grid: { color: 'rgba(255,255,255,0.1)' },
                            pointLabels: { color: '#9ca3af', font: { family: 'Plus Jakarta Sans', size: 11 } },
                            ticks: { color: '#6b7280', backdropColor: 'transparent' },
                            suggestedMin: 0,
                            suggestedMax: 90
                        }
                    },
                    plugins: {
                        legend: { labels: { color: '#f3f4f6' } }
                    }
                }
            });
        }

        if (ctxBar) {
            if (chartTfBar) chartTfBar.destroy();
            chartTfBar = new Chart(ctxBar, {
                type: 'bar',
                data: {
                    labels: tfLabels,
                    datasets: [{
                        label: 'Required Term Final % (For A+)',
                        data: tfPcts,
                        backgroundColor: 'rgba(245, 158, 11, 0.7)',
                        borderColor: '#f59e0b',
                        borderWidth: 1,
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { grid: { display: false }, ticks: { color: '#9ca3af' } },
                        y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' }, suggestedMax: 100 }
                    },
                    plugins: {
                        legend: { labels: { color: '#f3f4f6' } }
                    }
                }
            });
        }
    }

    /* -------------------------------------------------------------
     * 4. TARGET GPA SIMULATOR
     * ------------------------------------------------------------- */
    function renderSimulator() {
        const slider = document.getElementById('simGpaSlider');
        if (!slider) return;

        const targetGpa = parseFloat(slider.value);
        document.getElementById('simGpaVal').innerText = targetGpa.toFixed(2);
        document.getElementById('dashTargetGpa').innerText = targetGpa.toFixed(2);

        // Simulation Math
        let totalCredits = 0;
        let sessionalCredits = 0;
        let sessionalPoints = 0;
        let theoryCredits = 0;

        appState.courses.forEach(c => {
            const cr = parseFloat(c.credits || 0);
            totalCredits += cr;
            if (c.course_type === 'sessional') {
                sessionalCredits += cr;
                let wSum = 0;
                (c.evaluations || []).forEach(ev => {
                    if (ev.obtained !== null) {
                        const mx = parseFloat(ev.max || 100);
                        if (mx > 0) wSum += (parseFloat(ev.obtained) / mx) * parseFloat(ev.weight || 0);
                    }
                });
                const letter = getGradeFromPct(wSum);
                const gpaObj = appState.gradeScale.find(g => g.letter === letter) || { gpa: 0 };
                sessionalPoints += (gpaObj.gpa * cr);
            } else {
                theoryCredits += cr;
            }
        });

        const targetTotalPoints = targetGpa * totalCredits;
        const neededTheoryPoints = targetTotalPoints - sessionalPoints;
        const reqAvgTheoryGpa = theoryCredits > 0 ? (neededTheoryPoints / theoryCredits) : 0;

        // Map required GPA to target percentage (approx)
        let reqTheoryPct = 80.0;
        if (reqAvgTheoryGpa >= 4.0) reqTheoryPct = 80.0;
        else if (reqAvgTheoryGpa >= 3.75) reqTheoryPct = 75.0 + (reqAvgTheoryGpa - 3.75) / 0.25 * 5.0;
        else if (reqAvgTheoryGpa >= 3.50) reqTheoryPct = 70.0 + (reqAvgTheoryGpa - 3.50) / 0.25 * 5.0;
        else reqTheoryPct = 60.0;

        // Compute average TF score out of 210 needed
        const theoryCourses = appState.courses.filter(c => c.course_type === 'theory');
        let currentPreTfSum = 0;
        theoryCourses.forEach(c => {
            const normCts = (c.cts || []).map(ct => {
                const obt = parseFloat(ct.obtained || 0);
                const mx = parseFloat(ct.max || 20);
                return mx > 0 ? (obt / mx) * 20.0 : 0;
            }).sort((a, b) => b - a).slice(0, 3);
            const ctTotal = normCts.reduce((a, b) => a + b, 0);

            let attnMarks = 0;
            if (c.attendance_mode === 'direct') {
                attnMarks = parseFloat(c.attendance_direct || 0);
            } else {
                attnMarks = getAttendanceMarksFromPct(parseFloat(c.attendance_pct || 0));
            }
            currentPreTfSum += (ctTotal + attnMarks);
        });

        const avgPreTf = theoryCourses.length > 0 ? (currentPreTfSum / theoryCourses.length) : 0;
        const targetTheoryMarks300 = (reqTheoryPct / 100.0) * 300.0;
        let reqTfScore = targetTheoryMarks300 - avgPreTf;
        let reqTfPct = (reqTfScore / 210.0) * 100.0;

        document.getElementById('simReqTheoryPct').innerText = reqTheoryPct.toFixed(1) + '%';
        document.getElementById('simReqTfScore').innerText = Math.max(0, reqTfScore).toFixed(1) + ' / 210';
        document.getElementById('simReqTfPctText').innerText = Math.max(0, reqTfPct).toFixed(1) + '% average in Term Finals';

        const feasBadge = document.getElementById('simFeasibilityBadge');
        if (reqTfScore > 210) {
            feasBadge.innerText = 'Unreachable ⚠️';
            feasBadge.className = 'sim-badge badge badge-danger';
        } else if (reqTfScore <= 0) {
            feasBadge.innerText = 'Secured 🎉';
            feasBadge.className = 'sim-badge badge badge-success';
        } else {
            feasBadge.innerText = 'Achievable 💪';
            feasBadge.className = 'sim-badge badge badge-success';
        }

        // Table population
        const tbody = document.getElementById('simCourseTableBody');
        if (tbody) {
            tbody.innerHTML = '';
            theoryCourses.forEach(c => {
                const normCts = (c.cts || []).map(ct => {
                    const obt = parseFloat(ct.obtained || 0);
                    const mx = parseFloat(ct.max || 20);
                    return mx > 0 ? (obt / mx) * 20.0 : 0;
                }).sort((a, b) => b - a).slice(0, 3);
                const ctTotal = normCts.reduce((a, b) => a + b, 0);

                let attnMarks = 0;
                if (c.attendance_mode === 'direct') {
                    attnMarks = parseFloat(c.attendance_direct || 0);
                } else {
                    attnMarks = getAttendanceMarksFromPct(parseFloat(c.attendance_pct || 0));
                }
                const preTf = ctTotal + attnMarks;
                const neededForTarget = Math.max(0, targetTheoryMarks300 - preTf);
                const neededPct = (neededForTarget / 210.0) * 100.0;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${c.code}</strong> - ${c.title}</td>
                    <td>${c.credits}</td>
                    <td>${preTf.toFixed(1)} / 90</td>
                    <td>Target % (${reqTheoryPct.toFixed(0)}%)</td>
                    <td><strong class="text-warning">${neededForTarget.toFixed(1)}</strong> / 210</td>
                    <td>${neededPct.toFixed(1)}%</td>
                `;
                tbody.appendChild(tr);
            });
        }
    }

    /* -------------------------------------------------------------
     * 5. GLOBAL EVENT LISTENERS & MODALS
     * ------------------------------------------------------------- */
    function setupGlobalEvents() {
        const slider = document.getElementById('simGpaSlider');
        if (slider) {
            slider.addEventListener('input', () => {
                appState.targetGpa = parseFloat(slider.value);
                saveState();
                renderSimulator();
            });
        }

        const btnRefresh = document.getElementById('btnRefreshDashboard');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', renderDashboard);
        }

        // Export JSON
        document.getElementById('btnExport')?.addEventListener('click', () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `smart_grade_l2t2_export.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        });

        // Import JSON
        const fileImport = document.getElementById('fileImport');
        document.getElementById('btnImport')?.addEventListener('click', () => {
            fileImport?.click();
        });

        fileImport?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const imported = JSON.parse(event.target.result);
                    if (imported.courses) {
                        appState = imported;
                        saveState();
                        initApp();
                        alert('Data imported successfully!');
                    }
                } catch (err) {
                    alert('Invalid JSON file format.');
                }
            };
            reader.readAsText(file);
        });

        // Reset Defaults
        document.getElementById('btnReset')?.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset all courses and evaluations to default BUET L2T2 presets?')) {
                localStorage.removeItem('smart_grade_l2t2_state');
                fetchPresets();
            }
        });

        // Add Evaluation Modal confirm
        document.getElementById('btnConfirmAddEval')?.addEventListener('click', () => {
            const cIdx = parseInt(document.getElementById('modalCourseIndex').value);
            const name = document.getElementById('modalEvalName').value.trim() || 'Custom Evaluation';
            const weight = parseFloat(document.getElementById('modalEvalWeight').value || 15);
            const max = parseFloat(document.getElementById('modalEvalMax').value || 50);

            if (cIdx >= 0 && appState.courses[cIdx]) {
                appState.courses[cIdx].evaluations.push({
                    name: name,
                    weight: weight,
                    obtained: null,
                    max: max,
                    is_target: false
                });
                saveState();
                renderSessionalCourses();
                closeModal('addEvaluationModal');
            }
        });
    }

    // Modal Helpers
    window.openModal = function(modalId) {
        document.getElementById(modalId)?.classList.add('active');
    };
    window.closeModal = function(modalId) {
        document.getElementById(modalId)?.classList.remove('active');
    };
});
