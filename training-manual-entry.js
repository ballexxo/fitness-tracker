import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const manualPlanName = document.getElementById('manualPlanName');
const manualTrainingDate = document.getElementById('manualTrainingDate');
const manualDurationMinutes = document.getElementById('manualDurationMinutes');
const manualSessionStatus = document.getElementById('manualSessionStatus');
const manualExerciseList = document.getElementById('manualExerciseList');
const saveManualTrainingBtn = document.getElementById('saveManualTrainingBtn');

const manualSummaryModal = document.getElementById('manualSummaryModal');
const manualSummaryContent = document.getElementById('manualSummaryContent');
const manualSummaryOkBtn = document.getElementById('manualSummaryOkBtn');

const plannedTrainingWarningModal = document.getElementById('plannedTrainingWarningModal');
const plannedTrainingWarningText = document.getElementById('plannedTrainingWarningText');
const cancelPlannedTrainingBtn = document.getElementById('cancelPlannedTrainingBtn');
const continuePlannedTrainingBtn = document.getElementById('continuePlannedTrainingBtn');

let currentUser = null;
let currentPlanId = null;
let currentPlanName = '';
let manualSession = null;

function setStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status ${type}`.trim();
  element.classList.toggle('hidden', !message);
}

function getPlanIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('planId');
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatSeconds(totalSeconds) {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

async function guardPage() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.user) {
    window.location.href = './index.html';
    return null;
  }

  currentUser = data.session.user;
  return currentUser;
}

function openModal(modal) {
  if (!modal) return;
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

async function checkPlannedTrainingConflict(planId) {
  const today = getLocalDateString();

  const { data, error } = await supabase
    .from('planned_workouts')
    .select('id, plan_id, plan_name, planned_date, status')
    .eq('user_id', currentUser.id)
    .eq('planned_date', today)
    .eq('status', 'planned')
    .maybeSingle();

  if (error) {
    console.error('Fehler beim Prüfen des geplanten Trainings:', error);
    return true;
  }

  if (!data) return true;
  if (data.plan_id === planId) return true;

  plannedTrainingWarningText.textContent =
    `Heute ist ${data.plan_name} geplant. Plane dein Training um, da sonst deine Live Streak kaputt geht.`;

  openModal(plannedTrainingWarningModal);

  return false;
}

async function fetchLastExerciseData(exerciseName) {
  const { data: sessions, error: sessionsError } = await supabase
    .from('workout_sessions')
    .select('id, training_date, finished_at, created_at')
    .eq('user_id', currentUser.id)
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false });

  if (sessionsError || !sessions || sessions.length === 0) {
    return null;
  }

  for (const session of sessions) {
    const { data: exerciseRows, error: exerciseError } = await supabase
      .from('workout_session_exercises')
      .select('id, exercise_name')
      .eq('session_id', session.id)
      .eq('exercise_name', exerciseName)
      .limit(1);

    if (exerciseError || !exerciseRows || exerciseRows.length === 0) continue;

    const exerciseRow = exerciseRows[0];

    const { data: setRows, error: setError } = await supabase
      .from('workout_session_sets')
      .select('set_number, reps_done, weight_used')
      .eq('session_exercise_id', exerciseRow.id)
      .order('set_number', { ascending: true });

    if (setError) return null;

    return {
      date: session.training_date,
      sets: setRows || [],
    };
  }

  return null;
}

function getPerformanceBadgeMeta(lastData, repsMax) {
  if (!lastData || !lastData.sets || lastData.sets.length === 0) {
    return { label: 'Keine Historie', className: 'training-badge-neutral' };
  }

  const allReachedMax = lastData.sets.every((setItem) => Number(setItem.reps_done) >= Number(repsMax));

  if (allReachedMax) {
    return { label: 'Gewicht erhöhen möglich', className: 'training-badge-up' };
  }

  return { label: 'Gewicht beibehalten', className: 'training-badge-keep' };
}

function applySuggestedWeightsFromHistory(exercise, lastData, badgeMeta) {
  if (!exercise || !lastData || !lastData.sets || !badgeMeta) return;

  const shouldPrefillWeights = badgeMeta.className === 'training-badge-keep';

  if (!shouldPrefillWeights) return;

  for (let index = 0; index < exercise.sets.length; index++) {
    const currentSet = exercise.sets[index];
    const lastSet = lastData.sets[index];

    if (!currentSet || !lastSet) continue;

    const isWeightEmpty =
      currentSet.weight_used === null ||
      currentSet.weight_used === undefined ||
      currentSet.weight_used === '';

    if (isWeightEmpty && lastSet.weight_used !== null && lastSet.weight_used !== undefined) {
      currentSet.weight_used = Number(lastSet.weight_used);
    }
  }
}

function renderLastTrainingMatrix(lastData, plannedSets) {
  const setCount = Math.max(plannedSets, lastData?.sets?.length || 0);

  if (!lastData || !lastData.sets || lastData.sets.length === 0) {
    return `
      <div class="training-last-empty">
        Noch keine Daten aus dem letzten Training vorhanden.
      </div>
    `;
  }

  const headers = Array.from({ length: setCount }, (_, index) => `
    <div class="training-last-col-head">${index + 1}. Satz</div>
  `).join('');

  const repsRow = Array.from({ length: setCount }, (_, index) => {
    const setItem = lastData.sets[index];
    return `<div class="training-last-value">${setItem?.reps_done ?? '-'}</div>`;
  }).join('');

  const weightRow = Array.from({ length: setCount }, (_, index) => {
    const setItem = lastData.sets[index];
    return `<div class="training-last-value">${setItem?.weight_used ?? '-'}</div>`;
  }).join('');

  return `
    <div class="training-last-grid training-last-grid-head" style="--training-set-count:${setCount};">
      <div></div>
      ${headers}
    </div>

    <div class="training-last-grid" style="--training-set-count:${setCount};">
      <div class="training-last-row-label">Wdh.</div>
      ${repsRow}
    </div>

    <div class="training-last-grid" style="--training-set-count:${setCount};">
      <div class="training-last-row-label">Gewicht</div>
      ${weightRow}
    </div>
  `;
}

function renderSetInputMatrix(exercise, exerciseIndex) {
  const headers = Array.from({ length: exercise.sets_planned }, (_, setIndex) => `
    <div class="training-set-col-head">${setIndex + 1}. Satz</div>
  `).join('');

  const repsInputs = exercise.sets.map((setData, setIndex) => `
    <input
      class="training-set-input"
      type="number"
      min="0"
      inputmode="numeric"
      data-exercise-index="${exerciseIndex}"
      data-set-index="${setIndex}"
      data-field="reps"
      value="${setData.reps_done ?? ''}"
      placeholder="-"
    >
  `).join('');

  const weightInputs = exercise.sets.map((setData, setIndex) => `
    <input
      class="training-set-input"
      type="number"
      min="0"
      step="0.5"
      inputmode="decimal"
      data-exercise-index="${exerciseIndex}"
      data-set-index="${setIndex}"
      data-field="weight"
      value="${setData.weight_used ?? ''}"
      placeholder="-"
    >
  `).join('');

  return `
    <div class="training-set-grid training-set-grid-head" style="--training-set-count:${exercise.sets_planned};">
      <div></div>
      ${headers}
    </div>

    <div class="training-set-grid" style="--training-set-count:${exercise.sets_planned};">
      <div class="training-set-row-label">Wdh.</div>
      ${repsInputs}
    </div>

    <div class="training-set-grid" style="--training-set-count:${exercise.sets_planned};">
      <div class="training-set-row-label">Gewicht</div>
      ${weightInputs}
    </div>
  `;
}

function renderSummarySetMatrix(sets) {
  const setCount = Math.max(sets.length, 1);

  const headers = Array.from({ length: setCount }, (_, index) => `
    <div class="training-last-col-head">${index + 1}. Satz</div>
  `).join('');

  const repsRow = Array.from({ length: setCount }, (_, index) => {
    const setItem = sets[index];
    return `<div class="training-last-value">${setItem?.reps_done ?? '-'}</div>`;
  }).join('');

  const weightRow = Array.from({ length: setCount }, (_, index) => {
    const setItem = sets[index];
    return `<div class="training-last-value">${setItem?.weight_used ?? '-'}</div>`;
  }).join('');

  return `
    <div class="training-last-grid training-last-grid-head" style="--training-set-count:${setCount};">
      <div></div>
      ${headers}
    </div>

    <div class="training-last-grid" style="--training-set-count:${setCount};">
      <div class="training-last-row-label">Wdh.</div>
      ${repsRow}
    </div>

    <div class="training-last-grid" style="--training-set-count:${setCount};">
      <div class="training-last-row-label">Gewicht</div>
      ${weightRow}
    </div>
  `;
}

function getImprovementSummaryBadge(improvement) {
  if (!improvement || !improvement.text) {
    return '<span class="training-badge training-badge-neutral">Keine Vergleichsdaten</span>';
  }

  if (improvement.className === 'improvement-positive') {
    return '<span class="training-badge training-badge-up">Steigerung</span>';
  }

  if (improvement.className === 'improvement-negative') {
    return '<span class="training-badge training-badge-reduced">Reduziert</span>';
  }

  if (improvement.className === 'improvement-neutral') {
    return '<span class="training-badge training-badge-neutral">Gleich geblieben</span>';
  }

  return '<span class="training-badge training-badge-neutral">Keine Vergleichsdaten</span>';
}

function getImprovementSummaryLine(improvement) {
  if (!improvement || !improvement.text) {
    return `
      <span class="training-summary-improvement-prefix">Vergleich zum letzten Training</span>
      <span class="training-summary-arrow">→</span>
      <span class="training-summary-improvement-neutral">Keine Vergleichsdaten</span>
    `;
  }

  let emphasizedText = 'Keine Vergleichsdaten';
  let emphasizedClass = 'training-summary-improvement-neutral';

  if (improvement.className === 'improvement-positive') {
    const clean = improvement.text.replace('Steigerung zum letzten Training: ', '');
    emphasizedText = clean;
    emphasizedClass = 'training-summary-improvement-positive';
  } else if (improvement.className === 'improvement-negative') {
    const clean = improvement.text.replace('Steigerung zum letzten Training: ', '');
    emphasizedText = clean;
    emphasizedClass = 'training-summary-improvement-negative';
  } else if (improvement.className === 'improvement-neutral') {
    const clean = improvement.text.replace('Steigerung zum letzten Training: ', '');
    emphasizedText = clean;
    emphasizedClass = 'training-summary-improvement-neutral';
  }

  return `
    <span class="training-summary-improvement-prefix">Vergleich zum letzten Training</span>
    <span class="training-summary-arrow">→</span>
    <span class="${emphasizedClass}">${emphasizedText}</span>
  `;
}

function calculateExerciseVolume(exercise) {
  return exercise.sets.reduce((sum, setItem) => {
    const reps = Number(setItem.reps_done || 0);
    const weight = Number(setItem.weight_used || 0);
    return sum + reps * weight;
  }, 0);
}

async function calculateExerciseImprovement(exercise, excludeSessionId = null) {
  const { data: sessions, error: sessionsError } = await supabase
    .from('workout_sessions')
    .select('id, training_date, finished_at')
    .eq('user_id', currentUser.id)
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false });

  if (sessionsError || !sessions || sessions.length === 0) {
    return {
      text: 'Steigerung zum letzten Training: keine Vergleichsdaten',
      className: '',
    };
  }

  let lastData = null;

  for (const session of sessions) {
    if (excludeSessionId && session.id === excludeSessionId) continue;

    const { data: exerciseRows, error: exerciseError } = await supabase
      .from('workout_session_exercises')
      .select('id, exercise_name')
      .eq('session_id', session.id)
      .eq('exercise_name', exercise.exercise_name)
      .limit(1);

    if (exerciseError || !exerciseRows || exerciseRows.length === 0) continue;

    const exerciseRow = exerciseRows[0];

    const { data: setRows, error: setError } = await supabase
      .from('workout_session_sets')
      .select('set_number, reps_done, weight_used')
      .eq('session_exercise_id', exerciseRow.id)
      .order('set_number', { ascending: true });

    if (setError) break;

    lastData = {
      date: session.training_date,
      sets: setRows || [],
    };
    break;
  }

  if (!lastData || !lastData.sets || lastData.sets.length === 0) {
    return {
      text: 'Steigerung zum letzten Training: keine Vergleichsdaten',
      className: '',
    };
  }

  const currentVolume = calculateExerciseVolume(exercise);

  const lastVolume = lastData.sets.reduce((sum, setItem) => {
    const reps = Number(setItem.reps_done || 0);
    const weight = Number(setItem.weight_used || 0);
    return sum + reps * weight;
  }, 0);

  const currentAvgWeight =
    exercise.sets.reduce((sum, setItem) => sum + Number(setItem.weight_used || 0), 0) /
    Math.max(exercise.sets.length, 1);

  const lastAvgWeight =
    lastData.sets.reduce((sum, setItem) => sum + Number(setItem.weight_used || 0), 0) /
    Math.max(lastData.sets.length, 1);

  if (currentAvgWeight > lastAvgWeight) {
    return {
      text: 'Steigerung zum letzten Training: Gewicht erhöht',
      className: 'improvement-positive',
    };
  }

  if (currentAvgWeight < lastAvgWeight) {
    return {
      text: 'Steigerung zum letzten Training: Gewicht reduziert',
      className: 'improvement-negative',
    };
  }

  if (lastVolume === 0) {
    return {
      text: 'Steigerung zum letzten Training: keine Vergleichsdaten',
      className: '',
    };
  }

  const percent = ((currentVolume - lastVolume) / lastVolume) * 100;
  const rounded = Math.round(percent * 10) / 10;

  if (rounded > 0) {
    return {
      text: `Steigerung zum letzten Training: +${rounded}%`,
      className: 'improvement-positive',
    };
  }

  if (rounded < 0) {
    return {
      text: `Steigerung zum letzten Training: ${rounded}%`,
      className: 'improvement-negative',
    };
  }

  return {
    text: 'Steigerung zum letzten Training: gleich geblieben',
    className: 'improvement-neutral',
  };
}

async function fetchProfileWeight() {
  const { data, error } = await supabase
    .from('user_profile_data')
    .select('current_weight_kg')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (error || !data?.current_weight_kg) {
    return null;
  }

  return Number(data.current_weight_kg);
}

function estimateCalories(durationSeconds, bodyWeightKg) {
  const durationHours = durationSeconds / 3600;
  const met = 6;
  return Math.round(met * bodyWeightKg * durationHours);
}

async function markPlannedWorkoutAsCompleted(sessionRow, selectedDate) {
  const today = getLocalDateString();

  if (selectedDate !== today) return;

  const { data: plannedWorkout, error: plannedError } = await supabase
    .from('planned_workouts')
    .select('id, plan_id, planned_date, status')
    .eq('user_id', currentUser.id)
    .eq('planned_date', selectedDate)
    .eq('plan_id', manualSession.plan_id)
    .eq('status', 'planned')
    .maybeSingle();

  if (plannedError) {
    console.error('Fehler beim Suchen des geplanten Trainings:', plannedError);
    return;
  }

  if (!plannedWorkout) return;

  const { error: updateError } = await supabase
    .from('planned_workouts')
    .update({
      status: 'completed',
      completed_session_id: sessionRow.id,
    })
    .eq('id', plannedWorkout.id);

  if (updateError) {
    console.error('Fehler beim Aktualisieren des geplanten Trainings:', updateError);
  }
}

async function renderManualExercises() {
  const htmlParts = [];

  for (let exerciseIndex = 0; exerciseIndex < manualSession.exercises.length; exerciseIndex++) {
    const exercise = manualSession.exercises[exerciseIndex];
    const lastData = await fetchLastExerciseData(exercise.exercise_name);
    const badge = getPerformanceBadgeMeta(lastData, exercise.reps_max);

    applySuggestedWeightsFromHistory(exercise, lastData, badge);

    htmlParts.push(`
      <article class="training-exercise-card" style="--training-set-count:${exercise.sets_planned};">
        <div class="training-exercise-head">
          <div>
            <div class="training-exercise-title">${exerciseIndex + 1}. ${exercise.exercise_name}</div>
            <div class="training-exercise-meta">${exercise.sets_planned} Sätze · ${exercise.reps_min}-${exercise.reps_max} Wdh.</div>
          </div>
        </div>

        <div class="training-last-card">
          <div class="training-last-head">
            <div class="training-section-title">Letztes Training</div>
            <span class="training-badge ${badge.className}">${badge.label}</span>
          </div>

          ${renderLastTrainingMatrix(lastData, exercise.sets_planned)}
        </div>

        <div class="training-input-card">
          ${renderSetInputMatrix(exercise, exerciseIndex)}
        </div>
      </article>
    `);
  }

  manualExerciseList.innerHTML = htmlParts.join('');

  manualExerciseList.querySelectorAll('input[data-exercise-index]').forEach((input) => {
    input.addEventListener('input', () => {
      const exerciseIndex = Number(input.dataset.exerciseIndex);
      const setIndex = Number(input.dataset.setIndex);
      const field = input.dataset.field;
      const rawValue = input.value;

      if (field === 'reps') {
        manualSession.exercises[exerciseIndex].sets[setIndex].reps_done = rawValue === '' ? null : Number(rawValue);
      }

      if (field === 'weight') {
        manualSession.exercises[exerciseIndex].sets[setIndex].weight_used = rawValue === '' ? null : Number(rawValue);
      }
    });
  });
}

async function loadPlan() {
  if (!currentUser) await guardPage();

  currentPlanId = getPlanIdFromUrl();
  if (!currentPlanId) {
    window.location.replace('./training-start-list.html');
    return;
  }

  manualTrainingDate.value = getLocalDateString();

  const { data: planData, error: planError } = await supabase
    .from('training_plans')
    .select('id, name')
    .eq('id', currentPlanId)
    .single();

  if (planError || !planData) {
    setStatus(manualSessionStatus, 'Trainingsplan konnte nicht geladen werden.', 'error');
    return;
  }

  currentPlanName = planData.name;
  manualPlanName.textContent = currentPlanName;

  const { data: exerciseData, error: exerciseError } = await supabase
    .from('training_plan_exercises')
    .select('id, exercise_order, name, sets, reps_min, reps_max, rest_seconds')
    .eq('plan_id', currentPlanId)
    .order('exercise_order', { ascending: true });

  if (exerciseError || !exerciseData || exerciseData.length === 0) {
    setStatus(manualSessionStatus, 'Für diesen Trainingsplan sind keine Übungen vorhanden.', 'error');
    return;
  }

  manualSession = {
    plan_id: currentPlanId,
    plan_name: currentPlanName,
    exercises: exerciseData.map((exercise) => ({
      plan_exercise_id: exercise.id,
      exercise_name: exercise.name,
      sets_planned: exercise.sets,
      reps_min: exercise.reps_min,
      reps_max: exercise.reps_max,
      rest_seconds: exercise.rest_seconds,
      sets: Array.from({ length: exercise.sets }, (_, index) => ({
        set_number: index + 1,
        reps_done: null,
        weight_used: null,
      })),
    })),
  };

  await renderManualExercises();
}

saveManualTrainingBtn.addEventListener('click', async () => {
  setStatus(manualSessionStatus, '');

  if (!manualTrainingDate.value) {
    setStatus(manualSessionStatus, 'Bitte wähle ein Datum aus.', 'error');
    return;
  }

  const durationMinutes = Number(manualDurationMinutes.value);
  if (!durationMinutes || durationMinutes <= 0) {
    setStatus(manualSessionStatus, 'Bitte gib eine gültige Dauer in Minuten ein.', 'error');
    return;
  }

  saveManualTrainingBtn.disabled = true;
  saveManualTrainingBtn.textContent = 'Wird gespeichert...';

  try {
    const durationSeconds = durationMinutes * 60;
    const selectedDate = manualTrainingDate.value;

    const startedAt = new Date(`${selectedDate}T12:00:00`);
    const finishedAt = new Date(startedAt.getTime() + durationSeconds * 1000);

    const bodyWeightKg = await fetchProfileWeight();
    const estimatedCalories = bodyWeightKg ? estimateCalories(durationSeconds, bodyWeightKg) : null;

    const { data: sessionRow, error: sessionError } = await supabase
      .from('workout_sessions')
      .insert({
        user_id: currentUser.id,
        plan_id: manualSession.plan_id,
        plan_name: manualSession.plan_name,
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_seconds: durationSeconds,
        training_date: selectedDate,
        calories_burned: estimatedCalories,
      })
      .select()
      .single();

    if (sessionError) {
      console.error(sessionError);
      setStatus(manualSessionStatus, 'Training konnte nicht gespeichert werden.', 'error');
      return;
    }

    await markPlannedWorkoutAsCompleted(sessionRow, selectedDate);

    for (let exerciseIndex = 0; exerciseIndex < manualSession.exercises.length; exerciseIndex++) {
      const exercise = manualSession.exercises[exerciseIndex];

      const { data: sessionExerciseRow, error: sessionExerciseError } = await supabase
        .from('workout_session_exercises')
        .insert({
          session_id: sessionRow.id,
          plan_exercise_id: exercise.plan_exercise_id,
          exercise_order: exerciseIndex,
          exercise_name: exercise.exercise_name,
          sets_planned: exercise.sets_planned,
          reps_min: exercise.reps_min,
          reps_max: exercise.reps_max,
        })
        .select()
        .single();

      if (sessionExerciseError) {
        console.error(sessionExerciseError);
        setStatus(manualSessionStatus, 'Übungen konnten nicht gespeichert werden.', 'error');
        return;
      }

      const setRows = exercise.sets.map((setItem) => ({
        session_exercise_id: sessionExerciseRow.id,
        set_number: setItem.set_number,
        reps_done: setItem.reps_done,
        weight_used: setItem.weight_used,
      }));

      const { error: setInsertError } = await supabase
        .from('workout_session_sets')
        .insert(setRows);

      if (setInsertError) {
        console.error(setInsertError);
        setStatus(manualSessionStatus, 'Satzdaten konnten nicht gespeichert werden.', 'error');
        return;
      }
    }

    const summaryParts = [];

    summaryParts.push(`
      <div class="training-summary-top">
        <div class="training-summary-top-row training-summary-top-row-left">
          <span class="training-summary-top-label">Trainingsdauer:</span>
          <span class="training-summary-top-value">${formatSeconds(durationSeconds)}</span>
        </div>

        <div class="training-summary-top-row training-summary-top-row-left">
          <span class="training-summary-top-label">Ca. verbrannte kcal:</span>
          <span class="training-summary-top-value">
            ${estimatedCalories !== null ? `${estimatedCalories} kcal` : '-'}
          </span>
        </div>
      </div>
    `);

    for (const exercise of manualSession.exercises) {
      const improvement = await calculateExerciseImprovement(exercise, sessionRow.id);

      summaryParts.push(`
        <div class="training-summary-exercise-card">
          <div class="training-summary-exercise-head">
            <div class="training-summary-exercise-title">${exercise.exercise_name}</div>
            ${getImprovementSummaryBadge(improvement)}
          </div>

          <div class="training-summary-improvement-text">
            ${getImprovementSummaryLine(improvement)}
          </div>

          <div class="training-summary-matrix">
            ${renderSummarySetMatrix(exercise.sets)}
          </div>
        </div>
      `);
    }

    manualSummaryContent.innerHTML = summaryParts.join('');
    openModal(manualSummaryModal);
  } catch (error) {
    console.error(error);
    setStatus(manualSessionStatus, 'Beim Speichern ist ein Fehler aufgetreten.', 'error');
  } finally {
    saveManualTrainingBtn.disabled = false;
    saveManualTrainingBtn.textContent = 'Training speichern';
  }
});

manualSummaryModal.addEventListener('click', (event) => {
  if (event.target === manualSummaryModal) {
    closeModal(manualSummaryModal);
  }
});

plannedTrainingWarningModal.addEventListener('click', (event) => {
  if (event.target === plannedTrainingWarningModal) {
    closeModal(plannedTrainingWarningModal);
  }
});

manualSummaryOkBtn.addEventListener('click', () => {
  closeModal(manualSummaryModal);
  window.location.replace('./training.html');
});

continuePlannedTrainingBtn.addEventListener('click', async () => {
  closeModal(plannedTrainingWarningModal);
  await loadPlan();
});

cancelPlannedTrainingBtn.addEventListener('click', () => {
  plannedTrainingWarningModal.classList.add('hidden');
  document.body.style.overflow = '';
  window.location.replace('./training-start-list.html');
});

async function initManualEntry() {
  await guardPage();

  currentPlanId = getPlanIdFromUrl();
  if (!currentPlanId) {
    window.location.replace('./training-start-list.html');
    return;
  }

  const canProceed = await checkPlannedTrainingConflict(currentPlanId);

  if (canProceed) {
    await loadPlan();
  }
}

initManualEntry();