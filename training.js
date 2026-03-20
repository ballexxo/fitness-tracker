import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const lastTrainingName = document.getElementById('lastTrainingName');
const lastTrainingDate = document.getElementById('lastTrainingDate');

async function guardPage() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.user) {
    window.location.href = './index.html';
    return null;
  }

  return data.session.user;
}

async function loadLastTraining() {
  const user = await guardPage();
  if (!user) return;

  const { data, error } = await supabase
    .from('workout_sessions')
    .select('plan_name, training_date, created_at')
    .eq('user_id', user.id)
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    lastTrainingName.textContent = 'Noch kein Training';
    lastTrainingDate.textContent = '-';
    return;
  }

  const session = data[0];
  lastTrainingName.textContent = session.plan_name;

  const date = new Date(session.training_date);
  const weekday = date.toLocaleDateString('de-DE', { weekday: 'long' });
  const fullDate = date.toLocaleDateString('de-DE');

  lastTrainingDate.textContent = `${weekday}, ${fullDate}`;
}

loadLastTraining();