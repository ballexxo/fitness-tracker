import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const trainingPlanCount = document.getElementById('trainingPlanCount');

async function guardPage() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.user) {
    window.location.href = './index.html';
    return null;
  }

  return data.session.user;
}

async function loadTrainingPlanCount(user) {
  const { count, error } = await supabase
    .from('training_plans')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (error) {
    console.error('Fehler beim Laden der Trainingspläne:', error);
    trainingPlanCount.textContent = '-';
    return;
  }

  trainingPlanCount.textContent = String(count ?? 0);
}

(async function initTrainingsplanPage() {
  const user = await guardPage();
  if (!user) return;

  await loadTrainingPlanCount(user);
})();