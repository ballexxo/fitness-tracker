import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const profileForm = document.getElementById('profileForm');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const profileFormStatus = document.getElementById('profileFormStatus');

const profileName = document.getElementById('profileName');
const profileBirthdate = document.getElementById('profileBirthdate');
const profileSex = document.getElementById('profileSex');
const profileHeight = document.getElementById('profileHeight');
const profileWeight = document.getElementById('profileWeight');
const profileGoal = document.getElementById('profileGoal');
const profileDietType = document.getElementById('profileDietType');

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

async function loadExistingProfile() {
  const user = await guardPage();
  if (!user) return;

  const { data, error } = await supabase
    .from('user_profile_data')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return;

  profileName.value = data.display_name || '';
  profileBirthdate.value = data.birthdate || '';
  profileSex.value = data.sex || '';
  profileHeight.value = data.height_cm || '';
  profileWeight.value = data.current_weight_kg || '';
  profileGoal.value = data.goal || '';
  profileDietType.value = data.diet_type || '';
}

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(profileFormStatus, '');

  const user = await guardPage();
  if (!user) return;

  const payload = {
    user_id: user.id,
    display_name: profileName.value.trim(),
    birthdate: profileBirthdate.value,
    sex: profileSex.value,
    height_cm: Number(profileHeight.value),
    current_weight_kg: Number(profileWeight.value),
    goal: profileGoal.value,
    diet_type: profileDietType.value,
    updated_at: new Date().toISOString(),
  };

  if (!payload.display_name) {
    setStatus(profileFormStatus, 'Bitte gib deinen Namen ein.', 'error');
    return;
  }

  saveProfileBtn.disabled = true;
  saveProfileBtn.textContent = 'Wird gespeichert...';

  const { error } = await supabase
    .from('user_profile_data')
    .upsert(payload, { onConflict: 'user_id' });

  if (error) {
    console.error('Fehler beim Speichern:', error);
    setStatus(profileFormStatus, 'Die Daten konnten nicht gespeichert werden.', 'error');
    saveProfileBtn.disabled = false;
    saveProfileBtn.textContent = 'Daten speichern';
    return;
  }

  setStatus(profileFormStatus, 'Die Daten wurden erfolgreich gespeichert.', 'success');

  setTimeout(() => {
    window.location.href = './personal-data.html';
  }, 700);
});

loadExistingProfile();