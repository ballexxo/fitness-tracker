import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const editPlanName = document.getElementById('editPlanName');
const addExerciseBtn = document.getElementById('addExerciseBtn');
const editExerciseList = document.getElementById('editExerciseList');
const editPlanStatus = document.getElementById('editPlanStatus');
const saveEditedPlanBtn = document.getElementById('saveEditedPlanBtn');

const editExerciseModal = document.getElementById('editExerciseModal');
const editModalTitle = document.getElementById('editModalTitle');
const closeEditExerciseModalBtn = document.getElementById('closeEditExerciseModalBtn');
const confirmEditExerciseBtn = document.getElementById('confirmEditExerciseBtn');
const editExerciseStatus = document.getElementById('editExerciseStatus');

const editExerciseName = document.getElementById('editExerciseName');
const editExerciseSets = document.getElementById('editExerciseSets');
const editExerciseRepsMin = document.getElementById('editExerciseRepsMin');
const editExerciseRepsMax = document.getElementById('editExerciseRepsMax');
const editExerciseRest = document.getElementById('editExerciseRest');

let currentUser = null;
let currentPlanId = null;
let exercises = [];
let editIndex = null;

function setStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status ${type}`.trim();
  element.classList.toggle('hidden', !message);
}

function getPlanIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function openModal(modal) {
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeModal(modal) {
  modal.classList.add('hidden');
  document.body.classList.remove('modal-open');
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
  editExerciseSets.value = '3';
  editExerciseRepsMin.value = '';
  editExerciseRepsMax.value = '';
  editExerciseRest.value = '';
  setStatus(editExerciseStatus, '');
}

function openExerciseModal(isEdit = false) {
  editModalTitle.textContent = isEdit ? 'Übung bearbeiten' : 'Übung hinzufügen';
  confirmEditExerciseBtn.textContent = isEdit ? 'Speichern' : 'Hinzufügen';
  openModal(editExerciseModal);
}

function closeExerciseModal() {
  closeModal(editExerciseModal);
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

function renderExercises() {
  if (exercises.length === 0) {
    editExerciseList.innerHTML = `
      <div class="plan-add-empty-state">
        Noch keine Übungen vorhanden.
      </div>
    `;
    return;
  }

  editExerciseList.innerHTML = exercises.map((exercise, index) => `
    <article class="plan-add-exercise-card">
      <div class="plan-add-exercise-main">
        <div class="plan-add-exercise-title">${index + 1}. ${escapeHtml(exercise.name)}</div>
        <div class="plan-add-exercise-meta">
          ${exercise.sets} Sätze · ${exercise.repsMin}-${exercise.repsMax} Wdh. · ${exercise.restSeconds}s Pause
        </div>
      </div>

      <div class="plan-add-exercise-bottom">
        <div class="plan-add-action-buttons-mobile">
          <button class="history-action-btn history-action-btn-primary edit-exercise-btn" data-index="${index}" type="button">
            Bearbeiten
          </button>

          <button class="history-action-btn history-action-btn-danger delete-exercise-btn" data-index="${index}" type="button">
            Löschen
          </button>
        </div>

        <div class="plan-add-mini-move-group-mobile">
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
      editExerciseName.value = exercise.name;
      editExerciseSets.value = String(exercise.sets);
      editExerciseRepsMin.value = exercise.repsMin;
      editExerciseRepsMax.value = exercise.repsMax;
      editExerciseRest.value = exercise.restSeconds;

      openExerciseModal(true);
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

async function loadPlan() {
  await guardPage();
  currentPlanId = getPlanIdFromUrl();

  if (!currentPlanId) {
    window.location.href = './trainingsplan-edit-list.html';
    return;
  }

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

addExerciseBtn.addEventListener('click', () => {
  editIndex = null;
  resetExerciseForm();
  openExerciseModal(false);
});

closeEditExerciseModalBtn.addEventListener('click', closeExerciseModal);

editExerciseModal.addEventListener('click', (event) => {
  if (event.target === editExerciseModal) {
    closeExerciseModal();
  }
});

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
  closeExerciseModal();
});

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
    const { error: updatePlanError } = await supabase
      .from('training_plans')
      .update({ name: cleanPlanName })
      .eq('id', currentPlanId);

    if (updatePlanError) {
      console.error('Plan konnte nicht aktualisiert werden:', updatePlanError);
      setStatus(editPlanStatus, 'Trainingsplan konnte nicht gespeichert werden.', 'error');
      return;
    }

    const { error: deleteExercisesError } = await supabase
      .from('training_plan_exercises')
      .delete()
      .eq('plan_id', currentPlanId);

    if (deleteExercisesError) {
      console.error('Alte Übungen konnten nicht gelöscht werden:', deleteExercisesError);
      setStatus(editPlanStatus, 'Alte Übungen konnten nicht aktualisiert werden.', 'error');
      return;
    }

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
    saveEditedPlanBtn.textContent = 'Speichern';
  }
});

loadPlan();