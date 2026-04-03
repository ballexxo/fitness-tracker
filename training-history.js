import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const prevWeekBtn = document.getElementById('prevWeekBtn');
const nextWeekBtn = document.getElementById('nextWeekBtn');
const historyRangeText = document.getElementById('historyRangeText');
const historyStatus = document.getElementById('historyStatus');
const historyList = document.getElementById('historyList');

const viewHistoryModal = document.getElementById('viewHistoryModal');
const viewHistoryContent = document.getElementById('viewHistoryContent');
const closeViewHistoryBtn = document.getElementById('closeViewHistoryBtn');

const editHistoryModal = document.getElementById('editHistoryModal');
const editHistoryContent = document.getElementById('editHistoryContent');
const editHistoryStatus = document.getElementById('editHistoryStatus');
const cancelEditHistoryBtn = document.getElementById('cancelEditHistoryBtn');
const saveEditHistoryBtn = document.getElementById('saveEditHistoryBtn');

let currentUser = null;
let currentWeekOffset = 0;
let currentSessions = [];
let currentEditSession = null;

/* ------------------------------------------------------------ */
/* Helpers */
/* ------------------------------------------------------------ */
function setStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status ${type}`.trim();
  element.classList.toggle('hidden', !message);
}

function setModalState(modal, isOpen) {
  modal.classList.toggle('hidden', !isOpen);
  document.body.style.overflow = isOpen ? 'hidden' : '';
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

function formatSeconds(totalSeconds) {
  if (!totalSeconds && totalSeconds !== 0) return '-';

  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const weekday = date.toLocaleDateString('de-DE', { weekday: 'long' });
  const fullDate = date.toLocaleDateString('de-DE');
  return `${weekday}, ${fullDate}`;
}

function getWeekBounds(offset = 0) {
  const now = new Date();
  const currentDay = now.getDay();
  const mondayDistance = currentDay === 0 ? 6 : currentDay - 1;

  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - mondayDistance + offset * 7);

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { monday, sunday };
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function getDisplayRangeText(monday, sunday) {
  const start = monday.toLocaleDateString('de-DE');
  const end = sunday.toLocaleDateString('de-DE');
  return `${start} - ${end}`;
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
    emphasizedText = improvement.text.replace('Steigerung zum letzten Training: ', '');
    emphasizedClass = 'training-summary-improvement-positive';
  } else if (improvement.className === 'improvement-negative') {
    emphasizedText = improvement.text.replace('Steigerung zum letzten Training: ', '');
    emphasizedClass = 'training-summary-improvement-negative';
  }

  return `
    <span class="training-summary-improvement-prefix">Vergleich zum letzten Training</span>
    <span class="training-summary-arrow">→</span>
    <span class="${emphasizedClass}">${emphasizedText}</span>
  `;
}

function renderEditSetMatrix(exercise, exerciseIndex) {
  const setCount = exercise.sets.length;

  const headers = Array.from({ length: setCount }, (_, setIndex) => `
    <div class="training-set-col-head">${setIndex + 1}. Satz</div>
  `).join('');

  const repsInputs = exercise.sets.map((setItem, setIndex) => `
    <input
      class="training-set-input"
      type="number"
      min="0"
      inputmode="numeric"
      data-exercise-index="${exerciseIndex}"
      data-set-index="${setIndex}"
      data-field="reps"
      value="${setItem.reps_done ?? ''}"
      placeholder="-"
    >
  `).join('');

  const weightInputs = exercise.sets.map((setItem, setIndex) => `
    <input
      class="training-set-input"
      type="number"
      min="0"
      step="0.5"
      inputmode="decimal"
      data-exercise-index="${exerciseIndex}"
      data-set-index="${setIndex}"
      data-field="weight"
      value="${setItem.weight_used ?? ''}"
      placeholder="-"
    >
  `).join('');

  return `
    <div class="training-input-card history-edit-input-card">
      <div class="training-set-grid training-set-grid-head" style="--training-set-count:${setCount};">
        <div></div>
        ${headers}
      </div>

      <div class="training-set-grid" style="--training-set-count:${setCount};">
        <div class="training-set-row-label">Wdh.</div>
        ${repsInputs}
      </div>

      <div class="training-set-grid" style="--training-set-count:${setCount};">
        <div class="training-set-row-label">Gewicht</div>
        ${weightInputs}
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------ */
/* Session Details laden */
/* ------------------------------------------------------------ */
async function loadSessionDetails(sessionId) {
  const { data: session, error: sessionError } = await supabase
    .from('workout_sessions')
    .select('id, plan_name, training_date, duration_seconds, calories_burned')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) return null;

  const { data: exercises, error: exerciseError } = await supabase
    .from('workout_session_exercises')
    .select('id, exercise_order, exercise_name, sets_planned, reps_min, reps_max')
    .eq('session_id', sessionId)
    .order('exercise_order', { ascending: true });

  if (exerciseError) return null;

  const enrichedExercises = [];

  for (const exercise of exercises || []) {
    const { data: sets, error: setsError } = await supabase
      .from('workout_session_sets')
      .select('id, set_number, reps_done, weight_used')
      .eq('session_exercise_id', exercise.id)
      .order('set_number', { ascending: true });

    if (setsError) return null;

    enrichedExercises.push({
      ...exercise,
      sets: sets || [],
    });
  }

  return {
    ...session,
    exercises: enrichedExercises,
  };
}

async function fetchPreviousExerciseData(exerciseName, currentSessionId) {
  const { data: sessions, error: sessionsError } = await supabase
    .from('workout_sessions')
    .select('id, training_date, finished_at')
    .eq('user_id', currentUser.id)
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false });

  if (sessionsError || !sessions || sessions.length === 0) {
    return null;
  }

  for (const session of sessions) {
    if (session.id === currentSessionId) continue;

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

async function calculateExerciseImprovement(exercise, currentSessionId) {
  const previousData = await fetchPreviousExerciseData(exercise.exercise_name, currentSessionId);

  if (!previousData || !previousData.sets || previousData.sets.length === 0) {
    return {
      text: 'Steigerung zum letzten Training: keine Vergleichsdaten',
      className: '',
    };
  }

  const currentVolume = exercise.sets.reduce((sum, setItem) => {
    const reps = Number(setItem.reps_done || 0);
    const weight = Number(setItem.weight_used || 0);
    return sum + reps * weight;
  }, 0);

  const previousVolume = previousData.sets.reduce((sum, setItem) => {
    const reps = Number(setItem.reps_done || 0);
    const weight = Number(setItem.weight_used || 0);
    return sum + reps * weight;
  }, 0);

  const currentAvgWeight =
    exercise.sets.reduce((sum, setItem) => sum + Number(setItem.weight_used || 0), 0) /
    Math.max(exercise.sets.length, 1);

  const previousAvgWeight =
    previousData.sets.reduce((sum, setItem) => sum + Number(setItem.weight_used || 0), 0) /
    Math.max(previousData.sets.length, 1);

  if (currentAvgWeight > previousAvgWeight) {
    return {
      text: 'Steigerung zum letzten Training: Gewicht erhöht',
      className: 'improvement-positive',
    };
  }

  if (currentAvgWeight < previousAvgWeight) {
    return {
      text: 'Steigerung zum letzten Training: Gewicht reduziert',
      className: 'improvement-negative',
    };
  }

  if (previousVolume === 0) {
    return {
      text: 'Steigerung zum letzten Training: keine Vergleichsdaten',
      className: '',
    };
  }

  const percent = ((currentVolume - previousVolume) / previousVolume) * 100;
  const rounded = Math.round(percent * 10) / 10;
  const sign = rounded > 0 ? '+' : '';

  return {
    text: `Steigerung zum letzten Training: ${sign}${rounded}%`,
    className: rounded >= 0 ? 'improvement-positive' : 'improvement-negative',
  };
}

/* ------------------------------------------------------------ */
/* Historie laden */
/* ------------------------------------------------------------ */
async function loadHistory() {
  await guardPage();

  const { monday, sunday } = getWeekBounds(currentWeekOffset);
  historyRangeText.textContent = getDisplayRangeText(monday, sunday);
  setStatus(historyStatus, '');

  const { data, error } = await supabase
    .from('workout_sessions')
    .select('id, plan_name, training_date, duration_seconds, finished_at')
    .eq('user_id', currentUser.id)
    .gte('training_date', toDateInputValue(monday))
    .lte('training_date', toDateInputValue(sunday))
    .not('finished_at', 'is', null)
    .order('training_date', { ascending: false })
    .order('finished_at', { ascending: false });

  if (error) {
    console.error(error);
    setStatus(historyStatus, 'Training Historie konnte nicht geladen werden.', 'error');
    return;
  }

  currentSessions = data || [];

  if (currentSessions.length === 0) {
    historyList.innerHTML = `
      <div class="history-empty-state">
        <div class="history-empty-title">Für diese Woche sind keine Trainingseinheiten vorhanden.</div>
      </div>
    `;
    return;
  }

  historyList.innerHTML = currentSessions.map((session) => `
    <article class="history-session-card">
      <div class="history-session-main">
        <div class="history-session-title">${session.plan_name}</div>
        <div class="history-session-meta">${formatDate(session.training_date)}</div>
        <div class="history-session-meta">Dauer: ${formatSeconds(session.duration_seconds)}</div>
      </div>

      <div class="history-session-actions">
        <button class="history-action-btn history-action-btn-primary view-session-btn" data-id="${session.id}" type="button">Anzeigen</button>
        <button class="history-action-btn history-action-btn-primary edit-session-btn" data-id="${session.id}" type="button">Bearbeiten</button>
        <button class="history-action-btn history-action-btn-danger delete-session-btn" data-id="${session.id}" type="button">Löschen</button>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.view-session-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const sessionId = button.dataset.id;
      const details = await loadSessionDetails(sessionId);

      if (!details) {
        setStatus(historyStatus, 'Training konnte nicht angezeigt werden.', 'error');
        return;
      }

      const exerciseCards = [];

      for (const exercise of details.exercises) {
        const improvement = await calculateExerciseImprovement(exercise, details.id);

        exerciseCards.push(`
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

      viewHistoryContent.innerHTML = `
        <div class="training-summary-top">
          <div class="history-view-plan-name">${details.plan_name}</div>
          <div class="history-view-meta">${formatDate(details.training_date)}</div>
          <div class="history-view-meta">Dauer: ${formatSeconds(details.duration_seconds)}</div>
          <div class="history-view-meta">
            ${
              details.calories_burned !== null && details.calories_burned !== undefined
                ? `Ca. verbrannte kcal: <span class="training-summary-top-value">${details.calories_burned} kcal</span>`
                : `Ca. verbrannte kcal: <span class="training-summary-top-value">-</span>`
            }
          </div>
        </div>

        ${exerciseCards.join('')}
      `;

      setModalState(viewHistoryModal, true);
    });
  });

  document.querySelectorAll('.edit-session-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const sessionId = button.dataset.id;
      const details = await loadSessionDetails(sessionId);

      if (!details) {
        setStatus(historyStatus, 'Training konnte nicht zum Bearbeiten geladen werden.', 'error');
        return;
      }

      currentEditSession = details;
      setStatus(editHistoryStatus, '');

      editHistoryContent.innerHTML = `
        <div class="training-summary-top">
          <div class="history-view-plan-name">${details.plan_name}</div>
          <div class="history-view-meta">${formatDate(details.training_date)}</div>
          <div class="history-view-meta">Dauer: ${formatSeconds(details.duration_seconds)}</div>
        </div>

        ${details.exercises.map((exercise, exerciseIndex) => `
          <article class="training-exercise-card history-edit-exercise-card" style="--training-set-count:${exercise.sets.length};">
            <div class="training-exercise-head">
              <div>
                <div class="training-exercise-title">${exercise.exercise_name}</div>
                <div class="training-exercise-meta">${exercise.sets_planned} Sätze · ${exercise.reps_min}-${exercise.reps_max} Wdh.</div>
              </div>
            </div>

            ${renderEditSetMatrix(exercise, exerciseIndex)}
          </article>
        `).join('')}
      `;

      editHistoryContent.querySelectorAll('input[data-exercise-index]').forEach((input) => {
        input.addEventListener('input', () => {
          const exerciseIndex = Number(input.dataset.exerciseIndex);
          const setIndex = Number(input.dataset.setIndex);
          const field = input.dataset.field;
          const rawValue = input.value;

          if (field === 'reps') {
            currentEditSession.exercises[exerciseIndex].sets[setIndex].reps_done = rawValue === '' ? null : Number(rawValue);
          }

          if (field === 'weight') {
            currentEditSession.exercises[exerciseIndex].sets[setIndex].weight_used = rawValue === '' ? null : Number(rawValue);
          }
        });
      });

      setModalState(editHistoryModal, true);
    });
  });

  document.querySelectorAll('.delete-session-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const sessionId = button.dataset.id;

      const { data: linkedPlannedWorkout, error: linkedError } = await supabase
        .from('planned_workouts')
        .select('id, planned_date, status, completed_session_id')
        .eq('completed_session_id', sessionId)
        .maybeSingle();

      if (linkedError) {
        console.error(linkedError);
      }

      const { error: deleteError } = await supabase
        .from('workout_sessions')
        .delete()
        .eq('id', sessionId);

      if (deleteError) {
        console.error(deleteError);
        setStatus(historyStatus, 'Training konnte nicht gelöscht werden.', 'error');
        return;
      }

      if (linkedPlannedWorkout) {
        const today = new Date();
        const localTodayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const newStatus = linkedPlannedWorkout.planned_date < localTodayString ? 'missed' : 'planned';

        const { error: resetError } = await supabase
          .from('planned_workouts')
          .update({
            status: newStatus,
            completed_session_id: null,
          })
          .eq('id', linkedPlannedWorkout.id);

        if (resetError) {
          console.error(resetError);
        }
      }

      await loadHistory();
    });
  });
}

/* ------------------------------------------------------------ */
/* Modal Events */
/* ------------------------------------------------------------ */
closeViewHistoryBtn.addEventListener('click', () => {
  setModalState(viewHistoryModal, false);
});

cancelEditHistoryBtn.addEventListener('click', () => {
  setModalState(editHistoryModal, false);
  currentEditSession = null;
  setStatus(editHistoryStatus, '');
});

saveEditHistoryBtn.addEventListener('click', async () => {
  if (!currentEditSession) return;

  saveEditHistoryBtn.disabled = true;
  saveEditHistoryBtn.textContent = 'Wird gespeichert...';
  setStatus(editHistoryStatus, '');

  try {
    for (const exercise of currentEditSession.exercises) {
      for (const setItem of exercise.sets) {
        const { error } = await supabase
          .from('workout_session_sets')
          .update({
            reps_done: setItem.reps_done,
            weight_used: setItem.weight_used,
          })
          .eq('id', setItem.id);

        if (error) {
          console.error(error);
          setStatus(editHistoryStatus, 'Änderungen konnten nicht gespeichert werden.', 'error');
          saveEditHistoryBtn.disabled = false;
          saveEditHistoryBtn.textContent = 'Speichern';
          return;
        }
      }
    }

    setStatus(editHistoryStatus, 'Training wurde erfolgreich aktualisiert.', 'success');
    await loadHistory();

    setTimeout(() => {
      setModalState(editHistoryModal, false);
      currentEditSession = null;
      setStatus(editHistoryStatus, '');
    }, 700);
  } catch (error) {
    console.error(error);
    setStatus(editHistoryStatus, 'Beim Speichern ist ein Fehler aufgetreten.', 'error');
  } finally {
    saveEditHistoryBtn.disabled = false;
    saveEditHistoryBtn.textContent = 'Speichern';
  }
});

viewHistoryModal.addEventListener('click', (event) => {
  if (event.target === viewHistoryModal) {
    setModalState(viewHistoryModal, false);
  }
});

editHistoryModal.addEventListener('click', (event) => {
  if (event.target === editHistoryModal) {
    setModalState(editHistoryModal, false);
  }
});

/* ------------------------------------------------------------ */
/* Woche Navigation */
/* ------------------------------------------------------------ */
prevWeekBtn.addEventListener('click', async () => {
  currentWeekOffset -= 1;
  await loadHistory();
});

nextWeekBtn.addEventListener('click', async () => {
  if (currentWeekOffset < 0) {
    currentWeekOffset += 1;
    await loadHistory();
  }
});

/* ------------------------------------------------------------ */
/* Start */
/* ------------------------------------------------------------ */
loadHistory();