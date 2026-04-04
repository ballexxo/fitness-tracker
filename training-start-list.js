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

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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
    trainingPlanList.innerHTML = `
      <div class="training-start-empty">
        <div class="training-start-empty-title">Noch keine Trainingspläne vorhanden.</div>
        <div class="training-start-empty-text">
          Erstelle zuerst einen Trainingsplan, damit du direkt ein Training starten kannst.
        </div>
        <div class="training-start-empty-action">
          <a href="trainingsplan-add.html" class="dashboard-summary-primary-btn">Jetzt erstellen</a>
        </div>
      </div>
    `;
    return;
  }

  trainingPlanList.innerHTML = data.map((plan) => `
    <article class="training-start-plan-card">
      <div class="training-start-plan-top">
        <div class="training-start-plan-name">${escapeHtml(plan.name)}</div>
      </div>

      <div class="training-start-plan-actions">
        <a
          class="training-start-action training-start-action-primary"
          href="training-session.html?planId=${plan.id}"
        >
          Start
        </a>

        <a
          class="training-start-action training-start-action-secondary"
          href="training-manual-entry.html?planId=${plan.id}"
        >
          Nachtragen
        </a>
      </div>
    </article>
  `).join('');
}

loadPlans();