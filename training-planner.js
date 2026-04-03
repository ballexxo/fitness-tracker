import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const prevWeekBtn = document.getElementById('prevWeekBtn');
const nextWeekBtn = document.getElementById('nextWeekBtn');
const plannerRangeText = document.getElementById('plannerRangeText');
const plannerStatus = document.getElementById('plannerStatus');
const plannerList = document.getElementById('plannerList');

const plannerModal = document.getElementById('plannerModal');
const plannerModalText = document.getElementById('plannerModalText');
const plannerPlanList = document.getElementById('plannerPlanList');
const closePlannerModalBtn = document.getElementById('closePlannerModalBtn');

let currentUser = null;
let currentWeekOffset = 0;
let allPlans = [];
let selectedDateForModal = null;

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

function getWeekBounds(offset = 0) {
  const now = new Date();
  const currentDay = now.getDay();
  const mondayDistance = currentDay === 0 ? 6 : currentDay - 1;

  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - mondayDistance + offset * 7);

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { monday, sunday };
}

function getDisplayRangeText(monday, sunday) {
  const start = monday.toLocaleDateString('de-DE');
  const end = sunday.toLocaleDateString('de-DE');
  return `${start} - ${end}`;
}

function getDayName(date) {
  return date.toLocaleDateString('de-DE', { weekday: 'long' });
}

function isPastDate(dateString) {
  const today = parseLocalDate(getLocalDateString());
  const compare = parseLocalDate(dateString);
  return compare < today;
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

async function loadPlans() {
  const { data, error } = await supabase
    .from('training_plans')
    .select('id, name, created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    allPlans = [];
    return;
  }

  allPlans = data || [];
}

async function markMissedPlannedWorkouts() {
  const today = getLocalDateString();

  const { error } = await supabase
    .from('planned_workouts')
    .update({ status: 'missed' })
    .eq('user_id', currentUser.id)
    .eq('status', 'planned')
    .lt('planned_date', today);

  if (error) {
    console.error('Fehler beim Markieren von missed Trainings:', error);
  }
}

async function findCompletedSessionForToday(planId) {
  const today = getLocalDateString();

  const { data, error } = await supabase
    .from('workout_sessions')
    .select('id, plan_id, training_date, finished_at')
    .eq('user_id', currentUser.id)
    .eq('plan_id', planId)
    .eq('training_date', today)
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Fehler beim Suchen einer heutigen Session:', error);
    return null;
  }

  return data && data.length > 0 ? data[0] : null;
}

async function upsertPlannedWorkoutForDate(planId, planName, plannedDate) {
  const today = getLocalDateString();
  let status = 'planned';
  let completedSessionId = null;

  if (plannedDate === today) {
    const completedSession = await findCompletedSessionForToday(planId);

    if (completedSession) {
      status = 'completed';
      completedSessionId = completedSession.id;
    }
  }

  const { error } = await supabase
    .from('planned_workouts')
    .upsert({
      user_id: currentUser.id,
      plan_id: planId,
      plan_name: planName,
      planned_date: plannedDate,
      status,
      completed_session_id: completedSessionId,
    }, { onConflict: 'user_id,planned_date' });

  return { error };
}

function openPlannerModal(dateString) {
  selectedDateForModal = dateString;
  openModal(plannerModal);

  plannerModalText.textContent = `Plane dein Training für ${formatDate(dateString)}.`;

  if (!allPlans.length) {
    plannerPlanList.innerHTML = '<p class="muted">Noch keine Trainingspläne vorhanden.</p>';
    return;
  }

  plannerPlanList.innerHTML = allPlans.map((plan) => `
    <button class="planner-plan-option choose-plan-btn" data-id="${plan.id}" data-name="${plan.name}" type="button">
      <span class="planner-plan-option-title">${plan.name}</span>
      <img class="nav-chevron-img" src="icon-chevron.svg" alt="">
    </button>
  `).join('');

  document.querySelectorAll('.choose-plan-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const planId = button.dataset.id;
      const planName = button.dataset.name;

      if (!selectedDateForModal) return;

      const { error } = await upsertPlannedWorkoutForDate(planId, planName, selectedDateForModal);

      if (error) {
        console.error(error);
        setStatus(plannerStatus, 'Training konnte nicht geplant werden.', 'error');
        return;
      }

      closePlannerModal();
      await loadPlanner();
    });
  });
}

function closePlannerModal() {
  closeModal(plannerModal);
  selectedDateForModal = null;
  plannerPlanList.innerHTML = '';
}

function getPlannerStatusMeta(status) {
  if (status === 'completed') {
    return {
      className: 'planner-status-completed',
      label: 'Abgeschlossen',
    };
  }

  if (status === 'missed') {
    return {
      className: 'planner-status-missed',
      label: 'Nicht abgeschlossen',
    };
  }

  return {
    className: 'planner-status-planned',
    label: 'Geplant',
  };
}

async function loadPlanner() {
  await guardPage();
  await loadPlans();
  await markMissedPlannedWorkouts();

  const { monday, sunday } = getWeekBounds(currentWeekOffset);
  const mondayString = getLocalDateString(monday);
  const sundayString = getLocalDateString(sunday);

  plannerRangeText.textContent = getDisplayRangeText(monday, sunday);
  setStatus(plannerStatus, '');

  const { data, error } = await supabase
    .from('planned_workouts')
    .select('id, plan_id, plan_name, planned_date, status, completed_session_id')
    .eq('user_id', currentUser.id)
    .gte('planned_date', mondayString)
    .lte('planned_date', sundayString)
    .order('planned_date', { ascending: true });

  if (error) {
    console.error(error);
    setStatus(plannerStatus, 'Planung konnte nicht geladen werden.', 'error');
    return;
  }

  const plannedMap = new Map();
  (data || []).forEach((item) => {
    plannedMap.set(item.planned_date, item);
  });

  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    days.push(date);
  }

  plannerList.innerHTML = days.map((date) => {
    const dateString = getLocalDateString(date);
    const planned = plannedMap.get(dateString);
    const past = isPastDate(dateString);

    if (!planned) {
      return `
        <article class="planner-day-card">
          <div class="planner-day-top">
            <div>
              <div class="planner-day-title">${getDayName(date)}</div>
              <div class="planner-day-date">${date.toLocaleDateString('de-DE')}</div>
            </div>

            ${
              !past
                ? `<button class="planner-add-btn open-plan-modal-btn" data-date="${dateString}" type="button" aria-label="Training hinzufügen">+</button>`
                : ''
            }
          </div>

          <div class="planner-empty-block">
            <span class="planner-empty-text">Kein Training geplant</span>
          </div>
        </article>
      `;
    }

    const statusMeta = getPlannerStatusMeta(planned.status);
    const canDelete = !past && planned.status === 'planned';

    return `
      <article class="planner-day-card">
        <div class="planner-day-top">
          <div>
            <div class="planner-day-title">${getDayName(date)}</div>
            <div class="planner-day-date">${date.toLocaleDateString('de-DE')}</div>
          </div>

          ${
            canDelete
              ? `<button class="planner-delete-btn delete-planned-btn" data-id="${planned.id}" type="button">Löschen</button>`
              : ''
          }
        </div>

        <div class="planner-entry-card ${statusMeta.className}">
          <div class="planner-entry-name">${planned.plan_name}</div>
          <div class="planner-entry-status">${statusMeta.label}</div>
        </div>
      </article>
    `;
  }).join('');

  document.querySelectorAll('.open-plan-modal-btn').forEach((button) => {
    button.addEventListener('click', () => {
      openPlannerModal(button.dataset.date);
    });
  });

  document.querySelectorAll('.delete-planned-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;

      const { error: deleteError } = await supabase
        .from('planned_workouts')
        .delete()
        .eq('id', id);

      if (deleteError) {
        console.error(deleteError);
        setStatus(plannerStatus, 'Geplantes Training konnte nicht gelöscht werden.', 'error');
        return;
      }

      await loadPlanner();
    });
  });
}

prevWeekBtn.addEventListener('click', async () => {
  currentWeekOffset -= 1;
  await loadPlanner();
});

nextWeekBtn.addEventListener('click', async () => {
  currentWeekOffset += 1;
  await loadPlanner();
});

closePlannerModalBtn.addEventListener('click', closePlannerModal);

plannerModal.addEventListener('click', (event) => {
  if (event.target === plannerModal) {
    closePlannerModal();
  }
});

loadPlanner();