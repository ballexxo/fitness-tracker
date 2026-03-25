import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const trainingPlanTabs = document.getElementById('trainingPlanTabs');
const trainingVolumeCanvas = document.getElementById('trainingVolumeChart');
const trainingVolumeText = document.getElementById('trainingVolumeText');
const topProgressionList = document.getElementById('topProgressionList');

let volumeChartInstance = null;
let currentUserId = null;
let currentChartRange = 'last';
let currentTopRange = 'last';
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

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatShortDate(dateString) {
  const date = parseLocalDate(dateString);
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
  });
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

function renderChart(type, labels, values) {
  if (volumeChartInstance) {
    volumeChartInstance.destroy();
  }

  const ctx = trainingVolumeCanvas.getContext('2d');

  volumeChartInstance = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [
        {
          label: 'Volumen (kg)',
          data: values,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: type === 'line' ? 4 : 0,
          pointHoverRadius: type === 'line' ? 5 : 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#ffffff',
            font: {
              size: 13,
              weight: '700',
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#cbd5e1',
          },
          grid: {
            color: 'rgba(255,255,255,0.06)',
          },
        },
        y: {
          ticks: {
            color: '#cbd5e1',
          },
          grid: {
            color: 'rgba(255,255,255,0.06)',
          },
        },
      },
    },
  });
}

function getDiffText(first, last, label) {
  if (first <= 0) {
    return 'Noch nicht genug Daten für eine Auswertung vorhanden.';
  }

  const diff = ((last - first) / first) * 100;
  const rounded = Math.round(diff * 10) / 10;

  if (rounded > 0) {
    return `${label}: <span class="statistics-trend-positive">+${rounded}% gestiegen</span>`;
  }

  if (rounded < 0) {
    return `${label}: <span class="statistics-trend-negative">${rounded}% gesunken</span>`;
  }

  return `${label}: stabil geblieben`;
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
      await loadTrainingVolumeChart();
    });
  });
}

async function getPlanSessionData() {
  if (!selectedPlanId) return [];

  const { data: sessions, error } = await supabase
    .from('workout_sessions')
    .select('id, training_date, finished_at')
    .eq('user_id', currentUserId)
    .eq('plan_id', selectedPlanId)
    .not('finished_at', 'is', null)
    .order('training_date', { ascending: true });

  if (error) {
    console.error('Fehler beim Laden der Sessions:', error);
    return [];
  }

  if (!sessions.length) return [];

  const sessionIds = sessions.map((s) => s.id);

  const { data: exercises, error: exercisesError } = await supabase
    .from('workout_session_exercises')
    .select('id, session_id')
    .in('session_id', sessionIds);

  if (exercisesError) {
    console.error(exercisesError);
    return [];
  }

  const exerciseIds = exercises.map((e) => e.id);
  if (!exerciseIds.length) return [];

  const { data: sets, error: setsError } = await supabase
    .from('workout_session_sets')
    .select('session_exercise_id, reps_done, weight_used')
    .in('session_exercise_id', exerciseIds);

  if (setsError) {
    console.error(setsError);
    return [];
  }

  const exerciseToSessionMap = new Map();
  exercises.forEach((exercise) => {
    exerciseToSessionMap.set(exercise.id, exercise.session_id);
  });

  const sessionVolumeMap = new Map();
  sessions.forEach((session) => {
    sessionVolumeMap.set(session.id, 0);
  });

  sets.forEach((setRow) => {
    const sessionId = exerciseToSessionMap.get(setRow.session_exercise_id);
    if (!sessionId) return;

    const reps = Number(setRow.reps_done || 0);
    const weight = Number(setRow.weight_used || 0);
    const current = sessionVolumeMap.get(sessionId) || 0;
    sessionVolumeMap.set(sessionId, current + reps * weight);
  });

  return sessions.map((session) => ({
    id: session.id,
    training_date: session.training_date,
    volume: Math.round(sessionVolumeMap.get(session.id) || 0),
  }));
}

async function loadTrainingVolumeChart() {
  const sessions = await getPlanSessionData();

  if (!sessions.length) {
    trainingVolumeText.textContent = 'Noch keine Trainingsdaten für diesen Trainingsplan vorhanden.';
    if (volumeChartInstance) {
      volumeChartInstance.destroy();
      volumeChartInstance = null;
    }
    return;
  }

  let filtered = [...sessions];

  if (currentChartRange === 'month') {
    const startDate = getDateMonthsAgo(1);
    filtered = filtered.filter((session) => session.training_date >= startDate);
  }

  if (currentChartRange === 'last') {
    filtered = filtered.slice(-2);
  }

  if (!filtered.length) {
    trainingVolumeText.textContent = 'Noch keine Trainingsdaten für diesen Zeitraum vorhanden.';
    if (volumeChartInstance) {
      volumeChartInstance.destroy();
      volumeChartInstance = null;
    }
    return;
  }

  const labels = filtered.map((session, index) => {
    if (currentChartRange === 'last') {
      return index === 0 ? 'Letztes Training' : 'Aktuelles Training';
    }
    return formatShortDate(session.training_date);
  });

  const values = filtered.map((session) => session.volume);

  renderChart(currentChartRange === 'last' ? 'bar' : 'line', labels, values);

  if (currentChartRange === 'last') {
    if (filtered.length < 2) {
      trainingVolumeText.textContent = 'Noch nicht genug Daten für den Vergleich mit dem letzten Training vorhanden.';
      return;
    }
    trainingVolumeText.innerHTML = getDiffText(filtered[0].volume, filtered[1].volume, 'Vergleich zum letzten Training');
    return;
  }

  if (currentChartRange === 'month') {
    trainingVolumeText.innerHTML = getDiffText(values[0], values[values.length - 1], 'Entwicklung im letzten Monat');
    return;
  }

  trainingVolumeText.innerHTML = getDiffText(values[0], values[values.length - 1], 'Entwicklung gesamt');
}

function getCompactTopLine(item) {
  const weightText = item.type === 'weight'
    ? `
      <span class="statistics-compact-label">Gewicht erhöht:</span>
      <span class="statistics-compact-value-green">+${item.value.toFixed(1)} kg</span>
    `
    : `
      <span class="statistics-compact-label">Volumen:</span>
      <span class="${item.value >= 0 ? 'statistics-compact-value-green' : 'statistics-compact-value-red'}">
        ${item.value > 0 ? '+' : ''}${item.value.toFixed(1)}%
      </span>
    `;

  return `
    <span class="statistics-compact-name">${item.exerciseName}</span>
    <span class="statistics-compact-separator">|</span>
    ${weightText}
    <span class="statistics-compact-separator">|</span>
    <span class="statistics-compact-label">Volumen (kg):</span>
    <span class="statistics-compact-value-yellow">${item.previousVolume} kg</span>
    <span class="statistics-compact-arrow">→</span>
    <span class="statistics-compact-value-green">${item.latestVolume} kg</span>
  `;
}

async function getRelevantExerciseEntries(entries, range) {
  const sortedEntries = [...entries].sort((a, b) => {
    const dateA = a.workout_sessions.training_date;
    const dateB = b.workout_sessions.training_date;
    if (dateA < dateB) return -1;
    if (dateA > dateB) return 1;
    return 0;
  });

  if (range === 'last') {
    if (sortedEntries.length < 2) return null;
    return {
      previous: sortedEntries[sortedEntries.length - 2],
      latest: sortedEntries[sortedEntries.length - 1],
    };
  }

  if (range === 'month') {
    const startDate = getDateMonthsAgo(1);
    const filtered = sortedEntries.filter((entry) => entry.workout_sessions.training_date >= startDate);
    if (filtered.length < 2) return null;
    return {
      previous: filtered[0],
      latest: filtered[filtered.length - 1],
    };
  }

  if (range === 'total') {
    if (sortedEntries.length < 2) return null;
    return {
      previous: sortedEntries[0],
      latest: sortedEntries[sortedEntries.length - 1],
    };
  }

  return null;
}

async function loadTopProgressions() {
  const { data: sessionExercises, error } = await supabase
    .from('workout_session_exercises')
    .select(`
      id,
      exercise_name,
      workout_sessions!inner (
        id,
        user_id,
        training_date,
        finished_at
      )
    `)
    .eq('workout_sessions.user_id', currentUserId)
    .not('workout_sessions.finished_at', 'is', null)
    .order('exercise_name', { ascending: true });

  if (error) {
    console.error('Fehler beim Laden der Übungsdaten:', error);
    topProgressionList.innerHTML = '<div class="muted">Progression konnte nicht geladen werden.</div>';
    return;
  }

  const groupedByExercise = new Map();

  (sessionExercises || []).forEach((row) => {
    const name = row.exercise_name;
    if (!groupedByExercise.has(name)) {
      groupedByExercise.set(name, []);
    }
    groupedByExercise.get(name).push(row);
  });

  const progressionResults = [];

  for (const [exerciseName, entries] of groupedByExercise.entries()) {
    const relevant = await getRelevantExerciseEntries(entries, currentTopRange);
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

    if (prevSetsError || latestSetsError) continue;

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
    });
  }

  const topThree = progressionResults
    .filter((item) => item.type !== 'regression')
    .sort((a, b) => {
      if (a.type === 'weight' && b.type !== 'weight') return -1;
      if (a.type !== 'weight' && b.type === 'weight') return 1;
      return b.value - a.value;
    })
    .slice(0, 3);

  if (!topThree.length) {
    topProgressionList.innerHTML = `
      <div class="statistics-top-card compact-top-card">
        <div class="muted">Noch nicht genug Trainingsdaten für diesen Zeitraum vorhanden.</div>
      </div>
    `;
    return;
  }

  topProgressionList.innerHTML = topThree.map((item, index) => `
    <div class="statistics-top-card compact-top-card">
      <div class="statistics-top-center-rank">${index + 1}</div>
      <div class="statistics-top-compact-line">
        ${getCompactTopLine(item)}
      </div>
    </div>
  `).join('');
}

function attachSwitchListeners() {
  document.querySelectorAll('[data-progression-range]').forEach((button) => {
    button.addEventListener('click', async () => {
      currentChartRange = button.dataset.progressionRange;

      const parent = button.parentElement;
      parent.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');

      await loadTrainingVolumeChart();
    });
  });

  document.querySelectorAll('[data-top-range]').forEach((button) => {
    button.addEventListener('click', async () => {
      currentTopRange = button.dataset.topRange;

      const parent = button.parentElement;
      parent.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');

      await loadTopProgressions();
    });
  });
}

async function initTrainingStatistics() {
  const user = await guardPage();
  if (!user) return;

  attachSwitchListeners();
  await loadTrainingPlans();
  await loadTrainingVolumeChart();
  await loadTopProgressions();
}

initTrainingStatistics();