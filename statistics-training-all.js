import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const trainingPlanTabs = document.getElementById('trainingPlanTabs');
const allExerciseProgressionList = document.getElementById('allExerciseProgressionList');

let currentUserId = null;
let currentProgressionRange = 'last';
let selectedPlanId = null;
let trainingPlans = [];

function getDateMonthsAgo(months) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  date.setHours(0, 0, 0, 0);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

async function guardPage() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.user) {
    window.location.href = './index.html';
    return null;
  }

  currentUserId = data.session.user.id;
  return data.session.user;
}

function calculateStats(sets) {
  let totalVolume = 0;
  let totalReps = 0;
  let weightedWeightSum = 0;

  for (const setRow of sets) {
    const reps = Number(setRow.reps_done || 0);
    const weight = Number(setRow.weight_used || 0);

    totalVolume += reps * weight;
    totalReps += reps;
    weightedWeightSum += weight * reps;
  }

  const avgWeight = totalReps > 0 ? weightedWeightSum / totalReps : 0;

  return {
    volume: totalVolume,
    avgWeight,
  };
}

async function loadTrainingPlans() {
  const { data, error } = await supabase
    .from('training_plans')
    .select('id, name')
    .eq('user_id', currentUserId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Fehler beim Laden der Trainingspläne:', error);
    trainingPlanTabs.innerHTML = '<div class="muted">Trainingspläne konnten nicht geladen werden.</div>';
    return;
  }

  trainingPlans = data || [];

  if (!trainingPlans.length) {
    trainingPlanTabs.innerHTML = '<div class="muted">Noch keine Trainingspläne vorhanden.</div>';
    return;
  }

  if (!selectedPlanId) {
    selectedPlanId = trainingPlans[0].id;
  }

  renderTrainingPlanTabs();
}

function renderTrainingPlanTabs() {
  trainingPlanTabs.innerHTML = trainingPlans.map((plan) => `
    <button
      class="statistics-plan-tab ${plan.id === selectedPlanId ? 'active' : ''}"
      data-plan-id="${plan.id}"
      type="button"
    >
      ${plan.name}
    </button>
  `).join('');

  document.querySelectorAll('.statistics-plan-tab').forEach((button) => {
    button.addEventListener('click', async () => {
      selectedPlanId = button.dataset.planId;
      renderTrainingPlanTabs();
      await loadAllExerciseProgressions();
    });
  });
}

async function getRelevantExerciseEntries(entries) {
  const sortedEntries = [...entries].sort((a, b) => {
    const dateA = a.workout_sessions.training_date;
    const dateB = b.workout_sessions.training_date;

    if (dateA < dateB) return -1;
    if (dateA > dateB) return 1;
    return 0;
  });

  if (currentProgressionRange === 'last') {
    if (sortedEntries.length < 2) return null;
    return {
      previous: sortedEntries[sortedEntries.length - 2],
      latest: sortedEntries[sortedEntries.length - 1],
    };
  }

  if (currentProgressionRange === 'month') {
    const startDate = getDateMonthsAgo(1);
    const filtered = sortedEntries.filter((entry) => entry.workout_sessions.training_date >= startDate);

    if (filtered.length < 2) return null;

    return {
      previous: filtered[0],
      latest: filtered[filtered.length - 1],
    };
  }

  if (currentProgressionRange === 'total') {
    if (sortedEntries.length < 2) return null;
    return {
      previous: sortedEntries[0],
      latest: sortedEntries[sortedEntries.length - 1],
    };
  }

  return null;
}

function getAllExerciseCardHtml(item, index) {
  return `
    <div class="statistics-top-card compact-top-card all-exercise-card">
      <div class="statistics-rank-row">
        <span class="statistics-rank-number">${index + 1}</span>
      </div>

      <div class="statistics-top-name-compact">${item.exerciseName}</div>

      <div class="statistics-top-detail-line">
        <span class="statistics-top-detail-label">Gewicht:</span>
        <span class="${item.type === 'weight' ? 'statistics-top-detail-value-green' : 'statistics-top-detail-value-white'}">
          ${item.type === 'weight' ? `+${item.value.toFixed(1)} kg` : 'gleich'}
        </span>
      </div>

      <div class="statistics-top-detail-line">
        <span class="statistics-top-detail-label">Volumen:</span>
        <span class="statistics-top-detail-value-yellow">${item.previousVolume} kg</span>
        <span class="statistics-top-detail-arrow">→</span>
        <span class="${item.volumeDelta >= 0 ? 'statistics-top-detail-value-green' : 'statistics-top-detail-value-red'}">${item.latestVolume} kg</span>
      </div>
    </div>
  `;
}

async function loadAllExerciseProgressions() {
  if (!selectedPlanId) {
    allExerciseProgressionList.innerHTML = '<div class="muted">Kein Trainingsplan ausgewählt.</div>';
    return;
  }

  const { data: sessionExercises, error } = await supabase
    .from('workout_session_exercises')
    .select(`
      id,
      exercise_name,
      workout_sessions!inner (
        id,
        user_id,
        plan_id,
        training_date,
        finished_at
      )
    `)
    .eq('workout_sessions.user_id', currentUserId)
    .eq('workout_sessions.plan_id', selectedPlanId)
    .not('workout_sessions.finished_at', 'is', null)
    .order('exercise_name', { ascending: true });

  if (error) {
    console.error('Fehler beim Laden der Übungsdaten:', error);
    allExerciseProgressionList.innerHTML = '<div class="muted">Übungen konnten nicht geladen werden.</div>';
    return;
  }

  const groupedByExercise = new Map();

  for (const row of sessionExercises || []) {
    const name = row.exercise_name;
    if (!groupedByExercise.has(name)) {
      groupedByExercise.set(name, []);
    }
    groupedByExercise.get(name).push(row);
  }

  const progressionResults = [];

  for (const [exerciseName, entries] of groupedByExercise.entries()) {
    const relevant = await getRelevantExerciseEntries(entries);
    if (!relevant) continue;

    const { previous, latest } = relevant;

    const { data: previousSets, error: prevSetsError } = await supabase
      .from('workout_session_sets')
      .select('reps_done, weight_used')
      .eq('session_exercise_id', previous.id)
      .order('set_number', { ascending: true });

    const { data: latestSets, error: latestSetsError } = await supabase
      .from('workout_session_sets')
      .select('reps_done, weight_used')
      .eq('session_exercise_id', latest.id)
      .order('set_number', { ascending: true });

    if (prevSetsError || latestSetsError) {
      continue;
    }

    const previousStats = calculateStats(previousSets || []);
    const latestStats = calculateStats(latestSets || []);

    if (previousStats.volume <= 0) continue;

    let type = '';
    let value = 0;

    if (latestStats.avgWeight > previousStats.avgWeight + 0.05) {
      type = 'weight';
      value = latestStats.avgWeight - previousStats.avgWeight;
    } else if (Math.abs(latestStats.avgWeight - previousStats.avgWeight) < 0.1) {
      type = 'volume';
      value = ((latestStats.volume - previousStats.volume) / previousStats.volume) * 100;
    } else {
      type = 'regression';
      value = ((latestStats.volume - previousStats.volume) / previousStats.volume) * 100;
    }

    progressionResults.push({
      exerciseName,
      type,
      value,
      previousVolume: Math.round(previousStats.volume),
      latestVolume: Math.round(latestStats.volume),
      volumeDelta: latestStats.volume - previousStats.volume,
    });
  }

  const sortedResults = progressionResults.sort((a, b) => {
    if (a.type === 'weight' && b.type !== 'weight') return -1;
    if (a.type !== 'weight' && b.type === 'weight') return 1;
    return b.value - a.value;
  });

  if (!sortedResults.length) {
    allExerciseProgressionList.innerHTML = `
      <div class="statistics-top-card compact-top-card">
        <div class="muted">Noch nicht genug Trainingsdaten für diesen Trainingsplan vorhanden.</div>
      </div>
    `;
    return;
  }

  allExerciseProgressionList.innerHTML = sortedResults.map((item, index) => `
    <div class="fade-up-item fade-up-delay-${Math.min(index + 1, 8)}">
      ${getAllExerciseCardHtml(item, index)}
    </div>
  `).join('');
}

function attachSwitchListeners() {
  document.querySelectorAll('[data-progression-range]').forEach((button) => {
    button.addEventListener('click', async () => {
      currentProgressionRange = button.dataset.progressionRange;

      const parent = button.parentElement;
      parent.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');

      await loadAllExerciseProgressions();
    });
  });
}

async function initAllTrainingStatistics() {
  const user = await guardPage();
  if (!user) return;

  attachSwitchListeners();
  await loadTrainingPlans();
  await loadAllExerciseProgressions();
}

initAllTrainingStatistics();