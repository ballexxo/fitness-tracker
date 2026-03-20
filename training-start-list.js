import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const trainingPlanList = document.getElementById('trainingPlanList');
const trainingPlanListStatus = document.getElementById('trainingPlanListStatus');

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
    setStatus(trainingPlanListStatus, 'Trainingspläne konnten nicht geladen werden.', 'error');
    return;
  }

  if (!data || data.length === 0) {
    trainingPlanList.innerHTML = '<p class="muted">Noch keine Trainingspläne vorhanden.</p>';
    return;
  }

  trainingPlanList.innerHTML = data.map((plan) => `
    <div class="exercise-item">
      <div>
        <strong>${plan.name}</strong>
      </div>

      <div class="exercise-actions training-plan-actions">
        <a class="main-button small-action-button" href="training-session.html?planId=${plan.id}">Start</a>
        <a class="manual-entry-button small-action-button" href="training-manual-entry.html?planId=${plan.id}">Nachtragen</a>
      </div>
    </div>
  `).join('');
}

loadPlans();