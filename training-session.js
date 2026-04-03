import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const sessionPlanName = document.getElementById('sessionPlanName');
const sessionTimer = document.getElementById('sessionTimer');
const sessionStatus = document.getElementById('sessionStatus');
const sessionExerciseList = document.getElementById('sessionExerciseList');
const finishTrainingBtn = document.getElementById('finishTrainingBtn');

const sessionSummaryModal = document.getElementById('sessionSummaryModal');
const sessionSummaryContent = document.getElementById('sessionSummaryContent');
const sessionSummaryOkBtn = document.getElementById('sessionSummaryOkBtn');

const plannedTrainingWarningModal = document.getElementById('plannedTrainingWarningModal');
const plannedTrainingWarningText = document.getElementById('plannedTrainingWarningText');
const cancelPlannedTrainingBtn = document.getElementById('cancelPlannedTrainingBtn');
const continuePlannedTrainingBtn = document.getElementById('continuePlannedTrainingBtn');

/* neues Leave-Modal */
const leaveTrainingModal = document.getElementById('leaveTrainingModal');
const resumeTrainingBtn = document.getElementById('resumeTrainingBtn');
const backgroundTrainingBtn = document.getElementById('backgroundTrainingBtn');
const leaveAndFinishTrainingBtn = document.getElementById('leaveAndFinishTrainingBtn');

/* Back-Button aus dem Header */
const backButton = document.querySelector('.app-back-button');

let currentUser = null;
let currentPlanId = null;
let currentPlanName = '';
let draftSession = null;
let draftStorageKey = null;
let timerInterval = null;
let startedAt = null;

/* ------------------------------------------------------------ */
/* Helpers */
/* ------------------------------------------------------------ */
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

function getDraftStorageKey(userId, planId) {
  return `training-draft-${userId}-${planId}`;
}

function saveDraftLocally() {
  if (!draftStorageKey || !draftSession) return;
  localStorage.setItem(draftStorageKey, JSON.stringify(draftSession));
}

function loadDraftLocally() {
  if (!draftStorageKey) return null;
  const raw = localStorage.getItem(draftStorageKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearDraftLocally() {
  if (!draftStorageKey) return;
  localStorage.removeItem(draftStorageKey);
}

function startTimer(startTimestamp) {
  startedAt = new Date(startTimestamp);

  if (timerInterval) clearInterval(timerInterval);

  const update = () => {
    const diff = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
    sessionTimer.textContent = formatSeconds(diff);
  };

  update();
  timerInterval = setInterval(update, 1000);
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

function closeLeaveModal() {
  if (!leaveTrainingModal) return;
  leaveTrainingModal.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

function openLeaveModal() {
  if (!leaveTrainingModal) return;
  leaveTrainingModal.classList.remove('hidden');
  document.body.classList.add('modal-open');
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

/* ------------------------------------------------------------ */
/* Planung / Konflikt prüfen */
/* ------------------------------------------------------------ */
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

async function markPlannedWorkoutAsCompleted(sessionRow) {
  const today = getLocalDateString();

  const { data: plannedWorkout, error: plannedError } = await supabase
    .from('planned_workouts')
    .select('id, plan_id, planned_date, status')
    .eq('user_id', currentUser.id)
    .eq('planned_date', today)
    .eq('plan_id', draftSession.plan_id)
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

/* ------------------------------------------------------------ */
/* Letzte Übungsdaten holen */
/* ------------------------------------------------------------ */
async function fetchLastExerciseData(exerciseName, excludeSessionId = null) {
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
    if (excludeSessionId && session.id === excludeSessionId) continue;

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
      finishedAt: session.finished_at,
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
  }

  return `
    <span class="training-summary-improvement-prefix">Vergleich zum letzten Training</span>
    <span class="training-summary-arrow">→</span>
    <span class="${emphasizedClass}">${emphasizedText}</span>
  `;
}

async function calculateExerciseImprovement(exercise, excludeSessionId = null) {
  const lastData = await fetchLastExerciseData(exercise.exercise_name, excludeSessionId);

  if (!lastData || !lastData.sets || lastData.sets.length === 0) {
    return {
      type: 'none',
      text: 'Steigerung zum letzten Training: keine Vergleichsdaten',
      className: '',
    };
  }

  const currentVolume = exercise.sets.reduce((sum, setItem) => {
    const reps = Number(setItem.reps_done || 0);
    const weight = Number(setItem.weight_used || 0);
    return sum + reps * weight;
  }, 0);

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
      type: 'weight-up',
      text: 'Steigerung zum letzten Training: Gewicht erhöht',
      className: 'improvement-positive',
    };
  }

  if (currentAvgWeight < lastAvgWeight) {
    return {
      type: 'weight-down',
      text: 'Steigerung zum letzten Training: Gewicht reduziert',
      className: 'improvement-negative',
    };
  }

  if (lastVolume === 0) {
    return {
      type: 'none',
      text: 'Steigerung zum letzten Training: keine Vergleichsdaten',
      className: '',
    };
  }

  const percent = ((currentVolume - lastVolume) / lastVolume) * 100;
  const rounded = Math.round(percent * 10) / 10;
  const sign = rounded > 0 ? '+' : '';

  return {
    type: 'percent',
    text: `Steigerung zum letzten Training: ${sign}${rounded}%`,
    className: rounded >= 0 ? 'improvement-positive' : 'improvement-negative',
  };
}

/* ------------------------------------------------------------ */
/* Übungen rendern */
/* ------------------------------------------------------------ */
async function renderSessionExercises() {
  const htmlParts = [];

  for (let exerciseIndex = 0; exerciseIndex < draftSession.exercises.length; exerciseIndex++) {
    const exercise = draftSession.exercises[exerciseIndex];
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

  sessionExerciseList.innerHTML = htmlParts.join('');

  sessionExerciseList.querySelectorAll('input[data-exercise-index]').forEach((input) => {
    input.addEventListener('input', () => {
      const exerciseIndex = Number(input.dataset.exerciseIndex);
      const setIndex = Number(input.dataset.setIndex);
      const field = input.dataset.field;
      const rawValue = input.value;

      if (field === 'reps') {
        draftSession.exercises[exerciseIndex].sets[setIndex].reps_done = rawValue === '' ? null : Number(rawValue);
      }

      if (field === 'weight') {
        draftSession.exercises[exerciseIndex].sets[setIndex].weight_used = rawValue === '' ? null : Number(rawValue);
      }

      saveDraftLocally();
    });
  });

  saveDraftLocally();
}

/* ------------------------------------------------------------ */
/* Gewicht / kcal */
/* ------------------------------------------------------------ */
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

/* ------------------------------------------------------------ */
/* Plan laden + Draft */
/* ------------------------------------------------------------ */
async function loadPlanAndCreateDraft() {
  if (!currentUser) await guardPage();
  if (!currentPlanId) currentPlanId = getPlanIdFromUrl();

  if (!currentPlanId) {
    window.location.replace('./training-start-list.html');
    return;
  }

  draftStorageKey = getDraftStorageKey(currentUser.id, currentPlanId);

  const savedDraft = loadDraftLocally();
  if (savedDraft) {
    draftSession = savedDraft;
    currentPlanName = savedDraft.plan_name;
    sessionPlanName.textContent = currentPlanName;
    startTimer(savedDraft.started_at);
    await renderSessionExercises();
    return;
  }

  const { data: planData, error: planError } = await supabase
    .from('training_plans')
    .select('id, name, user_id')
    .eq('id', currentPlanId)
    .single();

  if (planError || !planData) {
    setStatus(sessionStatus, 'Trainingsplan konnte nicht geladen werden.', 'error');
    return;
  }

  currentPlanName = planData.name;
  sessionPlanName.textContent = currentPlanName;

  const { data: exerciseData, error: exerciseError } = await supabase
    .from('training_plan_exercises')
    .select('id, exercise_order, name, sets, reps_min, reps_max, rest_seconds')
    .eq('plan_id', currentPlanId)
    .order('exercise_order', { ascending: true });

  if (exerciseError || !exerciseData || exerciseData.length === 0) {
    setStatus(sessionStatus, 'Für diesen Trainingsplan sind keine Übungen vorhanden.', 'error');
    return;
  }

  draftSession = {
    plan_id: currentPlanId,
    plan_name: currentPlanName,
    started_at: new Date().toISOString(),
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

  saveDraftLocally();
  startTimer(draftSession.started_at);
  await renderSessionExercises();
}

/* ------------------------------------------------------------ */
/* Training beenden */
/* ------------------------------------------------------------ */
async function finishTraining() {
  setStatus(sessionStatus, '');

  if (!draftSession || !draftSession.exercises || draftSession.exercises.length === 0) {
    setStatus(sessionStatus, 'Es gibt kein aktives Training.', 'error');
    return;
  }

  finishTrainingBtn.disabled = true;
  finishTrainingBtn.textContent = 'Wird gespeichert...';

  if (leaveAndFinishTrainingBtn) {
    leaveAndFinishTrainingBtn.disabled = true;
    leaveAndFinishTrainingBtn.textContent = 'Wird gespeichert...';
  }

  try {
    const finishedAt = new Date();
    const started = new Date(draftSession.started_at);
    const durationSeconds = Math.max(0, Math.floor((finishedAt.getTime() - started.getTime()) / 1000));

    const bodyWeightKg = await fetchProfileWeight();
    const estimatedCalories = bodyWeightKg ? estimateCalories(durationSeconds, bodyWeightKg) : null;

    const { data: sessionRow, error: sessionError } = await supabase
      .from('workout_sessions')
      .insert({
        user_id: currentUser.id,
        plan_id: draftSession.plan_id,
        plan_name: draftSession.plan_name,
        started_at: draftSession.started_at,
        finished_at: finishedAt.toISOString(),
        duration_seconds: durationSeconds,
        training_date: getLocalDateString(finishedAt),
        calories_burned: estimatedCalories,
      })
      .select()
      .single();

    if (sessionError) {
      console.error(sessionError);
      setStatus(sessionStatus, 'Training konnte nicht gespeichert werden.', 'error');
      return;
    }

    await markPlannedWorkoutAsCompleted(sessionRow);

    for (let exerciseIndex = 0; exerciseIndex < draftSession.exercises.length; exerciseIndex++) {
      const exercise = draftSession.exercises[exerciseIndex];

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
        setStatus(sessionStatus, 'Übungen konnten nicht gespeichert werden.', 'error');
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
        setStatus(sessionStatus, 'Satzdaten konnten nicht gespeichert werden.', 'error');
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

    for (const exercise of draftSession.exercises) {
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

    sessionSummaryContent.innerHTML = summaryParts.join('');
    closeLeaveModal();
    openModal(sessionSummaryModal);

    clearDraftLocally();
    if (timerInterval) clearInterval(timerInterval);
  } catch (error) {
    console.error(error);
    setStatus(sessionStatus, 'Beim Beenden des Trainings ist ein Fehler aufgetreten.', 'error');
  } finally {
    finishTrainingBtn.disabled = false;
    finishTrainingBtn.textContent = 'Training beenden';

    if (leaveAndFinishTrainingBtn) {
      leaveAndFinishTrainingBtn.disabled = false;
      leaveAndFinishTrainingBtn.textContent = 'Beenden & speichern';
    }
  }
}

sessionSummaryModal.addEventListener('click', (event) => {
  if (event.target === sessionSummaryModal) {
    closeModal(sessionSummaryModal);
  }
});

plannedTrainingWarningModal.addEventListener('click', (event) => {
  if (event.target === plannedTrainingWarningModal) {
    closeModal(plannedTrainingWarningModal);
  }
});

leaveTrainingModal.addEventListener('click', (event) => {
  if (event.target === leaveTrainingModal) {
    closeLeaveModal();
  }
});

finishTrainingBtn.addEventListener('click', finishTraining);

sessionSummaryOkBtn.addEventListener('click', () => {
  openModal(sessionSummaryModal);
  window.location.replace('./training.html');
});

continuePlannedTrainingBtn.addEventListener('click', async () => {
  closeModal(plannedTrainingWarningModal);
  await loadPlanAndCreateDraft();
});

cancelPlannedTrainingBtn.addEventListener('click', () => {
  plannedTrainingWarningModal.classList.add('hidden');
  document.body.style.overflow = '';
  window.location.replace('./training-start-list.html');
});

/* ------------------------------------------------------------ */
/* Neues Leave-Modal */
/* ------------------------------------------------------------ */
if (backButton) {
  backButton.addEventListener('click', (event) => {
    event.preventDefault();
    openLeaveModal();
  });
}

if (resumeTrainingBtn) {
  resumeTrainingBtn.addEventListener('click', () => {
    closeLeaveModal();
  });
}

if (backgroundTrainingBtn) {
  backgroundTrainingBtn.addEventListener('click', () => {
    closeLeaveModal();
    window.location.href = './training.html';
  });
}

if (leaveAndFinishTrainingBtn) {
  leaveAndFinishTrainingBtn.addEventListener('click', async () => {
    await finishTraining();
  });
}

/* ------------------------------------------------------------ */
/* Init */
/* ------------------------------------------------------------ */
async function initTrainingSession() {
  await guardPage();

  currentPlanId = getPlanIdFromUrl();
  if (!currentPlanId) {
    window.location.replace('./training-start-list.html');
    return;
  }

  const canProceed = await checkPlannedTrainingConflict(currentPlanId);

  if (canProceed) {
    await loadPlanAndCreateDraft();
  }
}

initTrainingSession();