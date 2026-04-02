import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const currentWeekday = document.getElementById('currentWeekday');
const currentDate = document.getElementById('currentDate');
const logoutBtn = document.getElementById('logoutBtn');
const plannerDashboardContent = document.getElementById('plannerDashboardContent');

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

function formatDate(dateString) {
  const date = parseLocalDate(dateString);
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function getRelativeText(dateString) {
  const today = parseLocalDate(getLocalDateString());
  const target = parseLocalDate(dateString);

  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Heute';
  if (diffDays === 1) return 'Morgen';
  return formatDate(dateString);
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

async function guardPage() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.user) {
    window.location.href = './index.html';
    return null;
  }

  return data.session.user;
}

async function loadUser() {
  const user = await guardPage();
  if (!user) return null;
  return user;
}

function loadDateBox() {
  const now = new Date();

  currentWeekday.textContent = now.toLocaleDateString('de-DE', {
    weekday: 'long',
  });

  currentDate.textContent = now.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

async function markMissedPlannedWorkouts(userId) {
  const today = getLocalDateString();

  const { error } = await supabase
    .from('planned_workouts')
    .update({ status: 'missed' })
    .eq('user_id', userId)
    .eq('status', 'planned')
    .lt('planned_date', today);

  if (error) {
    console.error('Fehler beim Markieren von missed Trainings:', error);
  }
}

async function getProfileState(userId) {
  const { data, error } = await supabase
    .from('user_profile_data')
    .select('current_weight_kg, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Fehler beim Laden der Profildaten:', error);
    return null;
  }

  return data || null;
}

function isDateInCurrentWeek(dateString) {
  if (!dateString) return false;

  const { monday, sunday } = getWeekBounds();
  const test = parseLocalDate(dateString);

  monday.setHours(0, 0, 0, 0);
  sunday.setHours(23, 59, 59, 999);

  return test >= monday && test <= sunday;
}

function createSummarySection(label, value, extraClass = '') {
  return `
    <div class="dashboard-summary-section ${extraClass}">
      <div class="dashboard-summary-line">
        <span>${label}</span>
      </div>
      <div class="dashboard-summary-value">${value}</div>
    </div>
  `;
}

function createSummaryTextSection(label, text) {
  return `
    <div class="dashboard-summary-section dashboard-summary-section-text">
      <div class="dashboard-summary-line">
        <span>${label}</span>
      </div>
      <div class="dashboard-summary-text">${text}</div>
    </div>
  `;
}

async function getDashboardReminderHtml(userId) {
  const profile = await getProfileState(userId);

  if (!profile || !profile.current_weight_kg) {
    return `
      <div class="dashboard-summary-reminder">
        <div class="dashboard-summary-reminder-text">
          <span class="dashboard-summary-reminder-icon">⚠</span>
          <span>Bitte trage zuerst deine persönlichen Daten ein.</span>
        </div>
        <a class="dashboard-summary-reminder-btn" href="personal-data-form.html">
          Jetzt eintragen
        </a>
      </div>
    `;
  }

  const { monday } = getWeekBounds();
  const currentWeekStart = getLocalDateString(monday);

  const { data: weeklyReport, error } = await supabase
    .from('weekly_weight_reports')
    .select('week_start_date')
    .eq('user_id', userId)
    .eq('week_start_date', currentWeekStart)
    .maybeSingle();

  if (error) {
    console.error('Fehler beim Laden des Wochenberichts:', error);
    return '';
  }

  if (weeklyReport) {
    return '';
  }

  const updatedAtDateString = profile.updated_at
    ? getLocalDateString(new Date(profile.updated_at))
    : null;

  if (updatedAtDateString && isDateInCurrentWeek(updatedAtDateString)) {
    return '';
  }

    return `
    <div class="dashboard-summary-reminder dashboard-summary-reminder-warning">
      <div class="dashboard-summary-reminder-text">
        <span class="dashboard-summary-reminder-icon">⚠</span>
        <span>Bitte aktualisiere deinen Wochenbericht.</span>
      </div>
      <a class="dashboard-summary-reminder-btn" href="weekly-report.html">
        Aktualisieren
      </a>
    </div>
  `;
}

async function renderEmptyPlanningState(userId) {
  const reminderHtml = await getDashboardReminderHtml(userId);

  plannerDashboardContent.innerHTML = `
    <div class="dashboard-summary-content">
      ${createSummarySection('Live Streak', '0')}

      <div class="dashboard-summary-section dashboard-summary-section-text">
        <div class="dashboard-summary-line">
          <span>Status</span>
        </div>
        <div class="dashboard-summary-text">
          Plane dein Training, um deine Streak zu starten.
        </div>
      </div>

      <div class="dashboard-summary-actions">
        <a class="dashboard-summary-primary-btn" href="training-planner.html">
          Training planen
        </a>
      </div>

      ${reminderHtml}
    </div>
  `;
}

async function renderPlanningState(
  userId,
  { streak, completedThisWeek, totalThisWeek, nextWorkout, todayWorkout }
) {
  const reminderHtml = await getDashboardReminderHtml(userId);

  const nextWorkoutText = nextWorkout
    ? `
  <span class="next-training-date">${getRelativeText(nextWorkout.planned_date)}</span>
  <span class="next-training-separator">·</span>
  <span class="next-training-name">${nextWorkout.plan_name}</span>
`
    : 'Kein weiteres Training geplant';

  plannerDashboardContent.innerHTML = `
    <div class="dashboard-summary-content">
      ${createSummarySection('Live Streak', `${streak}`)}

      ${createSummarySection(
        'Diese Woche absolvierte Trainings',
        `${completedThisWeek}/${totalThisWeek}`
      )}

      ${createSummaryTextSection('Nächstes Training', nextWorkoutText)}

      ${
        todayWorkout
          ? `
            <div class="dashboard-summary-actions">
              <a class="dashboard-summary-primary-btn" href="training-session.html?planId=${todayWorkout.plan_id}">
                Training starten
              </a>
            </div>
          `
          : ''
      }

      ${reminderHtml}
    </div>
  `;
}

async function loadPlanningDashboard(user) {
  const today = getLocalDateString();
  const { monday, sunday } = getWeekBounds();
  const mondayString = getLocalDateString(monday);
  const sundayString = getLocalDateString(sunday);

  await markMissedPlannedWorkouts(user.id);

  const { data, error } = await supabase
    .from('planned_workouts')
    .select('id, plan_id, plan_name, planned_date, status')
    .eq('user_id', user.id)
    .order('planned_date', { ascending: true });

  if (error) {
    console.error('Fehler beim Laden der Planung:', error);
    plannerDashboardContent.innerHTML = `
      <div class="dashboard-summary-text">Planung konnte nicht geladen werden.</div>
    `;
    return;
  }

  const plans = data || [];

  if (!plans.length) {
    await renderEmptyPlanningState(user.id);
    return;
  }

  const weekPlans = plans.filter((item) => (
    item.planned_date >= mondayString &&
    item.planned_date <= sundayString
  ));

  const completedThisWeek = weekPlans.filter((item) => item.status === 'completed').length;
  const totalThisWeek = weekPlans.length;

  const pastAndToday = plans
    .filter((item) => item.planned_date <= today)
    .sort((a, b) => (a.planned_date < b.planned_date ? 1 : -1));

  let streak = 0;
  for (const item of pastAndToday) {
    if (item.status === 'completed') {
      streak += 1;
    } else {
      break;
    }
  }

  const nextWorkout = plans.find((item) => (
    item.planned_date >= today && item.status === 'planned'
  ));

  const todayWorkout = plans.find((item) => (
    item.planned_date === today && item.status === 'planned'
  ));

  await renderPlanningState(user.id, {
    streak,
    completedThisWeek,
    totalThisWeek,
    nextWorkout,
    todayWorkout,
  });
}

async function handleLogout() {
  await supabase.auth.signOut();
  window.location.replace('./index.html');
}

logoutBtn.addEventListener('click', handleLogout);

(async function initDashboard() {
  const user = await loadUser();
  if (!user) return;

  loadDateBox();
  await loadPlanningDashboard(user);
})();