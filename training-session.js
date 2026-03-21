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

let currentUser = null;
let currentPlanId = null;
let currentPlanName = '';
let draftSession = null;
let draftStorageKey = null;
let timerInterval = null;
let startedAt = null;

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function setStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status ${type}`.trim();
  element.classList.toggle('hidden', !message);
}

function getPlanIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('planId');
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

async function guardPage() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.user) {
    window.location.href = './index.html';
    return null;
  }

  currentUser = data.session.user;
  return currentUser;
}

// ------------------------------------------------------------
// Letztes Training pro Übung holen
// WICHTIG: immer die zuletzt abgeschlossene Einheit nehmen
// ------------------------------------------------------------
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
    // Aktuelle soeben gespeicherte Session überspringen
    if (excludeSessionId && session.id === excludeSessionId) {
      continue;
    }

    const { data: exerciseRows, error: exerciseError } = await supabase
      .from('workout_session_exercises')
      .select('id, exercise_name')
      .eq('session_id', session.id)
      .eq('exercise_name', exerciseName)
      .limit(1);

    if (exerciseError || !exerciseRows || exerciseRows.length === 0) {
      continue;
    }

    const exerciseRow = exerciseRows[0];

    const { data: setRows, error: setError } = await supabase
      .from('workout_session_sets')
      .select('set_number, reps_done, weight_used')
      .eq('session_exercise_id', exerciseRow.id)
      .order('set_number', { ascending: true });

    if (setError) {
      return null;
    }

    return {
      date: session.training_date,
      finishedAt: session.finished_at,
      sets: setRows || [],
    };
  }

  return null;
}

function getPerformanceBadge(lastData, repsMax) {
  if (!lastData || !lastData.sets || lastData.sets.length === 0) {
    return '<span class="performance-badge performance-neutral">Keine Historie</span>';
  }

  const allReachedMax = lastData.sets.every((setItem) => Number(setItem.reps_done) >= Number(repsMax));

  if (allReachedMax) {
    return '<span class="performance-badge performance-good">Gewicht erhöhen möglich</span>';
  }

  return '<span class="performance-badge performance-neutral">Gewicht beibehalten</span>';
}

function getCompactLastTrainingLine(lastData) {
  return lastData.sets
    .map((setItem) => `${setItem.reps_done ?? '-'} Wdh · ${setItem.weight_used ?? '-'} kg`)
    .join(' | ');
}

function calculateExerciseVolume(exercise) {
  return exercise.sets.reduce((sum, setItem) => {
    const reps = Number(setItem.reps_done || 0);
    const weight = Number(setItem.weight_used || 0);
    return sum + reps * weight;
  }, 0);
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

// ------------------------------------------------------------
// Übungen rendern
// ------------------------------------------------------------
async function renderSessionExercises() {
  const htmlParts = [];

  for (let exerciseIndex = 0; exerciseIndex < draftSession.exercises.length; exerciseIndex++) {
    const exercise = draftSession.exercises[exerciseIndex];
    const lastData = await fetchLastExerciseData(exercise.exercise_name);

    let lastTrainingHtml = '';
    if (!lastData) {
      lastTrainingHtml = `<div class="muted" style="margin-top:10px;">Noch keine Datensätze aus dem letzten Training vorhanden.</div>`;
    } else {
      lastTrainingHtml = `
  <div class="last-training-box">
    <div class="muted">Letztes Training</div>
    <div style="margin-top:8px;">${getCompactLastTrainingLine(lastData)}</div>
    <div style="margin-top:10px;">
      ${getPerformanceBadge(lastData, exercise.reps_max)}
    </div>
  </div>
`;
    }

    let setsHtml = '';
    for (let setIndex = 0; setIndex < exercise.sets_planned; setIndex++) {
      const setData = exercise.sets[setIndex];

      setsHtml += `
        <div class="set-row">
          <div class="set-row-title">Satz ${setIndex + 1}</div>
          <div class="two-col-grid">
            <label>
              Wiederholungen
              <input
                type="number"
                min="0"
                data-exercise-index="${exerciseIndex}"
                data-set-index="${setIndex}"
                data-field="reps"
                value="${setData.reps_done ?? ''}"
              >
            </label>
            <label>
              Gewicht (kg)
              <input
                type="number"
                min="0"
                step="0.5"
                data-exercise-index="${exerciseIndex}"
                data-set-index="${setIndex}"
                data-field="weight"
                value="${setData.weight_used ?? ''}"
              >
            </label>
          </div>
        </div>
      `;
    }

    htmlParts.push(`
      <div class="exercise-item training-live-card">
        <div style="width:100%;">
          <strong>${exerciseIndex + 1}. ${exercise.exercise_name}</strong><br>
          <span class="muted">${exercise.sets_planned} Sätze · ${exercise.reps_min}-${exercise.reps_max} Wdh.</span>
          ${lastTrainingHtml}
          <div style="margin-top:14px;">
            ${setsHtml}
          </div>
        </div>
      </div>
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
}

// ------------------------------------------------------------
// Plan / Draft laden
// ------------------------------------------------------------
async function loadPlanAndCreateDraft() {
  await guardPage();

  currentPlanId = getPlanIdFromUrl();
  if (!currentPlanId) {
    window.location.href = './training-start-list.html';
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

async function fetchProfileWeight() {
  const { data, error } = await supabase
    .from('profiles')
    .select('body_weight_kg')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (error || !data?.body_weight_kg) {
    return null;
  }

  return Number(data.body_weight_kg);
}

function estimateCalories(durationSeconds, bodyWeightKg) {
  const durationHours = durationSeconds / 3600;
  const met = 6;
  return Math.round(met * bodyWeightKg * durationHours);
}

// ------------------------------------------------------------
// Training beenden
// ------------------------------------------------------------
async function finishTraining() {
  setStatus(sessionStatus, '');

  if (!draftSession || !draftSession.exercises || draftSession.exercises.length === 0) {
    setStatus(sessionStatus, 'Es gibt kein aktives Training.', 'error');
    return;
  }

  finishTrainingBtn.disabled = true;
  finishTrainingBtn.textContent = 'Wird gespeichert...';

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
    training_date: finishedAt.toISOString().slice(0, 10),
    calories_burned: estimatedCalories,
  })
  .select()
  .single();

    if (sessionError) {
      console.error(sessionError);
      setStatus(sessionStatus, 'Training konnte nicht gespeichert werden.', 'error');
      return;
    }

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
      <div class="summary-block">
        <strong>Trainingsdauer:</strong> ${formatSeconds(durationSeconds)}
      </div>
    `);

    summaryParts.push(`
      <div class="summary-block" style="margin-top:10px;">
        ${
          estimatedCalories
            ? `<strong>Ca. verbrannte kcal:</strong> ${estimatedCalories} kcal`
            : `Es fehlt dein Gewicht bei Persönliche Daten, um den Kalorienverbrauch zu berechnen.`
        }
      </div>
    `);

    for (const exercise of draftSession.exercises) {
  const improvement = await calculateExerciseImprovement(exercise, sessionRow.id);

  let improvementHtml = improvement.text;
  if (improvement.className) {
    improvementHtml = `Steigerung zum letzten Training: <span class="${improvement.className}">${improvement.text.replace('Steigerung zum letzten Training: ', '')}</span>`;
  }

  summaryParts.push(`
    <div class="summary-exercise-box">
      <strong>${exercise.exercise_name}</strong><br>
      <div style="margin-top:6px;">${improvementHtml}</div>
      <div class="muted" style="margin-top:8px;">
        ${exercise.sets.map((setItem) => `${setItem.reps_done ?? '-'} Wdh · ${setItem.weight_used ?? '-'} kg`).join(' | ')}
      </div>
    </div>
  `);
}

    sessionSummaryContent.innerHTML = summaryParts.join('');
    sessionSummaryModal.classList.remove('hidden');

    clearDraftLocally();
    if (timerInterval) clearInterval(timerInterval);
  } catch (error) {
    console.error(error);
    setStatus(sessionStatus, 'Beim Beenden des Trainings ist ein Fehler aufgetreten.', 'error');
  } finally {
    finishTrainingBtn.disabled = false;
    finishTrainingBtn.textContent = 'Training Beenden';
  }
}

finishTrainingBtn.addEventListener('click', finishTraining);

sessionSummaryOkBtn.addEventListener('click', () => {
  sessionSummaryModal.classList.add('hidden');
  window.location.replace('./training.html');
});

loadPlanAndCreateDraft();