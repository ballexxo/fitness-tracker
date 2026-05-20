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

let alternativeMainIndex = null;
let alternativeEditIndex = null;

let alternativeExerciseModal = null;
let alternativeModalTitle = null;
let alternativeExerciseName = null;
let alternativeSets = null;
let alternativeRepsMin = null;
let alternativeRepsMax = null;
let alternativeRest = null;
let alternativeExerciseStatus = null;
let closeAlternativeModalBtn = null;
let confirmAlternativeExerciseBtn = null;

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

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function getAlternativeKey(mainName, alternativeName) {
  return `${normalizeName(mainName).toLowerCase()}||${normalizeName(alternativeName).toLowerCase()}`;
}

function createAlternativeFromMain(mainExercise, name = '') {
  return {
    name,
    sets: Number(mainExercise.sets || 3),
    repsMin: Number(mainExercise.repsMin || 1),
    repsMax: Number(mainExercise.repsMax || 1),
    restSeconds: Number(mainExercise.restSeconds || 0),
  };
}

/* ------------------------------------------------------------ */
/* Alternative Modal dynamisch erstellen */
/* ------------------------------------------------------------ */
function createAlternativeModal() {
  document.body.insertAdjacentHTML('beforeend', `
    <div id="alternativeExerciseModal" class="modal-overlay hidden">
      <div class="modal-card app-modal-card plan-exercise-modal-card">
        <button id="closeAlternativeModalBtn" class="modal-close-x" type="button" aria-label="Schließen">×</button>

        <h2 id="alternativeModalTitle" class="app-modal-title">Alternativübung hinzufügen</h2>

        <div class="app-modal-content">
          <form id="alternativeExerciseForm" class="app-form plan-exercise-form">
            <div class="plan-exercise-row">
              <label class="plan-add-label" for="alternativeExerciseName">Übung</label>
              <input
                id="alternativeExerciseName"
                class="plan-add-input"
                type="text"
                placeholder="Zum Beispiel KH Bankdrücken"
                required
              >
            </div>

            <div class="plan-exercise-row">
              <label class="plan-add-label" for="alternativeSets">Sätze</label>
              <select id="alternativeSets" class="plan-add-input" required>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
                <option value="6">6</option>
                <option value="7">7</option>
                <option value="8">8</option>
              </select>
            </div>

            <div class="plan-exercise-row">
              <label class="plan-add-label">Wdh.</label>

              <div class="plan-reps-group">
                <input
                  id="alternativeRepsMin"
                  class="plan-add-input"
                  type="number"
                  min="1"
                  placeholder="min"
                  required
                >

                <span class="plan-reps-separator">–</span>

                <input
                  id="alternativeRepsMax"
                  class="plan-add-input"
                  type="number"
                  min="1"
                  placeholder="max"
                  required
                >
              </div>
            </div>

            <div class="plan-exercise-row">
              <label class="plan-add-label" for="alternativeRest">Pause in Sekunden</label>
              <input
                id="alternativeRest"
                class="plan-add-input"
                type="number"
                min="0"
                placeholder="120"
                required
              >
            </div>
          </form>

          <div id="alternativeExerciseStatus" class="status hidden"></div>
        </div>

        <div class="modal-actions app-modal-actions">
          <button id="confirmAlternativeExerciseBtn" class="dashboard-summary-primary-btn" type="button">
            Hinzufügen
          </button>
        </div>
      </div>
    </div>
  `);

  alternativeExerciseModal = document.getElementById('alternativeExerciseModal');
  alternativeModalTitle = document.getElementById('alternativeModalTitle');
  alternativeExerciseName = document.getElementById('alternativeExerciseName');
  alternativeSets = document.getElementById('alternativeSets');
  alternativeRepsMin = document.getElementById('alternativeRepsMin');
  alternativeRepsMax = document.getElementById('alternativeRepsMax');
  alternativeRest = document.getElementById('alternativeRest');
  alternativeExerciseStatus = document.getElementById('alternativeExerciseStatus');
  closeAlternativeModalBtn = document.getElementById('closeAlternativeModalBtn');
  confirmAlternativeExerciseBtn = document.getElementById('confirmAlternativeExerciseBtn');

  closeAlternativeModalBtn.addEventListener('click', closeAlternativeModal);

  alternativeExerciseModal.addEventListener('click', (event) => {
    if (event.target === alternativeExerciseModal) {
      closeAlternativeModal();
    }
  });

  confirmAlternativeExerciseBtn.addEventListener('click', confirmAlternativeExercise);
}

function resetAlternativeForm() {
  if (alternativeExerciseName) alternativeExerciseName.value = '';
  if (alternativeSets) alternativeSets.value = '';
  if (alternativeRepsMin) alternativeRepsMin.value = '';
  if (alternativeRepsMax) alternativeRepsMax.value = '';
  if (alternativeRest) alternativeRest.value = '';
  if (alternativeExerciseStatus) setStatus(alternativeExerciseStatus, '');
}

function openAlternativeModal(mainIndex, altIndex = null) {
  alternativeMainIndex = mainIndex;
  alternativeEditIndex = altIndex;

  const mainExercise = exercises[mainIndex];
  const existingAlternative =
    altIndex !== null ? mainExercise.alternatives?.[altIndex] : null;

  const values = existingAlternative || createAlternativeFromMain(mainExercise);

  alternativeModalTitle.textContent =
    altIndex === null ? 'Alternativübung hinzufügen' : 'Alternativübung bearbeiten';

  confirmAlternativeExerciseBtn.textContent =
    altIndex === null ? 'Hinzufügen' : 'Speichern';

  alternativeExerciseName.value = values.name || '';
  alternativeSets.value = String(values.sets ?? mainExercise.sets ?? 3);
  alternativeRepsMin.value = String(values.repsMin ?? mainExercise.repsMin ?? '');
  alternativeRepsMax.value = String(values.repsMax ?? mainExercise.repsMax ?? '');
  alternativeRest.value = String(values.restSeconds ?? mainExercise.restSeconds ?? 0);

  setStatus(alternativeExerciseStatus, '');
  openModal(alternativeExerciseModal);

  setTimeout(() => {
    alternativeExerciseName.focus();
  }, 50);
}

function closeAlternativeModal() {
  closeModal(alternativeExerciseModal);
  resetAlternativeForm();
  alternativeMainIndex = null;
  alternativeEditIndex = null;
}

function confirmAlternativeExercise() {
  if (alternativeMainIndex === null || !exercises[alternativeMainIndex]) return;

  const mainExercise = exercises[alternativeMainIndex];

  const altName = normalizeName(alternativeExerciseName.value);
  const altSets = Number(alternativeSets.value);
  const altRepsMin = Number(alternativeRepsMin.value);
  const altRepsMax = Number(alternativeRepsMax.value);
  const altRestSeconds = Number(alternativeRest.value);

  if (!altName) {
    setStatus(alternativeExerciseStatus, 'Bitte gib einen Namen für die Alternativübung ein.', 'error');
    return;
  }

  if (altName.toLowerCase() === mainExercise.name.toLowerCase()) {
    setStatus(alternativeExerciseStatus, 'Die Alternativübung darf nicht genauso heißen wie die Hauptübung.', 'error');
    return;
  }

  if (!altSets || altSets < 1) {
    setStatus(alternativeExerciseStatus, 'Bitte gib eine gültige Satzanzahl ein.', 'error');
    return;
  }

  if (!altRepsMin || !altRepsMax) {
    setStatus(alternativeExerciseStatus, 'Bitte gib min und max Wiederholungen ein.', 'error');
    return;
  }

  if (altRepsMin > altRepsMax) {
    setStatus(alternativeExerciseStatus, 'Min-Wiederholungen dürfen nicht größer als Max-Wiederholungen sein.', 'error');
    return;
  }

  if (Number.isNaN(altRestSeconds) || altRestSeconds < 0) {
    setStatus(alternativeExerciseStatus, 'Pause darf nicht negativ sein.', 'error');
    return;
  }

  if (!mainExercise.alternatives) {
    mainExercise.alternatives = [];
  }

  const duplicate = mainExercise.alternatives.some((alt, index) => {
    if (alternativeEditIndex !== null && index === alternativeEditIndex) return false;
    return alt.name.toLowerCase() === altName.toLowerCase();
  });

  if (duplicate) {
    setStatus(alternativeExerciseStatus, 'Diese Alternativübung ist bereits vorhanden.', 'error');
    return;
  }

  const alternative = {
    name: altName,
    sets: altSets,
    repsMin: altRepsMin,
    repsMax: altRepsMax,
    restSeconds: altRestSeconds,
  };

  if (alternativeEditIndex === null) {
    mainExercise.alternatives.push(alternative);
  } else {
    mainExercise.alternatives[alternativeEditIndex] = alternative;
  }

  renderExercises();
  closeAlternativeModal();
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

  exerciseList.innerHTML = exercises.map((exercise, index) => {
    const alternatives = exercise.alternatives || [];

    return `
      <article class="plan-add-exercise-card">
        <div class="plan-add-exercise-main">
          <div class="plan-add-exercise-title">${index + 1}. ${escapeHtml(exercise.name)}</div>
          <div class="plan-add-exercise-meta">
            ${exercise.sets} Sätze · ${exercise.repsMin}-${exercise.repsMax} Wdh. · ${exercise.restSeconds}s Pause
          </div>
        </div>


        <div class="plan-add-exercise-bottom">
          <div class="plan-add-action-buttons plan-add-action-buttons-mobile">
            <button class="history-action-btn history-action-btn-primary edit-exercise-btn" data-index="${index}" type="button">
              Bearbeiten
            </button>

            <button class="history-action-btn history-action-btn-danger delete-exercise-btn" data-index="${index}" type="button">
              Löschen
            </button>
          </div>

          <div class="plan-add-mini-move-group plan-add-mini-move-group-mobile">
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


        <div class="plan-add-alternative-area">
          <div class="plan-add-alternative-title">Alternativübung</div>

          <button
            class="plan-add-alternative-plus-btn"
            data-index="${index}"
            type="button"
            aria-label="Alternativübung hinzufügen"
          >
            +
          </button>

          ${
            alternatives.length
              ? `
                <div class="plan-add-alternative-list">
                  ${alternatives.map((alternative, altIndex) => `
                    <div class="plan-add-alternative-item">
                      <div>
                        <div class="plan-add-alternative-name">
                          ${escapeHtml(alternative.name)}
                        </div>

                        <div class="plan-add-alternative-meta">
                          ${alternative.sets} Sätze · ${alternative.repsMin}-${alternative.repsMax} Wdh. · ${alternative.restSeconds}s Pause
                        </div>
                      </div>

                      <div class="plan-add-alternative-actions">
                        <button
                          class="plan-add-alternative-edit-btn"
                          data-index="${index}"
                          data-alt-index="${altIndex}"
                          type="button"
                        >
                          Bearbeiten
                        </button>

                        <button
                          class="plan-add-alternative-delete-btn"
                          data-index="${index}"
                          data-alt-index="${altIndex}"
                          type="button"
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `
              : `
                <div class="plan-add-alternative-empty">
                  Noch keine Alternativübung hinzugefügt.
                </div>
              `
          }
        </div>

        
      </article>
    `;
  }).join('');

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

  document.querySelectorAll('.plan-add-alternative-plus-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      openAlternativeModal(index);
    });
  });

  document.querySelectorAll('.plan-add-alternative-edit-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const altIndex = Number(button.dataset.altIndex);
      openAlternativeModal(index, altIndex);
    });
  });

  document.querySelectorAll('.plan-add-alternative-delete-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const altIndex = Number(button.dataset.altIndex);

      if (!exercises[index]?.alternatives) return;

      exercises[index].alternatives.splice(altIndex, 1);
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

  document.querySelectorAll('.delete-exercise-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      exercises.splice(index, 1);
      renderExercises();
    });
  });
}

/* ------------------------------------------------------------ */
/* Alternative Übungen speichern */
/* ------------------------------------------------------------ */
function buildAlternativeRows(userId, planId) {
  const rows = [];
  const seen = new Set();

  exercises.forEach((exercise) => {
    const mainName = normalizeName(exercise.name);
    const alternatives = exercise.alternatives || [];

    alternatives.forEach((alternative) => {
      const altName = normalizeName(alternative.name);

      if (!mainName || !altName) return;
      if (mainName.toLowerCase() === altName.toLowerCase()) return;

      const key = getAlternativeKey(mainName, altName);
      if (seen.has(key)) return;

      seen.add(key);

      rows.push({
        user_id: userId,
        plan_id: planId,
        main_exercise_name: mainName,
        alternative_exercise_name: altName,
        sets: Number(alternative.sets || exercise.sets || 3),
        reps_min: Number(alternative.repsMin || exercise.repsMin || 1),
        reps_max: Number(alternative.repsMax || exercise.repsMax || 1),
        rest_seconds: Number(alternative.restSeconds ?? exercise.restSeconds ?? 0),
      });
    });
  });

  return rows;
}

async function saveExerciseAlternatives(userId, planId) {
  const rows = buildAlternativeRows(userId, planId);

  if (rows.length === 0) return null;

  const { data: existingRows, error: existingError } = await supabase
    .from('exercise_alternatives')
    .select('id, main_exercise_name, alternative_exercise_name')
    .eq('user_id', userId);

  if (existingError) {
    console.error('Fehler beim Prüfen vorhandener Alternativen:', existingError);
    return existingError;
  }

  const existingByKey = new Map();

  (existingRows || []).forEach((row) => {
    existingByKey.set(
      getAlternativeKey(row.main_exercise_name, row.alternative_exercise_name),
      row
    );
  });

  const rowsToInsert = [];
  const rowsToUpdate = [];

  rows.forEach((row) => {
    const key = getAlternativeKey(row.main_exercise_name, row.alternative_exercise_name);
    const existing = existingByKey.get(key);

    if (existing) {
      rowsToUpdate.push({
        id: existing.id,
        ...row,
      });
    } else {
      rowsToInsert.push(row);
    }
  });

  if (rowsToInsert.length > 0) {
    const { error } = await supabase
      .from('exercise_alternatives')
      .insert(rowsToInsert);

    if (error) {
      console.error('Fehler beim Speichern neuer Alternativen:', error);
      return error;
    }
  }

  for (const row of rowsToUpdate) {
    const { error } = await supabase
      .from('exercise_alternatives')
      .update({
        sets: row.sets,
        reps_min: row.reps_min,
        reps_max: row.reps_max,
        rest_seconds: row.rest_seconds,
      })
      .eq('id', row.id);

    if (error) {
      console.error('Fehler beim Aktualisieren einer Alternative:', error);
      return error;
    }
  }

  return null;
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
  const cleanName = normalizeName(exerciseName.value);

  const newExercise = {
    name: cleanName,
    sets: Number(exerciseSets.value),
    repsMin: Number(exerciseRepsMin.value),
    repsMax: Number(exerciseRepsMax.value),
    restSeconds: Number(exerciseRest.value),
    alternatives: editIndex === null ? [] : exercises[editIndex]?.alternatives || [],
  };

  if (!newExercise.name) {
    setStatus(exerciseStatus, 'Bitte gib einen Übungsnamen ein.', 'error');
    return;
  }

  if (!newExercise.sets || newExercise.sets < 1) {
    setStatus(exerciseStatus, 'Bitte gib eine gültige Satzanzahl ein.', 'error');
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

  const cleanPlanName = normalizeName(planName.value);

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

    const alternativeError = await saveExerciseAlternatives(user.id, planData.id);

    if (alternativeError) {
      setStatus(
        planStatus,
        'Trainingsplan wurde gespeichert, aber Alternativübungen konnten nicht gespeichert werden.',
        'error'
      );
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
createAlternativeModal();
guardPage();
renderExercises();