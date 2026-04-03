import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const trainingHeroLabel = document.getElementById('trainingHeroLabel');
const lastTrainingName = document.getElementById('lastTrainingName');
const lastTrainingDate = document.getElementById('lastTrainingDate');

const activeTrainingInline = document.getElementById('activeTrainingInline');
const activeTrainingTime = document.getElementById('activeTrainingTime');
const resumeActiveTraining = document.getElementById('resumeActiveTraining');

let activeDraft = null;
let activeDraftTimerInterval = null;

async function guardPage() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.user) {
    window.location.href = './index.html';
    return null;
  }

  return data.session.user;
}

function formatElapsedTime(startedAtIso) {
  const startedAt = new Date(startedAtIso);
  const diff = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));

  const hours = String(Math.floor(diff / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
  const seconds = String(diff % 60).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

function findAnyActiveTrainingDraft(userId) {
  const prefix = `training-draft-${userId}-`;

  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith(prefix)) continue;

    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      if (parsed && parsed.plan_id && parsed.plan_name && parsed.started_at) {
        return parsed;
      }
    } catch {
      // kaputten Draft ignorieren
    }
  }

  return null;
}

function showActiveTrainingInline(draft) {
  activeDraft = draft;

  if (trainingHeroLabel) {
    trainingHeroLabel.textContent = 'Training läuft';
  }

  if (lastTrainingName) {
    lastTrainingName.textContent = draft.plan_name || 'Training';
  }

  if (lastTrainingDate) {
    lastTrainingDate.textContent = '';
  }

  if (activeTrainingInline && activeTrainingTime) {
    activeTrainingInline.classList.remove('hidden');
    activeTrainingTime.textContent = formatElapsedTime(draft.started_at);
  }

  if (activeDraftTimerInterval) {
    clearInterval(activeDraftTimerInterval);
  }

  activeDraftTimerInterval = setInterval(() => {
    if (!activeDraft?.started_at || !activeTrainingTime) return;
    activeTrainingTime.textContent = formatElapsedTime(activeDraft.started_at);
  }, 1000);
}

function hideActiveTrainingInline() {
  if (trainingHeroLabel) {
    trainingHeroLabel.textContent = 'Letztes Training';
  }

  if (activeTrainingInline) {
    activeTrainingInline.classList.add('hidden');
  }

  if (activeDraftTimerInterval) {
    clearInterval(activeDraftTimerInterval);
    activeDraftTimerInterval = null;
  }
}

async function loadTrainingOverview() {
  const user = await guardPage();
  if (!user) return;

  const draft = findAnyActiveTrainingDraft(user.id);

  if (draft) {
    showActiveTrainingInline(draft);
    return;
  }

  hideActiveTrainingInline();

  const { data, error } = await supabase
    .from('workout_sessions')
    .select('plan_name, training_date, finished_at')
    .eq('user_id', user.id)
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    if (lastTrainingName) {
      lastTrainingName.textContent = 'Noch kein Training';
    }

    if (lastTrainingDate) {
      lastTrainingDate.textContent = 'Sobald du ein Training abschließt, erscheint es hier.';
    }
    return;
  }

  const session = data[0];

  if (lastTrainingName) {
    lastTrainingName.textContent = session.plan_name || 'Training';
  }

  const date = new Date(session.training_date);
  const weekday = date.toLocaleDateString('de-DE', { weekday: 'long' });
  const fullDate = date.toLocaleDateString('de-DE');

  if (lastTrainingDate) {
    lastTrainingDate.textContent = `${weekday}, ${fullDate}`;
  }
}

if (resumeActiveTraining) {
  resumeActiveTraining.addEventListener('click', () => {
    if (!activeDraft?.plan_id) return;
    window.location.href = `./training-session.html?planId=${activeDraft.plan_id}`;
  });
}

loadTrainingOverview();