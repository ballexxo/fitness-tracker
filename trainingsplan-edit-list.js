import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const planList = document.getElementById('planList');
const planListStatus = document.getElementById('planListStatus');

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
    return;
  }

  if (!data || data.length === 0) {
    planList.innerHTML = '<p class="muted">Noch keine Trainingspläne vorhanden.</p>';
    return;
  }

  planList.innerHTML = '';

  data.forEach((plan) => {
    const item = document.createElement('div');
    item.className = 'exercise-item';

    item.innerHTML = `
      <div>
        <strong>${plan.name}</strong>
      </div>
      <div class="exercise-actions">
        <a class="pill-button" href="trainingsplan-edit.html?id=${plan.id}">Bearbeiten</a>
        <button class="logout delete-plan-btn" data-id="${plan.id}" type="button">Löschen</button>
      </div>
    `;

    planList.appendChild(item);
  });

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