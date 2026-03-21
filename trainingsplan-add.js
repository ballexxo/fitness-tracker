import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const openExerciseModalBtn = document.getElementById('openExerciseModalBtn');
const savePlanBtn = document.getElementById('savePlanBtn');
const exerciseModal = document.getElementById('exerciseModal');
const successModal = document.getElementById('successModal');
const cancelExerciseBtn = document.getElementById('cancelExerciseBtn');
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

let exercises = [];
let editIndex = null;

// ------------------------------------------------------------
// Hilfsfunktionen
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

  return data.session.user;
}

function resetExerciseForm() {
  exerciseName.value = '';
  exerciseSets.value = '5';
  exerciseRepsMin.value = '';
  exerciseRepsMax.value = '';
  exerciseRest.value = '';
  setStatus(exerciseStatus, '');
}

function openModal(isEdit = false) {
  exerciseModal.classList.remove('hidden');
  confirmExerciseBtn.textContent = isEdit ? 'Speichern' : 'Hinzufügen';
  document.getElementById('modalTitle').textContent = isEdit ? 'Übung bearbeiten' : 'Übung hinzufügen';
}

function closeModal() {
  exerciseModal.classList.add('hidden');
  resetExerciseForm();
  editIndex = null;
}

// ------------------------------------------------------------
// Übungen rendern
// ------------------------------------------------------------
function renderExercises() {
  if (exercises.length === 0) {
    exerciseList.innerHTML = '<p class="muted">Noch keine Übungen hinzugefügt.</p>';
    return;
  }

  exerciseList.innerHTML = exercises.map((exercise, index) => `
    <div class="exercise-item">
      <div>
        <strong>${index + 1}. ${exercise.name}</strong><br>
        <span class="muted">
          ${exercise.sets} Sätze · ${exercise.repsMin}-${exercise.repsMax} Wdh. · ${exercise.restSeconds}s Pause
        </span>
      </div>

      <div class="exercise-actions">
        <div class="exercise-move-row">
          <button class="mini-square-button move-up-btn" data-index="${index}" type="button">↑</button>
          <button class="mini-square-button move-down-btn" data-index="${index}" type="button">↓</button>
        </div>

        <div class="exercise-main-row">
          <button class="pill-button mini-action-button edit-exercise-btn" data-index="${index}" type="button">
            Bearbeiten
          </button>

          <button class="logout mini-action-button delete-exercise-btn" data-index="${index}" type="button">
            Löschen
          </button>
        </div>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.edit-exercise-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const exercise = exercises[index];

      editIndex = index;
      exerciseName.value = exercise.name;
      exerciseSets.value = exercise.sets;
      exerciseRepsMin.value = exercise.repsMin;
      exerciseRepsMax.value = exercise.repsMax;
      exerciseRest.value = exercise.restSeconds;

      openModal(true);
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
// ------------------------------------------------------------
// Modal Events
// ------------------------------------------------------------
openExerciseModalBtn.addEventListener('click', () => {
  editIndex = null;
  resetExerciseForm();
  openModal(false);
});

cancelExerciseBtn.addEventListener('click', closeModal);

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

  if (newExercise.restSeconds < 0) {
    setStatus(exerciseStatus, 'Pause darf nicht negativ sein.', 'error');
    return;
  }

  if (editIndex === null) {
    exercises.push(newExercise);
  } else {
    exercises[editIndex] = newExercise;
  }

  renderExercises();
  closeModal();
});

// ------------------------------------------------------------
// Trainingsplan speichern
// ------------------------------------------------------------
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
    // 1. Trainingsplan speichern
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

    // 2. Übungen speichern
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

    successModal.classList.remove('hidden');
  } catch (error) {
    console.error('Unerwarteter Fehler:', error);
    setStatus(planStatus, 'Beim Speichern ist ein Fehler aufgetreten.', 'error');
  } finally {
    savePlanBtn.disabled = false;
    savePlanBtn.textContent = 'Trainingsplan speichern';
  }
});

// ------------------------------------------------------------
// Erfolgs-Modal
// ------------------------------------------------------------
successOkBtn.addEventListener('click', () => {
  successModal.classList.add('hidden');
  window.location.href = './trainingsplan.html';
});

// ------------------------------------------------------------
// Start
// ------------------------------------------------------------
guardPage();
renderExercises();