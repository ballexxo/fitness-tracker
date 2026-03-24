import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const weightTrendText = document.getElementById('weightTrendText');
const weightChartCanvas = document.getElementById('weightChart');

const statsWorkoutsWeek = document.getElementById('statsWorkoutsWeek');
const statsCaloriesWeek = document.getElementById('statsCaloriesWeek');
const statsDurationWeek = document.getElementById('statsDurationWeek');
const statsBestStreak = document.getElementById('statsBestStreak');

let weightChartInstance = null;

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

function getDateMonthsAgo(months) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  date.setHours(0, 0, 0, 0);
  return getLocalDateString(date);
}

function getWeekBounds() {
  const now = new Date();
  const currentDay = now.getDay();
  const mondayDistance = currentDay === 0 ? 6 : currentDay - 1;

  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - mondayDistance);

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { monday, sunday };
}

function formatMinutesFromSeconds(totalSeconds) {
  const totalMinutes = Math.round((totalSeconds || 0) / 60);

  if (totalMinutes < 60) {
    return `${totalMinutes} Min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `${hours} Std`;
  }

  return `${hours} Std ${minutes} Min`;
}

async function guardPage() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.user) {
    window.location.href = './index.html';
    return null;
  }

  return data.session.user;
}

function renderTrendText(firstWeight, lastWeight) {
  if (firstWeight == null || lastWeight == null) {
    weightTrendText.textContent = 'Noch nicht genug Daten für eine Auswertung vorhanden.';
    return;
  }

  const difference = Math.round((lastWeight - firstWeight) * 10) / 10;

  if (difference < 0) {
    weightTrendText.innerHTML = `Du hast in den letzten 3 Monaten <span class="statistics-trend-negative">${Math.abs(difference)} kg verloren</span>.`;
    return;
  }

  if (difference > 0) {
    weightTrendText.innerHTML = `Du hast in den letzten 3 Monaten <span class="statistics-trend-positive">${difference} kg zugenommen</span>.`;
    return;
  }

  weightTrendText.innerHTML = 'Dein Gewicht ist in den letzten 3 Monaten stabil geblieben.';
}

function renderWeightChart(labels, values) {
  if (weightChartInstance) {
    weightChartInstance.destroy();
  }

  const ctx = weightChartCanvas.getContext('2d');

  weightChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Gewicht in kg',
          data: values,
          tension: 0.35,
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

async function loadWeightStatistics(userId) {
  const startDate = getDateMonthsAgo(3);

  const { data: weeklyReports, error: weeklyError } = await supabase
    .from('weekly_weight_reports')
    .select('week_start_date, weight_kg')
    .eq('user_id', userId)
    .gte('week_start_date', startDate)
    .order('week_start_date', { ascending: true });

  if (weeklyError) {
    console.error('Fehler beim Laden der Wochenberichte:', weeklyError);
    weightTrendText.textContent = 'Die Statistik konnte nicht geladen werden.';
    return;
  }

  const points = (weeklyReports || [])
    .filter((entry) => entry.weight_kg !== null && entry.weight_kg !== undefined)
    .map((entry) => ({
      date: entry.week_start_date,
      weight: Number(entry.weight_kg),
    }));

  if (points.length === 0) {
    const { data: profile, error: profileError } = await supabase
      .from('user_profile_data')
      .select('current_weight_kg, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (!profileError && profile?.current_weight_kg) {
      points.push({
        date: getLocalDateString(profile.updated_at ? new Date(profile.updated_at) : new Date()),
        weight: Number(profile.current_weight_kg),
      });
    }
  }

  if (points.length === 0) {
    weightTrendText.textContent = 'Noch keine Gewichtsdaten vorhanden.';
    return;
  }

  const labels = points.map((point) => formatShortDate(point.date));
  const values = points.map((point) => point.weight);

  renderWeightChart(labels, values);
  renderTrendText(values[0], values[values.length - 1]);
}

async function loadWeeklyTrainingStats(userId) {
  const { monday, sunday } = getWeekBounds();
  const mondayString = getLocalDateString(monday);
  const sundayString = getLocalDateString(sunday);

  const { data: sessions, error } = await supabase
    .from('workout_sessions')
    .select('id, duration_seconds, calories_burned, training_date, finished_at')
    .eq('user_id', userId)
    .gte('training_date', mondayString)
    .lte('training_date', sundayString)
    .not('finished_at', 'is', null)
    .order('training_date', { ascending: true });

  if (error) {
    console.error('Fehler beim Laden der Wochen-Trainingsdaten:', error);
    statsWorkoutsWeek.textContent = '-';
    statsCaloriesWeek.textContent = '-';
    statsDurationWeek.textContent = '-';
    return;
  }

  const workoutCount = (sessions || []).length;
  const totalCalories = (sessions || []).reduce((sum, session) => sum + Number(session.calories_burned || 0), 0);
  const totalDurationSeconds = (sessions || []).reduce((sum, session) => sum + Number(session.duration_seconds || 0), 0);

  statsWorkoutsWeek.textContent = String(workoutCount);
  statsCaloriesWeek.textContent = totalCalories > 0 ? `${totalCalories} kcal` : '0 kcal';
  statsDurationWeek.textContent = workoutCount > 0 ? formatMinutesFromSeconds(totalDurationSeconds) : '0 Min';
}

function calculateLongestStreak(plans) {
  if (!plans || plans.length === 0) return 0;

  const sorted = [...plans].sort((a, b) => {
    if (a.planned_date < b.planned_date) return -1;
    if (a.planned_date > b.planned_date) return 1;
    return 0;
  });

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

async function loadBestStreak(userId) {
  const { data, error } = await supabase
    .from('planned_workouts')
    .select('planned_date, status')
    .eq('user_id', userId)
    .order('planned_date', { ascending: true });

  if (error) {
    console.error('Fehler beim Laden der Streak-Daten:', error);
    statsBestStreak.textContent = '-';
    return;
  }

  const best = calculateLongestStreak(data || []);
  statsBestStreak.textContent = String(best);
}

async function initStatistics() {
  const user = await guardPage();
  if (!user) return;

  await loadWeightStatistics(user.id);
  await loadWeeklyTrainingStats(user.id);
  await loadBestStreak(user.id);
}

initStatistics();