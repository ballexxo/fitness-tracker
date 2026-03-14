import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ------------------------------------------------------------
// Elemente
// ------------------------------------------------------------
const editPlanName = document.getElementById('editPlanName');
const addExerciseBtn = document.getElementById('addExerciseBtn');
const editExerciseList = document.getElementById('editExerciseList');
const editPlanStatus = document.getElementById('editPlanStatus');
const saveEditedPlanBtn = document.getElementById('saveEditedPlanBtn');

const editExerciseModal = document.getElementById('editExerciseModal');
const editModalTitle = document.getElementById('editModalTitle');
const cancelEditExerciseBtn = document.getElementById('cancelEditExerciseBtn');
const confirmEditExerciseBtn = document.getElementById('confirmEditExerciseBtn');
const editExerciseStatus = document.getElementById('editExerciseStatus');

const editExerciseName = document.getElementById('editExerciseName');
const editExerciseSets = document.getElementById('editExerciseSets');
const editExerciseRepsMin = document.getElementById('editExerciseRepsMin');
const editExerciseRepsMax = document.getElementById('editExerciseRepsMax');
const editExerciseRest = document.getElementById('editExerciseRest');

// ------------------------------------------------------------
// State
// ------------------------------------------------------------
let currentUser = null;
let currentPlanId = null;
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

function getPlanIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
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

function resetExerciseForm() {
  editExerciseName.value = '';
  editExerciseSets.value = '5';
  editExerciseRepsMin.value = '';
  editExerciseRepsMax.value = '';
  editExerciseRest.value = '';
  setStatus(editExerciseStatus, '');
}

function openModal(isEdit = false) {
  editExerciseModal.classList.remove('hidden');
  editModalTitle.textContent = isEdit ? 'Übung bearbeiten' : 'Übung hinzufügen';
  confirmEditExerciseBtn.textContent = isEdit ? 'Speichern' : 'Hinzufügen';
}

function closeModal() {
  editExerciseModal.classList.add('hidden');
  resetExerciseForm();
  editIndex = null;
}

// ------------------------------------------------------------
// Übungen rendern
// ------------------------------------------------------------
function renderExercises() {
  if (exercises.length === 0) {
    editExerciseList.innerHTML = '<p class="muted">Noch keine Übungen vorhanden.</p>';
    return;
  }

  editExerciseList.innerHTML = exercises.map((exercise, index) => `
    <div class="exercise-item">
      <div>
        <strong>${index + 1}. ${exercise.name}</strong><br>
        <span class="muted">
          ${exercise.sets} Sätze · ${exercise.repsMin}-${exercise.repsMax} Wdh. · ${exercise.restSeconds}s Pause
        </span>
      </div>

      <div class="exercise-actions">
        <button class="pill-button move-up-btn" data-index="${index}" type="button">↑</button>
        <button class="pill-button move-down-btn" data-index="${index}" type="button">↓</button>
        <button class="pill-button edit-exercise-btn" data-index="${index}" type="button">Bearbeiten</button>
        <button class="logout delete-exercise-btn" data-index="${index}" type="button">Löschen</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.edit-exercise-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const exercise = exercises[index];

      editIndex = index;
      editExerciseName.value = exercise.name;
      editExerciseSets.value = String(exercise.sets);
      editExerciseRepsMin.value = exercise.repsMin;
      editExerciseRepsMax.value = exercise.repsMax;
      editExerciseRest.value = exercise.restSeconds;

      openModal(true);
    });
  });

  document.querySelectorAll('.delete-exercise-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      exercises.splice(index, 1);
      renderExercises();
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
}

// ------------------------------------------------------------
// Plan laden
// ------------------------------------------------------------
async function loadPlan() {
  await guardPage();
  currentPlanId = getPlanIdFromUrl();

  if (!currentPlanId) {
    window.location.href = './trainingsplan-edit-list.html';
    return;
  }

  // Plan laden
  const { data: planData, error: planError } = await supabase
    .from('training_plans')
    .select('id, name, user_id')
    .eq('id', currentPlanId)
    .single();

  if (planError || !planData) {
    console.error('Plan konnte nicht geladen werden:', planError);
    setStatus(editPlanStatus, 'Trainingsplan konnte nicht geladen werden.', 'error');
    return;
  }

  editPlanName.value = planData.name;

  // Übungen laden
  const { data: exerciseData, error: exerciseError } = await supabase
    .from('training_plan_exercises')
    .select('id, exercise_order, name, sets, reps_min, reps_max, rest_seconds')
    .eq('plan_id', currentPlanId)
    .order('exercise_order', { ascending: true });

  if (exerciseError) {
    console.error('Übungen konnten nicht geladen werden:', exerciseError);
    setStatus(editPlanStatus, 'Übungen konnten nicht geladen werden.', 'error');
    return;
  }

  exercises = (exerciseData || []).map((exercise) => ({
    id: exercise.id,
    name: exercise.name,
    sets: exercise.sets,
    repsMin: exercise.reps_min,
    repsMax: exercise.reps_max,
    restSeconds: exercise.rest_seconds,
  }));

  renderExercises();
}

// ------------------------------------------------------------
// Modal Aktionen
// ------------------------------------------------------------
addExerciseBtn.addEventListener('click', () => {
  editIndex = null;
  resetExerciseForm();
  openModal(false);
});

cancelEditExerciseBtn.addEventListener('click', closeModal);

confirmEditExerciseBtn.addEventListener('click', () => {
  const updatedExercise = {
    id: editIndex !== null ? exercises[editIndex].id : undefined,
    name: editExerciseName.value.trim(),
    sets: Number(editExerciseSets.value),
    repsMin: Number(editExerciseRepsMin.value),
    repsMax: Number(editExerciseRepsMax.value),
    restSeconds: Number(editExerciseRest.value),
  };

  if (!updatedExercise.name) {
    setStatus(editExerciseStatus, 'Bitte gib einen Übungsnamen ein.', 'error');
    return;
  }

  if (!updatedExercise.repsMin || !updatedExercise.repsMax) {
    setStatus(editExerciseStatus, 'Bitte gib min und max Wiederholungen ein.', 'error');
    return;
  }

  if (updatedExercise.repsMin > updatedExercise.repsMax) {
    setStatus(editExerciseStatus, 'Min-Wiederholungen dürfen nicht größer als Max-Wiederholungen sein.', 'error');
    return;
  }

  if (updatedExercise.restSeconds < 0) {
    setStatus(editExerciseStatus, 'Pause darf nicht negativ sein.', 'error');
    return;
  }

  if (editIndex === null) {
    exercises.push(updatedExercise);
  } else {
    exercises[editIndex] = updatedExercise;
  }

  renderExercises();
  closeModal();
});

// ------------------------------------------------------------
// Änderungen speichern
// ------------------------------------------------------------
saveEditedPlanBtn.addEventListener('click', async () => {
  setStatus(editPlanStatus, '');

  const cleanPlanName = editPlanName.value.trim();

  if (!cleanPlanName) {
    setStatus(editPlanStatus, 'Bitte gib dem Trainingsplan einen Namen.', 'error');
    return;
  }

  if (exercises.length === 0) {
    setStatus(editPlanStatus, 'Bitte füge mindestens eine Übung hinzu.', 'error');
    return;
  }

  saveEditedPlanBtn.disabled = true;
  saveEditedPlanBtn.textContent = 'Wird gespeichert...';

  try {
    // 1. Planname aktualisieren
    const { error: updatePlanError } = await supabase
      .from('training_plans')
      .update({ name: cleanPlanName })
      .eq('id', currentPlanId);

    if (updatePlanError) {
      console.error('Plan konnte nicht aktualisiert werden:', updatePlanError);
      setStatus(editPlanStatus, 'Trainingsplan konnte nicht gespeichert werden.', 'error');
      return;
    }

    // 2. Alte Übungen löschen
    const { error: deleteExercisesError } = await supabase
      .from('training_plan_exercises')
      .delete()
      .eq('plan_id', currentPlanId);

    if (deleteExercisesError) {
      console.error('Alte Übungen konnten nicht gelöscht werden:', deleteExercisesError);
      setStatus(editPlanStatus, 'Alte Übungen konnten nicht aktualisiert werden.', 'error');
      return;
    }

    // 3. Übungen neu speichern
    const newExerciseRows = exercises.map((exercise, index) => ({
      plan_id: currentPlanId,
      exercise_order: index,
      name: exercise.name,
      sets: exercise.sets,
      reps_min: exercise.repsMin,
      reps_max: exercise.repsMax,
      rest_seconds: exercise.restSeconds,
    }));

    const { error: insertExercisesError } = await supabase
      .from('training_plan_exercises')
      .insert(newExerciseRows);

    if (insertExercisesError) {
      console.error('Neue Übungen konnten nicht gespeichert werden:', insertExercisesError);
      setStatus(editPlanStatus, 'Übungen konnten nicht gespeichert werden.', 'error');
      return;
    }

    setStatus(editPlanStatus, 'Änderungen wurden erfolgreich gespeichert.', 'success');
  } catch (error) {
    console.error('Unerwarteter Fehler:', error);
    setStatus(editPlanStatus, 'Beim Speichern ist ein Fehler aufgetreten.', 'error');
  } finally {
    saveEditedPlanBtn.disabled = false;
    saveEditedPlanBtn.textContent = 'Änderungen speichern';
  }
});

// ------------------------------------------------------------
// Start
// ------------------------------------------------------------
loadPlan();