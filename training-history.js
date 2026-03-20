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

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function setStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status ${type}`.trim();
  element.classList.toggle('hidden', !message);
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
  const currentDay = now.getDay(); // 0 = So, 1 = Mo
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

// ------------------------------------------------------------
// Session Details laden
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// Historie laden
// ------------------------------------------------------------
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
    historyList.innerHTML = '<p class="muted">Für diese Woche sind keine Trainingseinheiten vorhanden.</p>';
    return;
  }

  historyList.innerHTML = currentSessions.map((session) => `
    <div class="exercise-item">
      <div>
        <strong>${session.plan_name}</strong><br>
        <span class="muted">${formatDate(session.training_date)}</span><br>
        <span class="muted">Dauer: ${formatSeconds(session.duration_seconds)}</span>
      </div>

      <div class="exercise-actions">
        <button class="pill-button view-session-btn" data-id="${session.id}" type="button">Anzeigen</button>
        <button class="pill-button edit-session-btn" data-id="${session.id}" type="button">Bearbeiten</button>
        <button class="logout delete-session-btn" data-id="${session.id}" type="button">Löschen</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.view-session-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const sessionId = button.dataset.id;
      const details = await loadSessionDetails(sessionId);
      if (!details) {
        setStatus(historyStatus, 'Training konnte nicht angezeigt werden.', 'error');
        return;
      }

      viewHistoryContent.innerHTML = `
  <div class="summary-block">
    <strong>${details.plan_name}</strong><br>
    <span class="muted">${formatDate(details.training_date)}</span><br>
    <span class="muted">Dauer: ${formatSeconds(details.duration_seconds)}</span><br>
    <span class="muted">
      ${
        details.calories_burned !== null && details.calories_burned !== undefined
          ? `Ca. verbrannte kcal: ${details.calories_burned} kcal`
          : `Es fehlt dein Gewicht bei Persönliche Daten, um den Kalorienverbrauch zu berechnen.`
      }
    </span>
  </div>

        <div style="margin-top: 18px;">
          ${details.exercises.map((exercise) => `
            <div class="summary-exercise-box">
              <strong>${exercise.exercise_name}</strong><br>
              <span class="muted">${exercise.sets_planned} Sätze · ${exercise.reps_min}-${exercise.reps_max} Wdh.</span>
              <div class="muted" style="margin-top:8px;">
                ${exercise.sets.map((setItem) => `${setItem.reps_done ?? '-'} Wdh · ${setItem.weight_used ?? '-'} kg`).join(' | ')}
              </div>
            </div>
          `).join('')}
        </div>
      `;

      viewHistoryModal.classList.remove('hidden');
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
        <div class="summary-block">
          <strong>${details.plan_name}</strong><br>
          <span class="muted">${formatDate(details.training_date)}</span><br>
          <span class="muted">Dauer: ${formatSeconds(details.duration_seconds)}</span>
        </div>

        <div style="margin-top: 18px;">
          ${details.exercises.map((exercise, exerciseIndex) => `
            <div class="summary-exercise-box">
              <strong>${exercise.exercise_name}</strong><br>
              <span class="muted">${exercise.sets_planned} Sätze · ${exercise.reps_min}-${exercise.reps_max} Wdh.</span>

              <div style="margin-top:12px;">
                ${exercise.sets.map((setItem, setIndex) => `
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
                          value="${setItem.reps_done ?? ''}"
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
                          value="${setItem.weight_used ?? ''}"
                        >
                      </label>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
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

      editHistoryModal.classList.remove('hidden');
    });
  });

  document.querySelectorAll('.delete-session-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const sessionId = button.dataset.id;

      const { error: deleteError } = await supabase
        .from('workout_sessions')
        .delete()
        .eq('id', sessionId);

      if (deleteError) {
        console.error(deleteError);
        setStatus(historyStatus, 'Training konnte nicht gelöscht werden.', 'error');
        return;
      }

      await loadHistory();
    });
  });
}

// ------------------------------------------------------------
// Modal Events
// ------------------------------------------------------------
closeViewHistoryBtn.addEventListener('click', () => {
  viewHistoryModal.classList.add('hidden');
});

cancelEditHistoryBtn.addEventListener('click', () => {
  editHistoryModal.classList.add('hidden');
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
      editHistoryModal.classList.add('hidden');
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

// ------------------------------------------------------------
// Woche Navigation
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// Start
// ------------------------------------------------------------
loadHistory();