import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const planList = document.getElementById('planList');
const planListStatus = document.getElementById('planListStatus');
const trainingPlanListCount = document.getElementById('trainingPlanListCount');

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

async function deleteTrainingPlan(planId, button) {
  if (!planId) return;

  button.disabled = true;
  button.textContent = 'Wird gelöscht...';
  setStatus(planListStatus, '');

  try {
    const { error: alternativeDeleteError } = await supabase
      .from('exercise_alternatives')
      .delete()
      .eq('plan_id', planId);

    if (alternativeDeleteError) {
      console.error('Alternativübungen konnten nicht gelöscht werden:', alternativeDeleteError);
      setStatus(planListStatus, 'Alternativübungen konnten nicht gelöscht werden.', 'error');
      return;
    }

    const { error: plannedWorkoutDeleteError } = await supabase
      .from('planned_workouts')
      .delete()
      .eq('plan_id', planId);

    if (plannedWorkoutDeleteError) {
      console.error('Geplante Trainings konnten nicht gelöscht werden:', plannedWorkoutDeleteError);
      setStatus(planListStatus, 'Geplante Trainings konnten nicht gelöscht werden.', 'error');
      return;
    }

    const { error: exerciseDeleteError } = await supabase
      .from('training_plan_exercises')
      .delete()
      .eq('plan_id', planId);

    if (exerciseDeleteError) {
      console.error('Übungen konnten nicht gelöscht werden:', exerciseDeleteError);
      setStatus(planListStatus, 'Übungen konnten nicht gelöscht werden.', 'error');
      return;
    }

    const { error: planDeleteError } = await supabase
      .from('training_plans')
      .delete()
      .eq('id', planId);

    if (planDeleteError) {
      console.error('Trainingsplan konnte nicht gelöscht werden:', planDeleteError);
      setStatus(planListStatus, 'Trainingsplan konnte nicht gelöscht werden.', 'error');
      return;
    }

    await loadPlans();
  } catch (error) {
    console.error('Unerwarteter Fehler beim Löschen:', error);
    setStatus(planListStatus, 'Beim Löschen ist ein Fehler aufgetreten.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Löschen';
  }
}

async function loadPlans() {
  const user = await guardPage();
  if (!user) return;

  const { data, error } = await supabase
    .from('training_plans')
    .select('id, name, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Trainingspläne konnten nicht geladen werden:', error);
    setStatus(planListStatus, 'Trainingspläne konnten nicht geladen werden.', 'error');

    if (trainingPlanListCount) {
      trainingPlanListCount.textContent = '-';
    }

    return;
  }

  const plans = data || [];

  if (trainingPlanListCount) {
    trainingPlanListCount.textContent = String(plans.length);
  }

  if (plans.length === 0) {
    planList.innerHTML = `
      <div class="plan-add-empty-state">
        Noch keine Trainingspläne vorhanden.
      </div>
    `;
    return;
  }

  planList.innerHTML = plans.map((plan) => `
    <article class="training-plan-list-item">
      <div class="training-plan-list-main">
        <div class="training-plan-list-title">${plan.name}</div>
      </div>

      <div class="training-plan-list-actions">
        <a
          class="history-action-btn history-action-btn-primary training-plan-edit-link"
          href="trainingsplan-edit.html?id=${plan.id}"
        >
          Bearbeiten
        </a>

        <button
          class="history-action-btn history-action-btn-danger delete-plan-btn"
          data-id="${plan.id}"
          type="button"
        >
          Löschen
        </button>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.delete-plan-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const planId = button.dataset.id;
      await deleteTrainingPlan(planId, button);
    });
  });
}

loadPlans();