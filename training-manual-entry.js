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

    if (exerciseError || !exerciseRows || exerciseRows.length === 0) {
      continue;
    }

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
    manualSession.exercises
      .find((item) => item.exercise_name === exercise.exercise_name)
      .sets.reduce((sum, setItem) => sum + Number(setItem.weight_used || 0), 0) /
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
  const sign = rounded > 0 ? '+' : '';

  return {
    text: `Steigerung zum letzten Training: ${sign}${rounded}%`,
    className: rounded >= 0 ? 'improvement-positive' : 'improvement-negative',
  };
}

async function fetchProfileWeight() {
  const { data, error } = await supabase
    .from('profiles')
    .select('body_weight_kg')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (error || !data?.body_weight_kg) return null;
  return Number(data.body_weight_kg);
}

function estimateCalories(durationSeconds, bodyWeightKg) {
  const durationHours = durationSeconds / 3600;
  const met = 6;
  return Math.round(met * bodyWeightKg * durationHours);
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

async function renderManualExercises() {
  const htmlParts = [];

  for (let exerciseIndex = 0; exerciseIndex < manualSession.exercises.length; exerciseIndex++) {
    const exercise = manualSession.exercises[exerciseIndex];
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
  await guardPage();

  currentPlanId = getPlanIdFromUrl();
  if (!currentPlanId) {
    window.location.href = './training-start-list.html';
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  manualTrainingDate.value = today;

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

    for (const exercise of manualSession.exercises) {
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

    manualSummaryContent.innerHTML = summaryParts.join('');
    manualSummaryModal.classList.remove('hidden');
  } catch (error) {
    console.error(error);
    setStatus(manualSessionStatus, 'Beim Speichern ist ein Fehler aufgetreten.', 'error');
  } finally {
    saveManualTrainingBtn.disabled = false;
    saveManualTrainingBtn.textContent = 'Training speichern';
  }
});

manualSummaryOkBtn.addEventListener('click', () => {
  manualSummaryModal.classList.add('hidden');
  window.location.href = './training.html';
});

loadPlan();