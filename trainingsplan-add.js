import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const openExerciseModalBtn = document.getElementById('openExerciseModalBtn');
const savePlanBtn = document.getElementById('savePlanBtn');
const exerciseModal = document.getElementById('exerciseModal');
const successModal = document.getElementById('successModal');
const closeExerciseModalBtn = document.getElementById('closeExerciseModalBtn');
const confirmExerciseBtn = document.getElementById('confirmExerciseBtn');
const successOkBtn = document.getElementById('successOkBtn');

const planName = document.getElementById('planName');
const exerciseList = document.getElementById('exerciseList');
const planStatus = document.getElementById('planStatus');
const exerciseStatus = document.getElementById('exerciseStatus');

const exerciseName = document.getElementById('exerciseName');
const exerciseSets = document.getElementById('exerciseSets');
const exerciseRepsMin = document.getElementById('exerciseRepsMin');
const exerciseRepsMax = document.getElementById('exerciseRepsMax');
const exerciseRest = document.getElementById('exerciseRest');
const modalTitle = document.getElementById('modalTitle');

let exercises = [];
let editIndex = null;

/* ------------------------------------------------------------ */
/* Helpers */
/* ------------------------------------------------------------ */
function setStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status ${type}`.trim();
  element.classList.toggle('hidden', !message);
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

async function guardPage() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.user) {
    window.location.href = './index.html';
    return null;
  }

  return data.session.user;
}

function resetExerciseForm() {
  exerciseName.value = '';
  exerciseSets.value = '3';
  exerciseRepsMin.value = '';
  exerciseRepsMax.value = '';
  exerciseRest.value = '';
  setStatus(exerciseStatus, '');
}

function openExerciseModal(isEdit = false) {
  modalTitle.textContent = isEdit ? 'Übung bearbeiten' : 'Übung hinzufügen';
  confirmExerciseBtn.textContent = isEdit ? 'Speichern' : 'Hinzufügen';
  openModal(exerciseModal);
}

function closeExerciseModal() {
  closeModal(exerciseModal);
  resetExerciseForm();
  editIndex = null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/* ------------------------------------------------------------ */
/* Übungen rendern */
/* ------------------------------------------------------------ */
function renderExercises() {
  if (exercises.length === 0) {
    exerciseList.innerHTML = `
      <div class="plan-add-empty-state">
        Noch keine Übungen hinzugefügt.
      </div>
    `;
    return;
  }

  exerciseList.innerHTML = exercises.map((exercise, index) => `
    <article class="plan-add-exercise-card">
      <div class="plan-add-exercise-main">
        <div class="plan-add-exercise-title">${index + 1}. ${escapeHtml(exercise.name)}</div>
        <div class="plan-add-exercise-meta">
          ${exercise.sets} Sätze · ${exercise.repsMin}-${exercise.repsMax} Wdh. · ${exercise.restSeconds}s Pause
        </div>
      </div>

      <div class="plan-add-exercise-side plan-add-exercise-side-row">
        <button class="history-action-btn history-action-btn-primary edit-exercise-btn" data-index="${index}" type="button">
          Bearbeiten
        </button>

        <button class="history-action-btn history-action-btn-danger delete-exercise-btn" data-index="${index}" type="button">
          Löschen
        </button>

        <div class="plan-add-mini-move-group">
          <button class="plan-add-mini-move-btn move-up-btn" data-index="${index}" type="button" aria-label="Nach oben">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 6L12 18"></path>
              <path d="M7 11L12 6L17 11"></path>
            </svg>
          </button>

          <button class="plan-add-mini-move-btn move-down-btn" data-index="${index}" type="button" aria-label="Nach unten">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 6L12 18"></path>
              <path d="M7 13L12 18L17 13"></path>
            </svg>
          </button>
        </div>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.edit-exercise-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const exercise = exercises[index];

      editIndex = index;
      exerciseName.value = exercise.name;
      exerciseSets.value = String(exercise.sets);
      exerciseRepsMin.value = String(exercise.repsMin);
      exerciseRepsMax.value = String(exercise.repsMax);
      exerciseRest.value = String(exercise.restSeconds);

      openExerciseModal(true);
    });
  });

  document.querySelectorAll('.move-up-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      if (index === 0) return;

      [exercises[index - 1], exercises[index]] = [exercises[index], exercises[index - 1]];
      renderExercises();
    });
  });

  document.querySelectorAll('.move-down-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      if (index === exercises.length - 1) return;

      [exercises[index], exercises[index + 1]] = [exercises[index + 1], exercises[index]];
      renderExercises();
    });
  });

  document.querySelectorAll('.delete-exercise-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      exercises.splice(index, 1);
      renderExercises();
    });
  });
}

/* ------------------------------------------------------------ */
/* Modal Events */
/* ------------------------------------------------------------ */
openExerciseModalBtn.addEventListener('click', () => {
  editIndex = null;
  resetExerciseForm();
  openExerciseModal(false);
});

closeExerciseModalBtn.addEventListener('click', closeExerciseModal);

exerciseModal.addEventListener('click', (event) => {
  if (event.target === exerciseModal) {
    closeExerciseModal();
  }
});

confirmExerciseBtn.addEventListener('click', () => {
  const newExercise = {
    name: exerciseName.value.trim(),
    sets: Number(exerciseSets.value),
    repsMin: Number(exerciseRepsMin.value),
    repsMax: Number(exerciseRepsMax.value),
    restSeconds: Number(exerciseRest.value),
  };

  if (!newExercise.name) {
    setStatus(exerciseStatus, 'Bitte gib einen Übungsnamen ein.', 'error');
    return;
  }

  if (!newExercise.repsMin || !newExercise.repsMax) {
    setStatus(exerciseStatus, 'Bitte gib min und max Wiederholungen ein.', 'error');
    return;
  }

  if (newExercise.repsMin > newExercise.repsMax) {
    setStatus(exerciseStatus, 'Min-Wiederholungen dürfen nicht größer als Max-Wiederholungen sein.', 'error');
    return;
  }

  if (Number.isNaN(newExercise.restSeconds) || newExercise.restSeconds < 0) {
    setStatus(exerciseStatus, 'Pause darf nicht negativ sein.', 'error');
    return;
  }

  if (editIndex === null) {
    exercises.push(newExercise);
  } else {
    exercises[editIndex] = newExercise;
  }

  renderExercises();
  closeExerciseModal();
});

/* ------------------------------------------------------------ */
/* Trainingsplan speichern */
/* ------------------------------------------------------------ */
savePlanBtn.addEventListener('click', async () => {
  setStatus(planStatus, '');

  const user = await guardPage();
  if (!user) return;

  const cleanPlanName = planName.value.trim();

  if (!cleanPlanName) {
    setStatus(planStatus, 'Bitte gib deinem Trainingsplan einen Namen.', 'error');
    return;
  }

  if (exercises.length === 0) {
    setStatus(planStatus, 'Bitte füge mindestens eine Übung hinzu.', 'error');
    return;
  }

  savePlanBtn.disabled = true;
  savePlanBtn.textContent = 'Wird gespeichert...';

  try {
    const { data: planData, error: planError } = await supabase
      .from('training_plans')
      .insert({
        user_id: user.id,
        name: cleanPlanName,
      })
      .select()
      .single();

    if (planError) {
      console.error('Fehler beim Speichern des Trainingsplans:', planError);
      setStatus(planStatus, 'Trainingsplan konnte nicht gespeichert werden.', 'error');
      return;
    }

    const exerciseRows = exercises.map((exercise, index) => ({
      plan_id: planData.id,
      exercise_order: index,
      name: exercise.name,
      sets: exercise.sets,
      reps_min: exercise.repsMin,
      reps_max: exercise.repsMax,
      rest_seconds: exercise.restSeconds,
    }));

    const { error: exerciseInsertError } = await supabase
      .from('training_plan_exercises')
      .insert(exerciseRows);

    if (exerciseInsertError) {
      console.error('Fehler beim Speichern der Übungen:', exerciseInsertError);
      setStatus(planStatus, 'Übungen konnten nicht gespeichert werden.', 'error');
      return;
    }

    openModal(successModal);
  } catch (error) {
    console.error('Unerwarteter Fehler:', error);
    setStatus(planStatus, 'Beim Speichern ist ein Fehler aufgetreten.', 'error');
  } finally {
    savePlanBtn.disabled = false;
    savePlanBtn.textContent = 'Trainingsplan speichern';
  }
});

/* ------------------------------------------------------------ */
/* Erfolgs-Modal */
/* ------------------------------------------------------------ */
successOkBtn.addEventListener('click', () => {
  closeModal(successModal);
  window.location.href = './trainingsplan.html';
});

successModal.addEventListener('click', (event) => {
  if (event.target === successModal) {
    closeModal(successModal);
  }
});

/* ------------------------------------------------------------ */
/* Start */
/* ------------------------------------------------------------ */
guardPage();
renderExercises();