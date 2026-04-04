import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const chartCanvas = document.getElementById('planningChart');
const planningText = document.getElementById('planningText');
const planningCards = document.getElementById('planningCards');
const planningInsights = document.getElementById('planningInsights');

let chart = null;
let currentRange = 'last';

async function getUser() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.user) {
    window.location.href = './index.html';
    return null;
  }

  return data.session.user;
}

function getLocalDateString(date = new Date()) {
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

function getWeekStart(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const mondayDistance = day === 0 ? 6 : day - 1;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - mondayDistance);
  return copy;
}

function getWeekKey(dateString) {
  return getLocalDateString(getWeekStart(parseLocalDate(dateString)));
}

function getDateWeeksAgo(weeks) {
  const date = new Date();
  date.setDate(date.getDate() - (weeks * 7));
  date.setHours(0, 0, 0, 0);
  return getLocalDateString(date);
}

function getWeekdayName(dateString) {
  return parseLocalDate(dateString).toLocaleDateString('de-DE', { weekday: 'long' });
}

function calculateLongestStreak(plans) {
  if (!plans.length) return 0;

  const sorted = [...plans].sort((a, b) => a.planned_date.localeCompare(b.planned_date));

  let best = 0;
  let current = 0;

  for (const item of sorted) {
    if (item.status === 'completed') {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }

  return best;
}

function calculateCurrentStreak(plans) {
  if (!plans.length) return 0;

  const sorted = [...plans].sort((a, b) => a.planned_date.localeCompare(b.planned_date));

  let current = 0;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (sorted[i].status === 'completed') {
      current += 1;
    } else {
      break;
    }
  }

  return current;
}

function getBestAndWorstDays(plans) {
  const completedByDay = new Map();
  const missedByDay = new Map();

  for (const item of plans) {
    const weekday = getWeekdayName(item.planned_date);

    if (item.status === 'completed') {
      completedByDay.set(weekday, (completedByDay.get(weekday) || 0) + 1);
    }

    if (item.status === 'missed') {
      missedByDay.set(weekday, (missedByDay.get(weekday) || 0) + 1);
    }
  }

  let bestDay = '-';
  let bestCount = -1;
  for (const [day, count] of completedByDay.entries()) {
    if (count > bestCount) {
      bestDay = day;
      bestCount = count;
    }
  }

  let worstDay = '-';
  let worstCount = -1;
  for (const [day, count] of missedByDay.entries()) {
    if (count > worstCount) {
      worstDay = day;
      worstCount = count;
    }
  }

  return { bestDay, worstDay };
}

async function loadPlanningData() {
  const user = await getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('planned_workouts')
    .select('planned_date, status')
    .eq('user_id', user.id)
    .order('planned_date', { ascending: true });

  if (error) {
    console.error('Fehler beim Laden der Planung:', error);
    return [];
  }

  return data || [];
}

function filterPlans(plans) {
  if (currentRange === 'last') {
    const start = getDateWeeksAgo(1);
    return plans.filter((item) => item.planned_date >= start);
  }

  if (currentRange === 'month') {
    const start = getDateWeeksAgo(4);
    return plans.filter((item) => item.planned_date >= start);
  }

  return plans;
}

function buildChartData(filteredPlans) {
  if (currentRange === 'last') {
    const planned = filteredPlans.length;
    const completed = filteredPlans.filter((item) => item.status === 'completed').length;

    return {
      type: 'bar',
      labels: ['Geplant', 'Abgeschlossen'],
      plannedValues: [planned, completed],
      completedValues: [],
    };
  }

  const weekMap = new Map();

  for (const item of filteredPlans) {
    const weekKey = getWeekKey(item.planned_date);

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, { planned: 0, completed: 0 });
    }

    const current = weekMap.get(weekKey);
    current.planned += 1;

    if (item.status === 'completed') {
      current.completed += 1;
    }
  }

  const entries = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return {
    type: 'line',
    labels: entries.map(([weekKey]) => formatShortDate(weekKey)),
    plannedValues: entries.map(([, values]) => values.planned),
    completedValues: entries.map(([, values]) => values.completed),
  };
}

function renderChart(filteredPlans) {
  if (chart) chart.destroy();

  if (!filteredPlans.length) {
    planningText.textContent = 'Noch keine geplanten Trainings vorhanden.';
    return;
  }

  const chartData = buildChartData(filteredPlans);

  if (chartData.type === 'bar') {
    chart = new Chart(chartCanvas, {
      type: 'bar',
      data: {
        labels: chartData.labels,
        datasets: [
          {
            label: 'Einheiten',
            data: chartData.plannedValues,
            borderWidth: 2,
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
              font: { size: 13, weight: '700' },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#cbd5e1' },
            grid: { color: 'rgba(255,255,255,0.06)' },
          },
          y: {
            ticks: { color: '#cbd5e1', stepSize: 1 },
            grid: { color: 'rgba(255,255,255,0.06)' },
            beginAtZero: true,
          },
        },
      },
    });
  } else {
    chart = new Chart(chartCanvas, {
      type: 'line',
      data: {
        labels: chartData.labels,
        datasets: [
          {
            label: 'Geplant',
            data: chartData.plannedValues,
            tension: 0.3,
            borderWidth: 3,
            pointRadius: 4,
            pointHoverRadius: 5,
          },
          {
            label: 'Abgeschlossen',
            data: chartData.completedValues,
            tension: 0.3,
            borderWidth: 3,
            pointRadius: 4,
            pointHoverRadius: 5,
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
              font: { size: 13, weight: '700' },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#cbd5e1' },
            grid: { color: 'rgba(255,255,255,0.06)' },
          },
          y: {
            ticks: { color: '#cbd5e1', stepSize: 1 },
            grid: { color: 'rgba(255,255,255,0.06)' },
            beginAtZero: true,
          },
        },
      },
    });
  }

  const plannedCount = filteredPlans.length;
  const completedCount = filteredPlans.filter((item) => item.status === 'completed').length;
  const completionRate = plannedCount > 0 ? Math.round((completedCount / plannedCount) * 100) : 0;

  planningText.innerHTML = `Du hast <span class="statistics-text-neutral">${completedCount}</span> von <span class="statistics-text-neutral">${plannedCount}</span> geplanten Trainings abgeschlossen. Planerfüllung: <span class="statistics-trend-positive">${completionRate}%</span>.`;
}

function renderCards(allPlans, filteredPlans) {
  const currentStreak = calculateCurrentStreak(allPlans);
  const bestStreak = calculateLongestStreak(allPlans);
  const plannedCount = filteredPlans.length;
  const completedCount = filteredPlans.filter((item) => item.status === 'completed').length;
  const missedCount = filteredPlans.filter((item) => item.status === 'missed').length;
  const completionRate = plannedCount > 0 ? Math.round((completedCount / plannedCount) * 100) : 0;

  planningCards.innerHTML = `
    <div class="statistics-mini-card statistics-mini-card-modern fade-up-item fade-up-delay-1">
      <div class="statistics-mini-label">Aktuelle Live Streak</div>
      <div class="statistics-mini-value statistics-trend-positive">${currentStreak}</div>
    </div>

    <div class="statistics-mini-card statistics-mini-card-modern fade-up-item fade-up-delay-2">
      <div class="statistics-mini-label">Beste Live Streak</div>
      <div class="statistics-mini-value statistics-trend-positive">${bestStreak}</div>
    </div>

    <div class="statistics-mini-card statistics-mini-card-modern fade-up-item fade-up-delay-3">
      <div class="statistics-mini-label">Planerfüllung</div>
      <div class="statistics-mini-value ${completionRate >= 70 ? 'statistics-trend-positive' : completionRate >= 40 ? 'statistics-trend-warning' : 'statistics-trend-negative'}">${completionRate}%</div>
    </div>

    <div class="statistics-mini-card statistics-mini-card-modern fade-up-item fade-up-delay-4">
      <div class="statistics-mini-label">Verpasste Trainings</div>
      <div class="statistics-mini-value ${missedCount > 0 ? 'statistics-trend-negative' : 'statistics-trend-warning'}">${missedCount}</div>
    </div>
  `;
}

function renderInsights(filteredPlans) {
  const { bestDay, worstDay } = getBestAndWorstDays(filteredPlans);

  planningInsights.innerHTML = `
    <div class="statistics-mini-card statistics-mini-card-modern fade-up-item fade-up-delay-1">
      <div class="statistics-mini-label">Bester Trainingstag</div>
      <div class="statistics-mini-value statistics-trend-positive">${bestDay}</div>
    </div>

    <div class="statistics-mini-card statistics-mini-card-modern fade-up-item fade-up-delay-2">
      <div class="statistics-mini-label">Häufigster Ausfalltag</div>
      <div class="statistics-mini-value ${worstDay === '-' ? 'statistics-trend-warning' : 'statistics-trend-negative'}">${worstDay}</div>
    </div>
  `;
}

function updateActiveButtons() {
  document.querySelectorAll('#planningRangeSwitch button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.range === currentRange);
  });
}

async function init() {
  const allPlans = await loadPlanningData();
  const filteredPlans = filterPlans(allPlans);

  renderChart(filteredPlans);
  renderCards(allPlans, filteredPlans);
  renderInsights(filteredPlans);
  updateActiveButtons();
}

document.querySelectorAll('#planningRangeSwitch button').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentRange = btn.dataset.range;
    init();
  });
});

init();