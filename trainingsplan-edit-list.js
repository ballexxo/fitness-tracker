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

async function loadPlans() {
  const user = await guardPage();
  if (!user) return;

  const { data, error } = await supabase
    .from('training_plans')
    .select('id, name, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    setStatus(planListStatus, 'Trainingspläne konnten nicht geladen werden.', 'error');
    if (trainingPlanListCount) trainingPlanListCount.textContent = '-';
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
        <a class="history-action-btn history-action-btn-primary training-plan-edit-link" href="trainingsplan-edit.html?id=${plan.id}">
          Bearbeiten
        </a>

        <button class="history-action-btn history-action-btn-danger delete-plan-btn" data-id="${plan.id}" type="button">
          Löschen
        </button>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.delete-plan-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const planId = button.dataset.id;

      const { error: deleteError } = await supabase
        .from('training_plans')
        .delete()
        .eq('id', planId);

      if (deleteError) {
        setStatus(planListStatus, 'Trainingsplan konnte nicht gelöscht werden.', 'error');
        return;
      }

      await loadPlans();
    });
  });
}

loadPlans();